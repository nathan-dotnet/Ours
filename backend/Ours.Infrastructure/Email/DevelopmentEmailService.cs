using Microsoft.Extensions.Logging;
using Ours.Application.Abstractions;

namespace Ours.Infrastructure.Email;

/// <summary>
/// EMAIL_PROVIDER=development (the default). Sends nothing — just logs the full reset link so a
/// developer/tester can grab it from the console without needing real email credentials. This is
/// the one place the reset URL is deliberately logged; every other path treats it as sensitive.
/// </summary>
public class DevelopmentEmailService(ILogger<DevelopmentEmailService> logger) : IEmailService
{
    public Task SendPasswordResetEmailAsync(string toEmail, string displayName, string resetUrl, CancellationToken cancellationToken = default)
    {
        logger.LogInformation(
            "\n===== DEV EMAIL — Password Reset =====\nTo: {Email}\nLink: {ResetUrl}\n=======================================",
            toEmail,
            resetUrl);
        return Task.CompletedTask;
    }
}
