namespace Ours.Domain.Entities;

/// <summary>
/// Server-side record of an issued refresh token, stored hashed. Supports rotation:
/// redeeming a token marks it used and links to its replacement, so a reused/stolen
/// token can be detected and the whole chain revoked.
/// </summary>
public class RefreshToken
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;

    /// <summary>SHA-256 hash of the token value; the raw token is never persisted.</summary>
    public string TokenHash { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset? RevokedAt { get; set; }

    public Guid? ReplacedByTokenId { get; set; }

    /// <summary>
    /// Callers must pass the current time explicitly (from <c>IDateTimeProvider</c>) rather
    /// than this checking the wall clock itself, so token-expiry logic stays testable and
    /// consistent with the rest of the app's injected clock.
    /// </summary>
    public bool IsActiveAt(DateTimeOffset now) => RevokedAt is null && now < ExpiresAt;
}
