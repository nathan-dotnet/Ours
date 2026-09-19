namespace Ours.Domain.Entities;

/// <summary>
/// Join row between a user and the couple they belong to. A dedicated table (rather than
/// two nullable user-id columns on Couple) keeps the "max 2 members" rule enforceable with
/// a straightforward count/unique-index check and leaves room for richer membership data later.
/// </summary>
public class CoupleMember
{
    public Guid Id { get; set; }

    public Guid CoupleId { get; set; }
    public Couple Couple { get; set; } = null!;

    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;

    public DateTimeOffset JoinedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// This member's own self-reported monthly income (the Calculator's "Your Income"/"Partner
    /// Income" fields) — null until they've entered one. Decimal pesos, same convention as
    /// Account.OpeningBalance/Transaction.Amount/Budget.Amount (the mobile app converts to/from
    /// its own integer-cents local storage — see utils/money.ts's apiAmountToCents/centsToApiAmount).
    /// Not part of the generic sync pipeline (nothing else on CoupleMember is either); a member
    /// edits only their own value, carried through the couple_profile payload's self-scoped
    /// field — see SyncService.ApplyCoupleProfileChangeAsync and CoupleMemberDto.
    /// </summary>
    public decimal? MonthlyIncome { get; set; }

    /// <summary>
    /// This member's own share (0-100) of the couple's Wants allocation — e.g. "Mine 12%, hers
    /// 8%" of a 20% Wants bucket (see the Money Calculator). Unlike MonthlyIncome, this is
    /// *not* self-scoped: planning the whole split is one joint action typically done from a
    /// single device in one sitting, so a couple_profile push can set either/both members'
    /// share and account at once — see CoupleProfilePayloadDto.MemberWantsAllocations. Null
    /// until configured. The strict "shares must sum to exactly the couple's Wants total" rule
    /// is enforced only at Distribute Money time (see DistributionService), not here — the same
    /// "saved defaults don't need to reconcile with each other, only an actual distribution
    /// does" split MissMeService/SavingsGoal.AllocationPercent already draws.
    /// </summary>
    public decimal? WantsAllocationPercent { get; set; }

    /// <summary>Where this member's own Wants share is credited when distributing — see WantsAllocationPercent.</summary>
    public Guid? WantsAccountId { get; set; }

    /// <summary>
    /// Null while this membership is active. Set when the couple ends (see
    /// CoupleService.LeaveAsync) — kept as a row rather than deleted, so who was in a couple and
    /// when they joined/left stays auditable. The unique index on UserId is filtered to only
    /// active (LeftAt IS NULL) rows, so a past membership never blocks a genuinely new one.
    /// </summary>
    public DateTimeOffset? LeftAt { get; set; }
}
