using Ours.Application.Abstractions;

namespace Ours.Application.Tests.Fakes;

/// <summary>Hands out predictable, sequential codes so tests can assert on them exactly.</summary>
public class FakeInviteCodeGenerator : IInviteCodeGenerator
{
    private int _counter;

    public string Generate() => $"OURS-TEST{++_counter}";
}
