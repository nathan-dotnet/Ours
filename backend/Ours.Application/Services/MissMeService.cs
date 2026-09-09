using Microsoft.EntityFrameworkCore;
using Ours.Application.Abstractions;
using Ours.Application.Common;
using Ours.Application.DTOs.MissMe;
using Ours.Domain.Entities;

namespace Ours.Application.Services;

/// <summary>
/// The "I miss you" gesture and its "miss you too" reply. Both actions need something the
/// generic offline sync pipeline can't give them — a synchronous, server-enforced cooldown check
/// and an immediate yes/no answer — so, like Vault's reveal, this is a small dedicated service
/// behind its own endpoint rather than a synced entity (see MissMeInteraction's doc comment).
/// Every couple/partner fact here is derived server-side from the caller's own JWT claim and the
/// couple's membership rows — never from anything the client supplies — the same discipline
/// VaultService and SyncService already apply.
/// </summary>
public class MissMeService(IApplicationDbContext db, ICurrentUserService currentUser, IDateTimeProvider clock)
{
    /// <summary>How long a user must wait after a MissMe before sending another one.</summary>
    public static readonly TimeSpan Cooldown = TimeSpan.FromMinutes(30);

    /// <summary>"Little Moments" stays a small personal collection, not a scrolling feed.</summary>
    private const int HistoryLimit = 20;

    public async Task<MissMeStatusResponseDto> GetStatusAsync(CancellationToken ct = default)
    {
        var coupleId = await RequireActiveCoupleAsync(ct);
        var userId = currentUser.UserId;
        var displayNames = await LoadDisplayNamesAsync(coupleId, ct);

        var (canSend, nextAvailableAt) = await GetCooldownStateAsync(coupleId, userId, ct);

        // Interactions that already have a MissYouToo reply are excluded — only an
        // as-yet-unanswered MissMe from the partner should still surface as "pending".
        var repliedToIds = await db.MissMeInteractions
            .Where(m => m.CoupleId == coupleId && m.Type == MissMeInteractionType.MissYouToo && m.InResponseToId != null)
            .Select(m => m.InResponseToId!.Value)
            .ToListAsync(ct);

        var pending = await db.MissMeInteractions
            .Where(m => m.CoupleId == coupleId
                && m.ReceiverUserId == userId
                && m.Type == MissMeInteractionType.MissMe
                && !repliedToIds.Contains(m.Id))
            .OrderByDescending(m => m.CreatedAt)
            .FirstOrDefaultAsync(ct);

        var history = await db.MissMeInteractions
            .Where(m => m.CoupleId == coupleId)
            .OrderByDescending(m => m.CreatedAt)
            .Take(HistoryLimit)
            .ToListAsync(ct);

        return new MissMeStatusResponseDto
        {
            CanSend = canSend,
            NextAvailableAt = nextAvailableAt,
            PendingFromPartner = pending is null ? null : ToDto(pending, displayNames),
            RecentHistory = history.Select(h => ToDto(h, displayNames)).ToList(),
        };
    }

    public async Task<MissMeSendResponseDto> SendAsync(MissMeSendRequestDto request, CancellationToken ct = default)
    {
        if (!MissMeInteractionType.IsValid(request.Type))
        {
            throw new ValidationAppException("Invalid interaction type.");
        }

        var coupleId = await RequireActiveCoupleAsync(ct);
        var userId = currentUser.UserId;
        var displayNames = await LoadDisplayNamesAsync(coupleId, ct);

        var partnerId = displayNames.Keys.FirstOrDefault(id => id != userId);
        if (partnerId == Guid.Empty)
        {
            throw new ValidationAppException("You don't have a partner to send this to yet.");
        }

        return request.Type == MissMeInteractionType.MissMe
            ? await SendMissMeAsync(coupleId, userId, partnerId, displayNames, ct)
            : await SendMissYouTooAsync(coupleId, userId, request.InResponseToId, displayNames, ct);
    }

    private async Task<MissMeSendResponseDto> SendMissMeAsync(
        Guid coupleId, Guid userId, Guid partnerId, IReadOnlyDictionary<Guid, string> displayNames, CancellationToken ct)
    {
        var (canSend, nextAvailableAt) = await GetCooldownStateAsync(coupleId, userId, ct);
        if (!canSend)
        {
            // Withheld, not an error — the button's own cooldown state on the sender's device
            // asked for exactly this outcome; nothing here is exceptional.
            return new MissMeSendResponseDto { Sent = false, NextAvailableAt = nextAvailableAt };
        }

        var interaction = new MissMeInteraction
        {
            Id = Guid.NewGuid(),
            CoupleId = coupleId,
            SenderUserId = userId,
            ReceiverUserId = partnerId,
            Type = MissMeInteractionType.MissMe,
            CreatedAt = clock.UtcNow,
        };
        db.MissMeInteractions.Add(interaction);
        await db.SaveChangesAsync(ct);

        return new MissMeSendResponseDto
        {
            Sent = true,
            NextAvailableAt = interaction.CreatedAt + Cooldown,
            Interaction = ToDto(interaction, displayNames),
        };
    }

