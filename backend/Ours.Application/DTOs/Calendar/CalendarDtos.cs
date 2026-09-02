using System.ComponentModel.DataAnnotations;

namespace Ours.Application.DTOs.Calendar;

/// <summary>
/// Shape of the "calendar_event" sync payload (see <see cref="Sync.SyncPushItemDto"/>). Like
/// couple_profile, calendar events only ever move through the generic sync push/pull — there is
/// no dedicated REST verb for them.
/// </summary>
public sealed class CalendarEventPayloadDto
{
    [Required, MaxLength(200)]
    public string Title { get; init; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; init; }

    [Required]
    public DateTimeOffset StartAt { get; init; }

    [Required]
    public DateTimeOffset EndAt { get; init; }

    public DateTimeOffset? ReminderAt { get; init; }

    /// <summary>
    /// Set by the server on pull; a client push doesn't need to (and can't) set who created an
    /// event — the server always derives that from the authenticated user on first creation.
    /// </summary>
    public Guid? CreatedByUserId { get; init; }
}
