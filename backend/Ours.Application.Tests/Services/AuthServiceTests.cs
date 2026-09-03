using Microsoft.Extensions.Options;
using Ours.Application.Abstractions;
using Ours.Application.Common;
using Ours.Application.DTOs.Auth;
using Ours.Application.Services;
using Ours.Application.Tests.Fakes;
using Xunit;

namespace Ours.Application.Tests.Services;

public class AuthServiceTests
{
    private static (AuthService Service, FakeIdentityService Identity, FakeEmailService Email) Build()
    {
        var db = TestDbContextFactory.Create();
        var identity = new FakeIdentityService();
        var email = new FakeEmailService();
        var service = new AuthService(
            identity, db, new FakeJwtTokenService(), new FakeDateTimeProvider(), email, Options.Create(new AppOptions()));
        return (service, identity, email);
    }

    [Fact]
    public async Task RegisterAsync_ReturnsTokensAndUser()
    {
        var (service, _, _) = Build();

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
        var (service, _, _) = Build();
        await service.RegisterAsync(new RegisterRequestDto { Email = "alice@test.com", Password = "Password123", DisplayName = "Alice" });

        await Assert.ThrowsAsync<UnauthorizedAppException>(() =>
            service.LoginAsync(new LoginRequestDto { Email = "alice@test.com", Password = "WrongPassword" }));
    }

    [Fact]
    public async Task LoginAsync_WithUnknownEmail_Throws()
    {
        var (service, _, _) = Build();

        await Assert.ThrowsAsync<UnauthorizedAppException>(() =>
            service.LoginAsync(new LoginRequestDto { Email = "nobody@test.com", Password = "Password123" }));
    }

    [Fact]
    public async Task RefreshAsync_RotatesToken_AndRejectsReuseOfOldOne()
    {
        var (service, _, _) = Build();
        var registerResponse = await service.RegisterAsync(new RegisterRequestDto { Email = "alice@test.com", Password = "Password123", DisplayName = "Alice" });

        var refreshed = await service.RefreshAsync(new RefreshRequestDto { RefreshToken = registerResponse.RefreshToken });
        Assert.NotEqual(registerResponse.RefreshToken, refreshed.RefreshToken);

        await Assert.ThrowsAsync<UnauthorizedAppException>(() =>
            service.RefreshAsync(new RefreshRequestDto { RefreshToken = registerResponse.RefreshToken }));
    }

    [Fact]
    public async Task LogoutAsync_RevokesToken_SoItCanNoLongerBeRefreshed()
    {
        var (service, _, _) = Build();
        var registerResponse = await service.RegisterAsync(new RegisterRequestDto { Email = "alice@test.com", Password = "Password123", DisplayName = "Alice" });

        await service.LogoutAsync(new LogoutRequestDto { RefreshToken = registerResponse.RefreshToken });

        await Assert.ThrowsAsync<UnauthorizedAppException>(() =>
            service.RefreshAsync(new RefreshRequestDto { RefreshToken = registerResponse.RefreshToken }));
    }

    [Fact]
    public async Task LogoutAsync_WithUnknownToken_DoesNotThrow()
    {
        var (service, _, _) = Build();

        await service.LogoutAsync(new LogoutRequestDto { RefreshToken = "never-issued" });
    }

    [Fact]
    public async Task ForgotPasswordAsync_ForExistingEmail_SendsResetEmailWithTokenAndUrl()
    {
        var (service, _, email) = Build();
        await service.RegisterAsync(new RegisterRequestDto { Email = "alice@test.com", Password = "Password123", DisplayName = "Alice" });

        await service.ForgotPasswordAsync(new ForgotPasswordRequestDto { Email = "alice@test.com" });

        var sent = Assert.Single(email.SentEmails);
        Assert.Equal("alice@test.com", sent.ToEmail);
        Assert.Contains("ours://reset-password", sent.ResetUrl);
        Assert.Contains("email=", sent.ResetUrl);
        Assert.Contains("token=", sent.ResetUrl);
    }

    [Fact]
    public async Task ForgotPasswordAsync_ForUnknownEmail_SendsNoEmail_AndDoesNotThrow()
    {
        var (service, _, email) = Build();

        // No exception and no email — the caller (AuthController) returns the exact same
        // response for this as for an existing account, so there must be nothing here to
        // distinguish the two cases on.
        await service.ForgotPasswordAsync(new ForgotPasswordRequestDto { Email = "nobody@test.com" });

        Assert.Empty(email.SentEmails);
    }

