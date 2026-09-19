using Ours.Application.Abstractions;

namespace Ours.Application.Tests.Fakes;

/// <summary>Records every SendAsync call instead of touching the network — lets tests assert MissMeService actually triggered a push (or didn't).</summary>
public class FakePushNotificationSender : IPushNotificationSender
{
    public record Call(IReadOnlyCollection<string> Tokens, string Title, string Body, IReadOnlyDictionary<string, object?>? Data);

    public List<Call> Calls { get; } = [];

    public Task SendAsync(
        IReadOnlyCollection<string> tokens,
        string title,
        string body,
        IReadOnlyDictionary<string, object?>? data = null,
        CancellationToken cancellationToken = default)
    {
        Calls.Add(new Call(tokens, title, body, data));
        return Task.CompletedTask;
    }
}
