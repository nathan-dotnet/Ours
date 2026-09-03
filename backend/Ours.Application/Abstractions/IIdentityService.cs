using Ours.Domain.Entities;

namespace Ours.Application.Abstractions;

public sealed record CreateUserResult(bool Succeeded, IReadOnlyList<string> Errors, ApplicationUser? User);

/// <summary>
/// Codes are carried alongside the human-readable Errors so callers can distinguish specific
/// failure kinds (e.g. an invalid/expired reset token) without string-matching descriptions.
/// </summary>
public sealed record IdentityOperationResult(bool Succeeded, IReadOnlyList<string> Errors, IReadOnlyList<string> Codes);

/// <summary>
/// Thin seam over ASP.NET Core Identity's UserManager so Application services depend on an
/// abstraction rather than the Identity package's concrete API surface.
/// </summary>
public interface IIdentityService
{
    Task<CreateUserResult> CreateUserAsync(string email, string password, string displayName);
    Task<ApplicationUser?> FindByEmailAsync(string email);
    Task<ApplicationUser?> FindByIdAsync(Guid userId);
    Task<bool> CheckPasswordAsync(ApplicationUser user, string password);

    /// <summary>
    /// Issues a password-reset token via Identity's built-in data-protection-backed token
    /// provider — time-limited and non-predictable by construction, and never persisted
    /// anywhere (validity is checked by decrypting/verifying it, not by a database lookup).
    /// </summary>
    Task<string> GeneratePasswordResetTokenAsync(ApplicationUser user);

    /// <summary>
    /// Validates the token and, if valid, sets the new password. Identity also rotates the
    /// user's security stamp as part of a successful reset, which invalidates the token for
    /// replay even before its time limit expires.
    /// </summary>
    Task<IdentityOperationResult> ResetPasswordAsync(ApplicationUser user, string token, string newPassword);
}
