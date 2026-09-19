namespace Ours.Domain.Entities;

/// <summary>
/// One installed app instance's Expo push token, tied to whichever user is currently signed in
/// on it. Not an <see cref="ISyncableEntity"/> — like <see cref="MissMeInteraction"/>, nothing
/// here is ever user-edited; the mobile app just calls PushTokensController to keep it current
/// right after registering for push permission, and again on logout. A token belongs to exactly
/// one row: signing in as a different partner on the same physical device reassigns the existing
/// row's UserId rather than leaving a stale duplicate (see PushTokenService).
/// </summary>
public class PushToken
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    /// <summary>An Expo push token, e.g. "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]".</summary>
    public string Token { get; set; } = string.Empty;

    /// <summary>"ios" or "android" — informational only; nothing branches on it server-side today.</summary>
    public string Platform { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
