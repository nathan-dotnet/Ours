using Ours.Application.Abstractions;
using Ours.Domain.Entities;

namespace Ours.Application.Tests.Fakes;

/// <summary>Deterministic stand-in — no real signing, just enough to exercise issuance/rotation logic.</summary>
public class FakeJwtTokenService : IJwtTokenService
{
    private int _counter;

    public (string Token, DateTimeOffset ExpiresAt) GenerateAccessToken(ApplicationUser user) =>
        ($"access-{user.Id}-{++_counter}", DateTimeOffset.UtcNow.AddMinutes(15));

    public string GenerateRefreshToken() => $"refresh-{Guid.NewGuid()}";

    public string HashRefreshToken(string rawToken) => $"hashed:{rawToken}";
}
