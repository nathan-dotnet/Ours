using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Ours.Application.Abstractions;

namespace Ours.Infrastructure.Notifications;

/// <summary>
/// Push__Provider=expo. Sends real device push notifications through Expo's push service
/// (https://exp.host/--/api/v2/push/send), which fans out to APNs/FCM on Expo's side — this
/// backend never talks to Apple/Google directly, and needs no platform-specific credentials of
/// its own. Every failure here (network error, non-2xx response) is logged and swallowed, never
/// rethrown — see IPushNotificationSender's "best-effort" contract.
/// </summary>
public class ExpoPushNotificationSender(HttpClient httpClient, IOptions<PushOptions> options, ILogger<ExpoPushNotificationSender> logger)
    : IPushNotificationSender
{
    public async Task SendAsync(
        IReadOnlyCollection<string> tokens,
        string title,
        string body,
        IReadOnlyDictionary<string, object?>? data = null,
        CancellationToken cancellationToken = default)
    {
        if (tokens.Count == 0) return;

        // One "message" per token — Expo's push API accepts a batch in one request. `channelId`
        // must match the Android notification channel the app creates on-device (see the mobile
        // pushNotifications module) for the sound/importance settings to actually apply.
        var messages = tokens.Select(token => new
        {
            to = token,
            title,
            body,
            sound = "default",
            priority = "high",
            channelId = "default",
            data,
        });

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "--/api/v2/push/send")
            {
                Content = JsonContent.Create(messages),
            };

            var accessToken = options.Value.AccessToken;
            if (!string.IsNullOrEmpty(accessToken))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            }

            var response = await httpClient.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
                logger.LogWarning("Expo push send failed with status {Status}: {Body}", response.StatusCode, responseBody);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Expo push send threw");
        }
    }
}
