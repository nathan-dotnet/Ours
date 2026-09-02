using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace Ours.Application.DTOs.Sync;

/// <summary>
/// Mirrors the mobile sync_queue "operation" values. Kept as a shared string enum-like
/// constant set (rather than a numeric enum) so the wire payload stays human-readable
/// and stable across future entity types.
/// </summary>
public static class SyncOperation
{
    public const string Create = "CREATE";
    public const string Update = "UPDATE";
    public const string Delete = "DELETE";

    public static bool IsValid(string value) => value is Create or Update or Delete;
}

/// <summary>
/// One queued local change the mobile app is pushing up. `EntityType` is the discriminator
/// (e.g. "couple_profile" today; "calendar_event", "expense", etc. in later phases) that the
/// sync service uses to route the payload to the right handler.
/// </summary>
public sealed class SyncPushItemDto
{
    [Required, MaxLength(50)]
    public string EntityType { get; init; } = string.Empty;

    [Required]
    public Guid EntityId { get; init; }

    [Required]
    public string Operation { get; init; } = string.Empty;

    public JsonElement Payload { get; init; }

    [Required]
    public DateTimeOffset ClientUpdatedAt { get; init; }
}

public sealed class SyncPushRequestDto
{
    public List<SyncPushItemDto> Changes { get; init; } = [];
}

public sealed class SyncPushResultItemDto
{
    public Guid EntityId { get; init; }
    public string EntityType { get; init; } = string.Empty;
    public bool Accepted { get; init; }
    public string? Error { get; init; }
    public int? ServerVersion { get; init; }
    public DateTimeOffset? ServerUpdatedAt { get; init; }
}

public sealed class SyncPushResponseDto
{
    public List<SyncPushResultItemDto> Results { get; init; } = [];
}

/// <summary>One remote change for the client to apply to SQLite.</summary>
public sealed class SyncChangeDto
{
    public string EntityType { get; init; } = string.Empty;
    public Guid EntityId { get; init; }
    public string Operation { get; init; } = string.Empty;
    public object? Payload { get; init; }
    public DateTimeOffset UpdatedAt { get; init; }
    public Guid UpdatedByUserId { get; init; }
    public int Version { get; init; }
}

public sealed class SyncPullResponseDto
{
    /// <summary>Server clock at the time of this response; the client stores it as the next `since` cursor.</summary>
    public DateTimeOffset ServerTime { get; init; }
    public List<SyncChangeDto> Changes { get; init; } = [];
}
