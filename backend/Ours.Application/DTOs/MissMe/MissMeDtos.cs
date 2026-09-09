using System.ComponentModel.DataAnnotations;

namespace Ours.Application.DTOs.MissMe;

public sealed class MissMeInteractionDto
{
    public Guid Id { get; init; }
    public Guid SenderUserId { get; init; }
    public string SenderDisplayName { get; init; } = string.Empty;
    public Guid ReceiverUserId { get; init; }
    public string Type { get; init; } = string.Empty;
    public Guid? InResponseToId { get; init; }
    public DateTimeOffset CreatedAt { get; init; }
}

public sealed class MissMeStatusResponseDto
{
    /// <summary>False while the caller's own 30-minute MissMe cooldown is still running.</summary>
    public bool CanSend { get; init; }

    /// <summary>Set only when CanSend is false — when the button becomes available again.</summary>
    public DateTimeOffset? NextAvailableAt { get; init; }

    /// <summary>The partner's most recent MissMe to the caller that hasn't been replied to yet, if any — drives the "X misses you" banner and its Miss You Too action.</summary>
    public MissMeInteractionDto? PendingFromPartner { get; init; }

    /// <summary>A short recent history for the couple (both directions, both types), newest first — "Little Moments", not a general activity feed.</summary>
    public List<MissMeInteractionDto> RecentHistory { get; init; } = [];
}

public sealed class MissMeSendRequestDto
{
    /// <summary>One of MissMeInteractionType. MissYouToo requires InResponseToId; MissMe never has one.</summary>
    [Required, MaxLength(20)]
    public string Type { get; init; } = string.Empty;

    public Guid? InResponseToId { get; init; }
}

public sealed class MissMeSendResponseDto
{
    /// <summary>False when a MissMe was withheld because the sender is still in cooldown — not an error, just "not yet".</summary>
    public bool Sent { get; init; }

    public DateTimeOffset? NextAvailableAt { get; init; }

    public MissMeInteractionDto? Interaction { get; init; }
}
