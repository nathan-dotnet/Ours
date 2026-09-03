using Microsoft.AspNetCore.Identity;
using Ours.Application.Abstractions;
using Ours.Domain.Entities;

namespace Ours.Infrastructure.Identity;

public class IdentityService(UserManager<ApplicationUser> userManager) : IIdentityService
{
    public async Task<CreateUserResult> CreateUserAsync(string email, string password, string displayName)
    {
        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            Email = email,
            UserName = email,
            DisplayName = displayName,
            CreatedAt = DateTimeOffset.UtcNow,
        };

        var result = await userManager.CreateAsync(user, password);
        return result.Succeeded
            ? new CreateUserResult(true, [], user)
            : new CreateUserResult(false, result.Errors.Select(e => e.Description).ToList(), null);
    }

    public Task<ApplicationUser?> FindByEmailAsync(string email) => userManager.FindByEmailAsync(email);

    public Task<ApplicationUser?> FindByIdAsync(Guid userId) => userManager.FindByIdAsync(userId.ToString());

    public Task<bool> CheckPasswordAsync(ApplicationUser user, string password) => userManager.CheckPasswordAsync(user, password);

    public Task<string> GeneratePasswordResetTokenAsync(ApplicationUser user) => userManager.GeneratePasswordResetTokenAsync(user);

    public async Task<IdentityOperationResult> ResetPasswordAsync(ApplicationUser user, string token, string newPassword)
    {
        var result = await userManager.ResetPasswordAsync(user, token, newPassword);
        return new IdentityOperationResult(
            result.Succeeded,
            result.Errors.Select(e => e.Description).ToList(),
            result.Errors.Select(e => e.Code).ToList());
    }
}
