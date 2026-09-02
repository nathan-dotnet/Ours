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
}
