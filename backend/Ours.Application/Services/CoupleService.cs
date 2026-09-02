using Microsoft.EntityFrameworkCore;
using Ours.Application.Abstractions;
using Ours.Application.Common;
using Ours.Application.DTOs.Couples;
using Ours.Domain.Entities;

namespace Ours.Application.Services;

public class CoupleService(
    IApplicationDbContext db,
    ICurrentUserService currentUser,
    IInviteCodeGenerator inviteCodeGenerator,
    IDateTimeProvider clock,
    AuthService authService)
{
    private const int MaxMembers = 2;

    public async Task<CoupleActionResponseDto> CreateAsync(CancellationToken ct = default)
    {
        var user = await GetCurrentUserAsync(ct);
        if (user.CoupleId is not null)
        {
            throw new ConflictAppException("You already belong to a couple.");
        }

        string code;
        do
        {
            code = inviteCodeGenerator.Generate();
        } while (await db.Couples.AnyAsync(c => c.InviteCode == code, ct));

        var now = clock.UtcNow;
        var couple = new Couple
        {
            Id = Guid.NewGuid(),
            InviteCode = code,
            CreatedByUserId = user.Id,
            CreatedAt = now,
            UpdatedAt = now,
            UpdatedByUserId = user.Id,
            Version = 1,
        };

        db.Couples.Add(couple);
        db.CoupleMembers.Add(new CoupleMember
        {
            Id = Guid.NewGuid(),
            CoupleId = couple.Id,
            UserId = user.Id,
            JoinedAt = now,
        });
        user.CoupleId = couple.Id;

        await db.SaveChangesAsync(ct);

        var dto = ToDto(couple, [new CoupleMemberDto { UserId = user.Id, DisplayName = user.DisplayName, JoinedAt = now }]);
        var auth = await authService.IssueTokensAsync(user, ct);
        return new CoupleActionResponseDto { Couple = dto, Auth = auth };
    }

    public async Task<CoupleActionResponseDto> JoinAsync(JoinCoupleRequestDto request, CancellationToken ct = default)
    {
        var user = await GetCurrentUserAsync(ct);
        if (user.CoupleId is not null)
        {
            throw new ConflictAppException("You already belong to a couple.");
        }

        var normalizedCode = request.InviteCode.Trim().ToUpperInvariant();
        var couple = await db.Couples
            .Include(c => c.Members)
            .ThenInclude(m => m.User)
            .FirstOrDefaultAsync(c => c.InviteCode == normalizedCode && !c.IsDeleted, ct);

        if (couple is null)
        {
            throw new NotFoundAppException("No couple found for that invite code.");
        }

        if (couple.Members.Any(m => m.UserId == user.Id))
        {
            throw new ConflictAppException("You are already a member of this couple.");
        }

        if (couple.Members.Count >= MaxMembers)
        {
            throw new ConflictAppException("This couple already has two members.");
        }

        var now = clock.UtcNow;
        var membership = new CoupleMember
        {
            Id = Guid.NewGuid(),
            CoupleId = couple.Id,
            UserId = user.Id,
            JoinedAt = now,
        };
        db.CoupleMembers.Add(membership);
        user.CoupleId = couple.Id;

        await db.SaveChangesAsync(ct);

        // EF's change-tracker fixup already appended `membership` to the loaded couple.Members
        // collection (and linked membership.User) because both are tracked with matching FKs —
        // mapping straight from it avoids double-counting the member we just added.
        var memberDtos = couple.Members
            .Select(m => new CoupleMemberDto { UserId = m.UserId, DisplayName = m.User.DisplayName, JoinedAt = m.JoinedAt })
            .ToList();

        var dto = ToDto(couple, memberDtos);
        var auth = await authService.IssueTokensAsync(user, ct);
        return new CoupleActionResponseDto { Couple = dto, Auth = auth };
    }

    public async Task<CoupleDto> GetMyCoupleAsync(CancellationToken ct = default)
    {
        var coupleId = currentUser.CoupleId ?? throw new NotFoundAppException("You don't belong to a couple yet.");

        var couple = await db.Couples
            .Include(c => c.Members)
            .ThenInclude(m => m.User)
            .FirstOrDefaultAsync(c => c.Id == coupleId && !c.IsDeleted, ct)
            ?? throw new NotFoundAppException("Couple not found.");

        var memberDtos = couple.Members
            .Select(m => new CoupleMemberDto { UserId = m.UserId, DisplayName = m.User.DisplayName, JoinedAt = m.JoinedAt })
            .ToList();

        return ToDto(couple, memberDtos);
    }

    private async Task<ApplicationUser> GetCurrentUserAsync(CancellationToken ct)
    {
        return await db.Users.FirstOrDefaultAsync(u => u.Id == currentUser.UserId, ct)
            ?? throw new NotFoundAppException("User not found.");
    }

    private static CoupleDto ToDto(Couple couple, IReadOnlyList<CoupleMemberDto> members) => new()
    {
        Id = couple.Id,
        InviteCode = couple.InviteCode,
        Nickname = couple.Nickname,
        AnniversaryDate = couple.AnniversaryDate,
        UpdatedAt = couple.UpdatedAt,
        UpdatedByUserId = couple.UpdatedByUserId,
        Version = couple.Version,
        Members = members,
    };
}
