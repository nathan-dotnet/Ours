using Microsoft.Extensions.Logging;
using Ours.Application.Abstractions;

namespace Ours.Infrastructure.Notifications;

/// <summary>
/// Push__Provider=development (the default). Sends nothing — just logs what would have gone out,
/// so push-triggering flows (e.g. MissMeService) can be exercised with zero Expo/device setup.
/// Same role as DevelopmentEmailService.
/// </summary>
public class DevelopmentPushNotificationSender(ILogger<DevelopmentPushNotificationSender> logger) : IPushNotificationSender
{
    public Task SendAsync(
        IReadOnlyCollection<string> tokens,
        string title,
        string body,
        IReadOnlyDictionary<string, object?>? data = null,
        CancellationToken cancellationToken = default)
    {
        if (tokens.Count == 0) return Task.CompletedTask;

        logger.LogInformation(
            "\n===== DEV PUSH =====\nTo: {Tokens}\nTitle: {Title}\nBody: {Body}\n=====================",
            string.Join(", ", tokens),
            title,
            body);
        return Task.CompletedTask;
    }
}
