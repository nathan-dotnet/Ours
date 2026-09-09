using System.ComponentModel.DataAnnotations;
using Ours.Application.DTOs.Auth;

namespace Ours.Application.DTOs.Couples;

public sealed class JoinCoupleRequestDto
{
    [Required, MaxLength(20)]
    public string InviteCode { get; init; } = string.Empty;
}

/// <summary>
/// Shape of the "couple_profile" sync payload (see <see cref="Sync.SyncPushItemDto"/>). Couple
/// profile edits always flow through the generic sync push, never a dedicated REST verb — that
/// keeps a single write path whether the device is online or offline.
/// </summary>
public sealed class CoupleProfilePayloadDto
{
    [MaxLength(100)]
    public string? Nickname { get; init; }

    public DateOnly? AnniversaryDate { get; init; }

    /// <summary>
    /// Server-authoritative, populated only in <see cref="Services.SyncService.PullAsync"/> —
    /// a client push never sets or influences this; membership only ever changes through
    /// Create/Join/Leave, never through a couple_profile edit. Included here (rather than a
    /// separate synced entity) specifically so that when a partner joins, the *other* partner's
    /// device — which has no other way to learn about it, since it can't push or poll for a new
    /// member — picks up the change on its next ordinary sync pull.
    /// </summary>
    public IReadOnlyList<CoupleMemberDto>? Members { get; init; }
}

public sealed class CoupleMemberDto
{
    public Guid UserId { get; init; }
    public string DisplayName { get; init; } = string.Empty;
    public DateTimeOffset JoinedAt { get; init; }
}

public sealed class CoupleDto
{
    public Guid Id { get; init; }
    public string InviteCode { get; init; } = string.Empty;
    public string? Nickname { get; init; }
    public DateOnly? AnniversaryDate { get; init; }
    public DateTimeOffset UpdatedAt { get; init; }
    public Guid UpdatedByUserId { get; init; }
    public int Version { get; init; }
    public IReadOnlyList<CoupleMemberDto> Members { get; init; } = [];
}

/// <summary>
/// Returned by create/join: the couple plus a freshly-minted token pair, since the access
/// token's "coupleId" claim only becomes valid once membership exists.
/// </summary>
public sealed class CoupleActionResponseDto
{
    public CoupleDto Couple { get; init; } = null!;
    public AuthResponseDto Auth { get; init; } = null!;
}

public sealed class LeaveCoupleResponseDto
{
    public bool Success { get; init; } = true;

    /// <summary>False when the caller wasn't in an active couple to begin with — an idempotent no-op, not an error.</summary>
    public bool Left { get; init; }
}
