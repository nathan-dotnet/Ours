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
    /// Null while this membership is active. Set when the couple ends (see
    /// CoupleService.LeaveAsync) — kept as a row rather than deleted, so who was in a couple and
    /// when they joined/left stays auditable. The unique index on UserId is filtered to only
    /// active (LeftAt IS NULL) rows, so a past membership never blocks a genuinely new one.
    /// </summary>
    public DateTimeOffset? LeftAt { get; set; }
}
