namespace Ours.Application.Abstractions;

/// <summary>
/// Keeps email-provider concerns (SMTP, an HTTP API, or just logging during development)
/// entirely out of AuthService — it only ever asks for an email to be sent, never touches
/// SMTP/provider-specific code itself. See Ours.Infrastructure/Email for the implementations.
/// </summary>
public interface IEmailService
{
    Task SendPasswordResetEmailAsync(string toEmail, string displayName, string resetUrl, CancellationToken cancellationToken = default);
}
