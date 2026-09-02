using Ours.Domain.Common;

namespace Ours.Domain.Entities;

/// <summary>
/// A couple-shared calendar event. Phase 2's first real synced feature entity, following the
/// same shape <see cref="Couple"/> established in Phase 1 for the sync pipeline: sync metadata
/// (UpdatedAt/UpdatedByUserId/Version/IsDeleted) alongside the domain fields.
/// </summary>
public class CalendarEvent : ISyncableEntity
{
    /// <summary>Device-generated (see the mobile UUID convention) — trusted as-is on first create.</summary>
    public Guid Id { get; set; }

    public Guid CoupleId { get; set; }

    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    public DateTimeOffset StartAt { get; set; }

    public DateTimeOffset EndAt { get; set; }

    /// <summary>Optional reminder time. Scheduling an actual device notification for it is Phase 6 — this is just the stored value for now.</summary>
    public DateTimeOffset? ReminderAt { get; set; }

    public Guid CreatedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Guid UpdatedByUserId { get; set; }

    public int Version { get; set; } = 1;

    public bool IsDeleted { get; set; }
}
