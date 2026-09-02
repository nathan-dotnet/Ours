using Ours.Application.Abstractions;
using Ours.Domain.Entities;

namespace Ours.Application.Tests.Fakes;

/// <summary>
/// In-memory stand-in for ASP.NET Core Identity's UserManager, so AuthService's own logic
/// (token issuance, refresh rotation, error mapping) can be unit-tested without a real
/// Identity store. Password hashing/validation itself is Infrastructure's responsibility.
/// </summary>
public class FakeIdentityService : IIdentityService
{
    private readonly Dictionary<string, (ApplicationUser User, string Password)> _users = new(StringComparer.OrdinalIgnoreCase);

    public Task<CreateUserResult> CreateUserAsync(string email, string password, string displayName)
    {
        if (_users.ContainsKey(email))
        {
            return Task.FromResult(new CreateUserResult(false, ["Email already taken."], null));
        }

        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            Email = email,
            UserName = email,
            DisplayName = displayName,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        _users[email] = (user, password);
        return Task.FromResult(new CreateUserResult(true, [], user));
    }

    public Task<ApplicationUser?> FindByEmailAsync(string email) =>
        Task.FromResult(_users.TryGetValue(email, out var entry) ? entry.User : null);

    public Task<ApplicationUser?> FindByIdAsync(Guid userId) =>
        Task.FromResult(_users.Values.Select(e => e.User).FirstOrDefault(u => u.Id == userId));

    public Task<bool> CheckPasswordAsync(ApplicationUser user, string password) =>
        Task.FromResult(_users.TryGetValue(user.Email!, out var entry) && entry.Password == password);
}
