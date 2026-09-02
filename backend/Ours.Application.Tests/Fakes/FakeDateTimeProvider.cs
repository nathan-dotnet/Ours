using Ours.Application.Abstractions;

namespace Ours.Application.Tests.Fakes;

public class FakeDateTimeProvider : IDateTimeProvider
{
    public DateTimeOffset UtcNow { get; set; } = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
}
