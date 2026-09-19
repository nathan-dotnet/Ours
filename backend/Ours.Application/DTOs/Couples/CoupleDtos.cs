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
    /// The couple's saved default income-allocation plan (see the Money Calculator) — all six
    /// null until saved once. Validated in SyncService.ApplyCoupleProfileChangeAsync: when all
    /// three percentages are present they must sum to exactly 100, and any account id must
    /// belong to this couple.
    /// </summary>
    [Range(0, 100)]
    public decimal? BudgetAllocationPercent { get; init; }

    [Range(0, 100)]
    public decimal? SavingsAllocationPercent { get; init; }

    [Range(0, 100)]
    public decimal? WantsAllocationPercent { get; init; }

    public Guid? BudgetAccountId { get; init; }
    public Guid? SavingsAccountId { get; init; }

    /// <summary>
    /// Push-only, self-scoped: on a push, applied unconditionally to the *caller's own*
    /// CoupleMember row (never the partner's) — same full-payload-replace semantics as
    /// Nickname/AnniversaryDate, see ApplyCoupleProfileChangeAsync. Absent on a pull, the mirror
    /// image of Members being absent/ignored on a push — each member's income is already
    /// carried per-member in <see cref="Members"/> there instead.
    /// </summary>
    public decimal? MyMonthlyIncome { get; init; }

    /// <summary>
    /// How the Wants bucket splits between the couple's members — e.g. "mine 12%, hers 8%" of a
    /// 20% Wants allocation. Unlike MyMonthlyIncome this is *not* self-scoped: either partner can
    /// set either/both members' share and account in one push, since planning the split is one
    /// joint action typically done from a single device. Only entries present here are updated;
    /// omit a member entirely to leave their existing share/account untouched. See
    /// ApplyCoupleProfileChangeAsync for validation (each entry's UserId must be an active member
    /// of the caller's own couple, and any account id must belong to it) — the strict "shares sum
    /// to the Wants total" rule is enforced only at Distribute Money time, not here.
    /// </summary>
    public IReadOnlyList<MemberWantsAllocationInputDto>? MemberWantsAllocations { get; init; }

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

/// <summary>One member's share of the couple_profile push's Wants split — see CoupleProfilePayloadDto.MemberWantsAllocations.</summary>
public sealed class MemberWantsAllocationInputDto
{
    [Required]
    public Guid UserId { get; init; }

    [Range(0, 100)]
    public decimal? WantsAllocationPercent { get; init; }

    public Guid? WantsAccountId { get; init; }
}

public sealed class CoupleMemberDto
{
    public Guid UserId { get; init; }
    public string DisplayName { get; init; } = string.Empty;
    public DateTimeOffset JoinedAt { get; init; }

    /// <summary>This member's own self-reported monthly income — null until they've entered one. See CoupleMember.MonthlyIncome.</summary>
    public decimal? MonthlyIncome { get; init; }

    /// <summary>This member's own share (0-100) of the couple's Wants allocation — null until configured. See CoupleMember.WantsAllocationPercent.</summary>
    public decimal? WantsAllocationPercent { get; init; }

    /// <summary>Where this member's own Wants share is credited when distributing. See CoupleMember.WantsAccountId.</summary>
    public Guid? WantsAccountId { get; init; }
}

public sealed class CoupleDto
{
    public Guid Id { get; init; }
    public string InviteCode { get; init; } = string.Empty;
    public string? Nickname { get; init; }
    public DateOnly? AnniversaryDate { get; init; }
    public decimal? BudgetAllocationPercent { get; init; }
    public decimal? SavingsAllocationPercent { get; init; }
    public decimal? WantsAllocationPercent { get; init; }
    public Guid? BudgetAccountId { get; init; }
    public Guid? SavingsAccountId { get; init; }
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