    private async Task<MissMeSendResponseDto> SendMissYouTooAsync(
        Guid coupleId, Guid userId, Guid? inResponseToId, IReadOnlyDictionary<Guid, string> displayNames, CancellationToken ct)
    {
        if (inResponseToId is null)
        {
            throw new ValidationAppException("A Miss You Too reply must say which Miss Me it's answering.");
        }

        var original = await db.MissMeInteractions.FirstOrDefaultAsync(
            m => m.Id == inResponseToId && m.Type == MissMeInteractionType.MissMe, ct);
        // Same "wrong id and not-yours look identical" shape as Vault's reveal 404 — nothing about
        // this response should tell a caller whether the id exists at all versus isn't theirs.
        if (original is null || original.CoupleId != coupleId || original.ReceiverUserId != userId)
        {
            throw new NotFoundAppException("Miss Me interaction not found.");
        }

        var existingReply = await db.MissMeInteractions.FirstOrDefaultAsync(
            m => m.InResponseToId == original.Id && m.Type == MissMeInteractionType.MissYouToo, ct);
        if (existingReply is not null)
        {
            // A duplicate tap on "Miss You Too" is idempotent, not an error.
            return new MissMeSendResponseDto { Sent = true, Interaction = ToDto(existingReply, displayNames) };
        }

        var reply = new MissMeInteraction
        {
            Id = Guid.NewGuid(),
            CoupleId = coupleId,
            SenderUserId = userId,
            ReceiverUserId = original.SenderUserId,
            Type = MissMeInteractionType.MissYouToo,
            InResponseToId = original.Id,
            CreatedAt = clock.UtcNow,
        };
        db.MissMeInteractions.Add(reply);
        await db.SaveChangesAsync(ct);

        return new MissMeSendResponseDto { Sent = true, Interaction = ToDto(reply, displayNames) };
    }

    private async Task<(bool CanSend, DateTimeOffset? NextAvailableAt)> GetCooldownStateAsync(Guid coupleId, Guid userId, CancellationToken ct)
    {
        var lastSentAt = await db.MissMeInteractions
            .Where(m => m.CoupleId == coupleId && m.SenderUserId == userId && m.Type == MissMeInteractionType.MissMe)
            .OrderByDescending(m => m.CreatedAt)
            .Select(m => (DateTimeOffset?)m.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (lastSentAt is null)
        {
            return (true, null);
        }

        var nextAvailableAt = lastSentAt.Value + Cooldown;
        var canSend = clock.UtcNow >= nextAvailableAt;
        return (canSend, canSend ? null : nextAvailableAt);
    }

    /// <summary>Same "coupleId always comes from the JWT, an inactive couple is rejected" guard as VaultService.RevealAsync.</summary>
    private async Task<Guid> RequireActiveCoupleAsync(CancellationToken ct)
    {
        var coupleId = currentUser.CoupleId ?? throw new ForbiddenAppException("You must belong to a couple to do this.");
        var isActive = await db.Couples.AnyAsync(c => c.Id == coupleId && !c.IsDeleted, ct);
        if (!isActive)
        {
            throw new ForbiddenAppException("Your couple is no longer active.");
        }
        return coupleId;
    }

    private async Task<IReadOnlyDictionary<Guid, string>> LoadDisplayNamesAsync(Guid coupleId, CancellationToken ct)
    {
        // Explicit Include + materialize, rather than projecting m.User.DisplayName directly:
        // the latter only works via genuine relational query translation (Postgres) and silently
        // null-refs under the EF Core InMemory provider (Ours.Api.Tests's own DbContext), which
        // relies on change-tracker fixup instead of translating navigations into a join.
        var members = await db.CoupleMembers
            .Include(m => m.User)
            .Where(m => m.CoupleId == coupleId && m.LeftAt == null)
            .ToListAsync(ct);
        return members.ToDictionary(m => m.UserId, m => m.User.DisplayName);
    }

    private static MissMeInteractionDto ToDto(MissMeInteraction interaction, IReadOnlyDictionary<Guid, string> displayNames) => new()
    {
        Id = interaction.Id,
        SenderUserId = interaction.SenderUserId,
        SenderDisplayName = displayNames.GetValueOrDefault(interaction.SenderUserId, "Your partner"),
        ReceiverUserId = interaction.ReceiverUserId,
        Type = interaction.Type,
        InResponseToId = interaction.InResponseToId,
        CreatedAt = interaction.CreatedAt,
    };
}
