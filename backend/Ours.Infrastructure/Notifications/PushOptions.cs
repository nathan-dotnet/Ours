namespace Ours.Infrastructure.Notifications;

/// <summary>
/// Bound from configuration section "Push" (env var: Push__Provider — see backend/.env.example).
/// Local dev defaults to Provider = "development" and needs no further configuration.
/// </summary>
public class PushOptions
{
    public const string SectionName = "Push";

    /// <summary>"development" (logs instead of sending; the default) or "expo".</summary>
    public string Provider { get; set; } = "development";

    /// <summary>
    /// Optional. Only needed if this Expo account has "Enhanced Push Security" turned on — when
    /// set, sent as `Authorization: Bearer {token}` on every request to Expo's push API.
    /// </summary>
    public string AccessToken { get; set; } = string.Empty;
}
