using Ours.Application.Common;
using Ours.Application.DTOs.Auth;
using Ours.Application.Services;
using Ours.Application.Tests.Fakes;
using Xunit;

namespace Ours.Application.Tests.Services;

public class AuthServiceTests
{
    private static (AuthService Service, FakeIdentityService Identity) Build()
    {
        var db = TestDbContextFactory.Create();
        var identity = new FakeIdentityService();
        var service = new AuthService(identity, db, new FakeJwtTokenService(), new FakeDateTimeProvider());
        return (service, identity);
    }

    [Fact]
    public async Task RegisterAsync_ReturnsTokensAndUser()
    {
        var (service, _) = Build();

        var response = await service.RegisterAsync(new RegisterRequestDto
        {
            Email = "alice@test.com",
            Password = "Password123",
            DisplayName = "Alice",
        });

        Assert.NotEmpty(response.AccessToken);
        Assert.NotEmpty(response.RefreshToken);
        Assert.Equal("alice@test.com", response.User.Email);
        Assert.Null(response.User.CoupleId);
    }

    [Fact]
    public async Task LoginAsync_WithWrongPassword_Throws()
    {
        var (service, _) = Build();
        await service.RegisterAsync(new RegisterRequestDto { Email = "alice@test.com", Password = "Password123", DisplayName = "Alice" });

        await Assert.ThrowsAsync<UnauthorizedAppException>(() =>
            service.LoginAsync(new LoginRequestDto { Email = "alice@test.com", Password = "WrongPassword" }));
    }

    [Fact]
    public async Task LoginAsync_WithUnknownEmail_Throws()
    {
        var (service, _) = Build();

        await Assert.ThrowsAsync<UnauthorizedAppException>(() =>
            service.LoginAsync(new LoginRequestDto { Email = "nobody@test.com", Password = "Password123" }));
    }

    [Fact]
    public async Task RefreshAsync_RotatesToken_AndRejectsReuseOfOldOne()
    {
        var (service, _) = Build();
        var registerResponse = await service.RegisterAsync(new RegisterRequestDto { Email = "alice@test.com", Password = "Password123", DisplayName = "Alice" });

        var refreshed = await service.RefreshAsync(new RefreshRequestDto { RefreshToken = registerResponse.RefreshToken });
        Assert.NotEqual(registerResponse.RefreshToken, refreshed.RefreshToken);

        await Assert.ThrowsAsync<UnauthorizedAppException>(() =>
            service.RefreshAsync(new RefreshRequestDto { RefreshToken = registerResponse.RefreshToken }));
    }

    [Fact]
    public async Task LogoutAsync_RevokesToken_SoItCanNoLongerBeRefreshed()
    {
        var (service, _) = Build();
        var registerResponse = await service.RegisterAsync(new RegisterRequestDto { Email = "alice@test.com", Password = "Password123", DisplayName = "Alice" });

        await service.LogoutAsync(new LogoutRequestDto { RefreshToken = registerResponse.RefreshToken });

        await Assert.ThrowsAsync<UnauthorizedAppException>(() =>
            service.RefreshAsync(new RefreshRequestDto { RefreshToken = registerResponse.RefreshToken }));
    }

    [Fact]
    public async Task LogoutAsync_WithUnknownToken_DoesNotThrow()
    {
        var (service, _) = Build();

        await service.LogoutAsync(new LogoutRequestDto { RefreshToken = "never-issued" });
    }
}
