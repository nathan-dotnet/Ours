using Ours.Domain.Entities;

namespace Ours.Application.Abstractions;

public sealed record CreateUserResult(bool Succeeded, IReadOnlyList<string> Errors, ApplicationUser? User);

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
}
