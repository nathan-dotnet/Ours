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

    /// <summary>
    /// Ends the caller's current couple — for both partners, not just the caller. Idempotent: a
    /// user with no active couple gets Left=false rather than an error, so a double-tap or a
    /// retry after a dropped response can't fail loudly.
    ///
    /// No coupleId/partnerId is ever accepted from the client — the caller's own
    /// ApplicationUser.CoupleId (loaded fresh from the DB, not the JWT claim) is the only way
    /// this method knows which couple to end, so it can only ever act on the caller's own.
    /// </summary>
    public async Task<LeaveCoupleResponseDto> LeaveAsync(CancellationToken ct = default)
    {
        var user = await GetCurrentUserAsync(ct);
        if (user.CoupleId is null)
        {
            return new LeaveCoupleResponseDto { Success = true, Left = false };
        }

        var coupleId = user.CoupleId.Value;
        var couple = await db.Couples.FirstOrDefaultAsync(c => c.Id == coupleId, ct);
        if (couple is null || couple.IsDeleted)
        {
            // The user's own pointer disagrees with reality (already-ended couple, or one that
            // somehow doesn't exist) — repair it and treat this as an idempotent no-op rather
            // than an error the mobile app would need special handling for.
            user.CoupleId = null;
            await db.SaveChangesAsync(ct);
            return new LeaveCoupleResponseDto { Success = true, Left = false };
        }

        var now = clock.UtcNow;

        // End every currently-active membership on this couple — the caller's own AND their
        // partner's — not just the row for whoever called this endpoint.
        var activeMembers = await db.CoupleMembers
            .Where(m => m.CoupleId == coupleId && m.LeftAt == null)
            .ToListAsync(ct);
        foreach (var member in activeMembers)
        {
            member.LeftAt = now;
        }

        // Clear every member's CoupleId pointer (not just the caller's): this is both what lets
        // CreateAsync/JoinAsync's "already in a couple" check allow them to pair again, and what
        // makes their *next* issued JWT carry no coupleId claim.
        var memberUserIds = activeMembers.Select(m => m.UserId).ToList();
        var memberUsers = await db.Users.Where(u => memberUserIds.Contains(u.Id)).ToListAsync(ct);
        foreach (var memberUser in memberUsers)
        {
            memberUser.CoupleId = null;
        }

        // Ends the couple itself by reusing the existing IsDeleted sync-tombstone flag, rather
        // than adding a parallel "ended" concept: both partners' next sync pull already turns
        // IsDeleted into a Delete change for couple_profile (see SyncService.PullAsync), which is
        // exactly how a partner who didn't initiate this learns their local couple is gone and
        // cleans it up (see the mobile syncEngine/coupleRepository). GetMyCoupleAsync and
        // JoinAsync's invite-code lookup already filter on !IsDeleted, so this couple/invite code
        // can never be reused going forward either.
        couple.IsDeleted = true;
        couple.UpdatedAt = now;
        couple.UpdatedByUserId = user.Id;
        couple.Version += 1;

        await db.SaveChangesAsync(ct);

        return new LeaveCoupleResponseDto { Success = true, Left = true };
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
