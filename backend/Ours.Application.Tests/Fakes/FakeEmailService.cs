using Ours.Application.Abstractions;

namespace Ours.Application.Tests.Fakes;

public sealed record SentEmail(string ToEmail, string DisplayName, string ResetUrl);

/// <summary>Records every "sent" email instead of actually sending anything, so tests can assert on what AuthService asked for.</summary>
public class FakeEmailService : IEmailService
{
    public List<SentEmail> SentEmails { get; } = [];

    public Task SendPasswordResetEmailAsync(string toEmail, string displayName, string resetUrl, CancellationToken cancellationToken = default)
    {
        SentEmails.Add(new SentEmail(toEmail, displayName, resetUrl));
        return Task.CompletedTask;
    }
}
