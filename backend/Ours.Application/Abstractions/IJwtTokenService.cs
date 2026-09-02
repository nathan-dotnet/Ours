using Ours.Domain.Entities;

namespace Ours.Application.Abstractions;

public interface IJwtTokenService
{
    /// <summary>Issues a short-lived JWT access token for the given user.</summary>
    (string Token, DateTimeOffset ExpiresAt) GenerateAccessToken(ApplicationUser user);

    /// <summary>Generates a cryptographically random opaque refresh token (raw, unhashed).</summary>
    string GenerateRefreshToken();

    /// <summary>Hashes a raw refresh token for storage/comparison. Never store the raw value.</summary>
    string HashRefreshToken(string rawToken);
}
