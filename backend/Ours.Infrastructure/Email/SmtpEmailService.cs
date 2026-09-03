using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;
using Ours.Application.Abstractions;

namespace Ours.Infrastructure.Email;

/// <summary>EMAIL_PROVIDER=smtp. Sends real mail via MailKit; configured through EmailOptions (SMTP_* env vars).</summary>
public class SmtpEmailService(IOptions<EmailOptions> options, ILogger<SmtpEmailService> logger) : IEmailService
{
    private readonly EmailOptions _options = options.Value;

    public async Task SendPasswordResetEmailAsync(string toEmail, string displayName, string resetUrl, CancellationToken cancellationToken = default)
    {
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(_options.FromName, _options.From));
        message.To.Add(new MailboxAddress(displayName, toEmail));
        message.Subject = "Reset your Ours password";
        message.Body = new TextPart("plain")
        {
            Text = $"Hi {displayName},\n\n" +
                   "We received a request to reset your Ours password. Tap the link below on your phone to choose a new one:\n\n" +
                   $"{resetUrl}\n\n" +
                   "If you didn't request this, you can safely ignore this email — your password won't change.",
        };

        using var client = new SmtpClient();
        await client.ConnectAsync(_options.SmtpHost, _options.SmtpPort, SecureSocketOptions.StartTls, cancellationToken);
        if (!string.IsNullOrEmpty(_options.SmtpUsername))
        {
            // Never log the password — only that authentication happened.
            await client.AuthenticateAsync(_options.SmtpUsername, _options.SmtpPassword, cancellationToken);
        }
        await client.SendAsync(message, cancellationToken);
        await client.DisconnectAsync(true, cancellationToken);

        // Deliberately no reset URL/token in this log line — just confirmation that an email went out.
        logger.LogInformation("Password reset email sent to {Email}", toEmail);
    }
}