    [Fact]
    public async Task ResetPasswordAsync_WithValidToken_ChangesPassword_AndCanLoginWithIt()
    {
        var (service, identity, _) = Build();
        await service.RegisterAsync(new RegisterRequestDto { Email = "alice@test.com", Password = "Password123", DisplayName = "Alice" });
        var user = await identity.FindByEmailAsync("alice@test.com");
        var token = await identity.GeneratePasswordResetTokenAsync(user!);

        await service.ResetPasswordAsync(new ResetPasswordRequestDto { Email = "alice@test.com", Token = token, NewPassword = "NewPassword456" });

        // The old password no longer works...
        await Assert.ThrowsAsync<UnauthorizedAppException>(() =>
            service.LoginAsync(new LoginRequestDto { Email = "alice@test.com", Password = "Password123" }));
        // ...and the new one does.
        var response = await service.LoginAsync(new LoginRequestDto { Email = "alice@test.com", Password = "NewPassword456" });
        Assert.NotEmpty(response.AccessToken);
    }

    [Fact]
    public async Task ResetPasswordAsync_WithInvalidToken_ThrowsGenericMessage()
    {
        // Also stands in for an *expired* token: real ASP.NET Core Identity's DataProtectorTokenProvider
        // (the "Default" provider GeneratePasswordResetTokenAsync/ResetPasswordAsync use) can't tell
        // "tampered" apart from "past its TokenLifespan" — both fail with the same InvalidToken error
        // code, which is exactly what AuthService checks for, so this one test covers both.
        var (service, _, _) = Build();
        await service.RegisterAsync(new RegisterRequestDto { Email = "alice@test.com", Password = "Password123", DisplayName = "Alice" });

        var ex = await Assert.ThrowsAsync<ValidationAppException>(() =>
            service.ResetPasswordAsync(new ResetPasswordRequestDto { Email = "alice@test.com", Token = "not-a-real-token", NewPassword = "NewPassword456" }));

        Assert.Equal("Invalid or expired reset request.", ex.Message);
    }

    [Fact]
    public async Task ResetPasswordAsync_WithUnknownEmail_ThrowsTheSameGenericMessageAsAnInvalidToken()
    {
        // Enumeration protection: this endpoint must not let an attacker learn an email doesn't
        // exist by getting a different error than a real account with a wrong token would get.
        var (service, _, _) = Build();

        var ex = await Assert.ThrowsAsync<ValidationAppException>(() =>
            service.ResetPasswordAsync(new ResetPasswordRequestDto { Email = "nobody@test.com", Token = "anything", NewPassword = "NewPassword456" }));

        Assert.Equal("Invalid or expired reset request.", ex.Message);
    }

    [Fact]
    public async Task ResetPasswordAsync_WithWeakNewPassword_SurfacesThePolicyError()
    {
        var (service, identity, _) = Build();
        await service.RegisterAsync(new RegisterRequestDto { Email = "alice@test.com", Password = "Password123", DisplayName = "Alice" });
        var user = await identity.FindByEmailAsync("alice@test.com");
        var token = await identity.GeneratePasswordResetTokenAsync(user!);

        var ex = await Assert.ThrowsAsync<ValidationAppException>(() =>
            service.ResetPasswordAsync(new ResetPasswordRequestDto { Email = "alice@test.com", Token = token, NewPassword = "short" }));

        Assert.DoesNotContain("expired", ex.Message);
    }

    [Fact]
    public async Task ResetPasswordAsync_OnSuccess_RevokesEveryExistingRefreshToken()
    {
        var (service, identity, _) = Build();
        var registerResponse = await service.RegisterAsync(new RegisterRequestDto { Email = "alice@test.com", Password = "Password123", DisplayName = "Alice" });
        var user = await identity.FindByEmailAsync("alice@test.com");
        var token = await identity.GeneratePasswordResetTokenAsync(user!);

        await service.ResetPasswordAsync(new ResetPasswordRequestDto { Email = "alice@test.com", Token = token, NewPassword = "NewPassword456" });

        // The refresh token issued at registration — a session that existed before the reset —
        // must no longer be usable, not just tokens issued after this point.
        await Assert.ThrowsAsync<UnauthorizedAppException>(() =>
            service.RefreshAsync(new RefreshRequestDto { RefreshToken = registerResponse.RefreshToken }));
    }
}
