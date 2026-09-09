namespace Ours.Domain.Entities;

/// <summary>
/// A single "I miss you" gesture (or its "miss you too" reply) between two partners. Deliberately
/// NOT an <see cref="ISyncableEntity"/> — unlike Calendar/Money/Vault, there is nothing here a
/// user ever edits or deletes offline; every row is a one-shot, server-created, append-only fact
/// ("X sent this, to Y, at this instant"), so it doesn't belong in the generic offline
/// create/update/delete sync pipeline. The mobile app reads it through a small dedicated
/// endpoint instead (see MissMeService), the same way Vault's "reveal" needed its own endpoint
/// for the one thing that didn't fit the sync model.
/// </summary>
public class MissMeInteraction
{
    public Guid Id { get; set; }

    public Guid CoupleId { get; set; }

    public Guid SenderUserId { get; set; }

    /// <summary>The partner at the moment this was sent — resolved server-side from the couple's membership, never supplied by the client.</summary>
    public Guid ReceiverUserId { get; set; }

    /// <summary>One of <see cref="MissMeInteractionType"/>.</summary>
    public string Type { get; set; } = string.Empty;

    /// <summary>Set only on a MissYouToo row — the Id of the MissMe it's replying to. Null for a MissMe row.</summary>
    public Guid? InResponseToId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
