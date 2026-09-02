namespace Ours.Application.Abstractions;

/// <summary>Indirection over the wall clock, so services are testable without real sleeps/waits.</summary>
public interface IDateTimeProvider
{
    DateTimeOffset UtcNow { get; }
}
