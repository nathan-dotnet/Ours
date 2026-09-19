using Ours.Domain.Common;

namespace Ours.Domain.Entities;

/// <summary>
/// A couple's own named savings goal (Emergency Fund, MP2, Travel, or anything they type) —
/// synced exactly like <see cref="Budget"/>. Follows <see cref="Account"/>'s balance philosophy:
/// there is deliberately no stored "current amount" column. A goal's progress is always the sum
/// of every non-deleted <see cref="Transaction.SavingsGoalId"/>-linked
/// SavingsContribution/SavingsWithdrawal transaction touching it — computed fresh every time
/// (see MoneyCalculator), the same reason Account has no stored balance either.
/// </summary>
public class SavingsGoal : ISyncableEntity
{
    /// <summary>Device-generated (see the mobile UUID convention) — trusted as-is on first create.</summary>
    public Guid Id { get; set; }

    public Guid CoupleId { get; set; }

    public string Name { get; set; } = string.Empty;

    public decimal TargetAmount { get; set; }

    public string Currency { get; set; } = "PHP";

    /// <summary>
    /// This goal's share (0-100) of the monthly Savings allocation during automatic
    /// "Distribute Money" — see DistributionService. Null/0 means the goal is manual-only and
    /// is skipped by automatic distribution; it can still receive money via a direct
    /// SavingsContribution any time. Every active goal's non-null percentage must sum to
    /// exactly 100 among the goals actually included in a given distribution — enforced
    /// server-side at distribution time, not stored as an invariant here (a goal can sit
    /// unconfigured, e.g. right after creation, before the couple assigns it a share).
    /// </summary>
    public decimal? AllocationPercent { get; set; }

    /// <summary>A deactivated goal is hidden from the active Savings tab/distribution but its history (and the row itself) is kept.</summary>
    public bool IsActive { get; set; } = true;

    public Guid CreatedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Guid UpdatedByUserId { get; set; }

    public int Version { get; set; } = 1;

    public bool IsDeleted { get; set; }
}
