namespace Ours.Application.Abstractions;

/// <summary>
/// Sends a real device push notification (via Expo's push service, which fans out to APNs/FCM —
/// see Ours.Infrastructure/Notifications). Keeps push-provider concerns entirely out of callers
/// like MissMeService, the same way IEmailService keeps SMTP details out of AuthService. A push
/// send is always a best-effort nicety layered on top of a write that already succeeded — every
/// implementation is expected to swallow its own failures (log, never throw) so a flaky/missing
/// push provider can never fail the caller's actual action.
/// </summary>
public interface IPushNotificationSender
{
    /// <param name="tokens">Expo push tokens to notify. A no-op when empty.</param>
    /// <param name="title">Notification title.</param>
    /// <param name="body">Notification body text.</param>
    /// <param name="data">Optional payload delivered to the app's notification-tap handler (e.g. what to navigate to).</param>
    Task SendAsync(
        IReadOnlyCollection<string> tokens,
        string title,
        string body,
        IReadOnlyDictionary<string, object?>? data = null,
        CancellationToken cancellationToken = default);
}
