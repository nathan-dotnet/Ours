namespace Ours.Domain.Common;

/// <summary>
/// Marker contract for server-side entities that participate in the offline sync pipeline.
/// Mirrors the metadata the mobile SQLite schema keeps for the same record, so the
/// "last valid server write wins" conflict strategy can compare versions consistently.
/// </summary>
public interface ISyncableEntity
{
    Guid Id { get; }
    Guid CoupleId { get; }
    DateTimeOffset UpdatedAt { get; }
    Guid UpdatedByUserId { get; }
    int Version { get; }
    bool IsDeleted { get; }
}
