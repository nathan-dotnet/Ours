using Ours.Domain.Common;

namespace Ours.Domain.Entities;

/// <summary>
/// The shared unit that every couple-owned resource hangs off via CoupleId.
/// Exactly two <see cref="CoupleMember"/> rows may reference a given couple (enforced in
/// the application layer, backstopped by a unique index on membership).
///
/// Couple also carries a couple of shared, directly-editable fields (Nickname,
/// AnniversaryDate). Editing them offline is what exercises the generic sync pipeline
/// end-to-end during Phase 1, without pulling forward any Phase 2+ feature domain.
/// </summary>
public class Couple : ISyncableEntity
{
    public Guid Id { get; set; }

    /// <summary>Human-shareable invite code, e.g. "OURS-8K2F".</summary>
    public string InviteCode { get; set; } = string.Empty;

    public Guid CreatedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public string? Nickname { get; set; }

    public DateOnly? AnniversaryDate { get; set; }

    /// <summary>
    /// The couple's saved default income-allocation plan (see the Money Calculator spec) — all
    /// five null until they've saved one. Prefills the Calculator; freely re-editable any time,
    /// never enforced as a hard rule. Edited through the same couple_profile sync payload as
    /// Nickname/AnniversaryDate — see SyncService.ApplyCoupleProfileChangeAsync, which validates
    /// the three percentages sum to 100 (when all three are set) and that each account id
    /// belongs to this couple.
    ///
    /// Wants has no single account of its own here — it's split between the couple's members
    /// instead (each member's own share and destination account — see
    /// CoupleMember.WantsAllocationPercent), so unlike Budget/Savings there's nothing to store
    /// at the couple level for it.
    /// </summary>
    public decimal? BudgetAllocationPercent { get; set; }
    public decimal? SavingsAllocationPercent { get; set; }
    public decimal? WantsAllocationPercent { get; set; }

    public Guid? BudgetAccountId { get; set; }
    public Guid? SavingsAccountId { get; set; }

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Guid UpdatedByUserId { get; set; }

    /// <summary>Incremented on every update; used for last-write-wins comparisons.</summary>
    public int Version { get; set; } = 1;

    public bool IsDeleted { get; set; }

    Guid ISyncableEntity.CoupleId => Id;

    public ICollection<CoupleMember> Members { get; set; } = new List<CoupleMember>();
}
