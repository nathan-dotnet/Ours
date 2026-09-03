namespace Ours.Infrastructure.Email;

/// <summary>
/// Bound from configuration section "Email" (env vars: EMAIL_PROVIDER, EMAIL_FROM, EMAIL_FROM_NAME,
/// SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD — see backend/.env.example). Never commit
/// real SMTP credentials; local dev defaults to Provider = "development" and needs none.
/// </summary>
public class EmailOptions
{
    public const string SectionName = "Email";

    /// <summary>"development" (logs the link, sends nothing) or "smtp".</summary>
    public string Provider { get; set; } = "development";

    public string From { get; set; } = "no-reply@ours.app";
    public string FromName { get; set; } = "Ours";

    public string SmtpHost { get; set; } = string.Empty;
    public int SmtpPort { get; set; } = 587;
    public string SmtpUsername { get; set; } = string.Empty;
    public string SmtpPassword { get; set; } = string.Empty;
}
