using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Ours.Api.Tests.Infrastructure;
using Ours.Application.Abstractions;
using Ours.Application.DTOs.Auth;
using Xunit;

namespace Ours.Api.Tests;

/// <summary>
/// Exercises forgot-password/reset-password over real HTTP, against the real ASP.NET Core
/// Identity token provider (not a fake) — only the "email sending" step is swapped out
/// (the test host's Email:Provider defaults to "development", which just logs).
/// </summary>
public class PasswordResetFlowTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public PasswordResetFlowTests(CustomWebApplicationFactory factory) => _factory = factory;

    private static async Task<AuthResponseDto> RegisterAsync(HttpClient client, string email, string displayName)
    {
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequestDto
        {
            Email = email,
            Password = "Password123",
            DisplayName = displayName,
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<AuthResponseDto>())!;
    }

    /// <summary>
    /// Mints a real reset token the same way AuthService does, via the app's own DI container —
    /// standing in for "read it out of the email" without needing to intercept logging output.
    /// </summary>
    private async Task<string> GenerateRealResetTokenAsync(string email)
    {
        using var scope = _factory.Services.CreateScope();
        var identityService = scope.ServiceProvider.GetRequiredService<IIdentityService>();
        var user = await identityService.FindByEmailAsync(email);
        return await identityService.GeneratePasswordResetTokenAsync(user!);
    }

    [Fact]
    public async Task ForgotPassword_ForExistingAndUnknownEmail_ReturnsTheExactSameResponse()
    {
        var client = _factory.CreateClient();
        await RegisterAsync(client, "alice-reset1@flow.test", "Alice");

        var existingResponse = await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = "alice-reset1@flow.test" });
        var unknownResponse = await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = "definitely-nobody@flow.test" });

        Assert.Equal(HttpStatusCode.OK, existingResponse.StatusCode);
        Assert.Equal(HttpStatusCode.OK, unknownResponse.StatusCode);
        var existingBody = await existingResponse.Content.ReadAsStringAsync();
        var unknownBody = await unknownResponse.Content.ReadAsStringAsync();
        Assert.Equal(existingBody, unknownBody);
    }

    [Fact]
    public async Task ResetPassword_WithValidToken_ChangesPassword_AndOldPasswordNoLongerWorks()
    {
        var client = _factory.CreateClient();
        await RegisterAsync(client, "alice-reset2@flow.test", "Alice");
        var token = await GenerateRealResetTokenAsync("alice-reset2@flow.test");

        var resetResponse = await client.PostAsJsonAsync("/api/auth/reset-password", new
        {
            email = "alice-reset2@flow.test",
            token,
            newPassword = "BrandNewPassword456",
        });
        Assert.Equal(HttpStatusCode.NoContent, resetResponse.StatusCode);

        var oldPasswordLogin = await client.PostAsJsonAsync("/api/auth/login", new { email = "alice-reset2@flow.test", password = "Password123" });
        Assert.Equal(HttpStatusCode.Unauthorized, oldPasswordLogin.StatusCode);

        var newPasswordLogin = await client.PostAsJsonAsync("/api/auth/login", new { email = "alice-reset2@flow.test", password = "BrandNewPassword456" });
        Assert.Equal(HttpStatusCode.OK, newPasswordLogin.StatusCode);
    }

    [Fact]
    public async Task ResetPassword_WithInvalidToken_ReturnsGenericBadRequest()
    {
        var client = _factory.CreateClient();
        await RegisterAsync(client, "alice-reset3@flow.test", "Alice");

        var response = await client.PostAsJsonAsync("/api/auth/reset-password", new
        {
            email = "alice-reset3@flow.test",
            token = "not-a-real-token",
            newPassword = "BrandNewPassword456",
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("Invalid or expired reset request.", body);
    }

    [Fact]
    public async Task ResetPassword_ForUnknownEmail_ReturnsTheSameGenericBadRequestAsAnInvalidToken()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/reset-password", new
        {
            email = "nobody-at-all@flow.test",
            token = "anything",
            newPassword = "BrandNewPassword456",
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("Invalid or expired reset request.", body);
    }

    [Fact]
    public async Task ResetPassword_RevokesAnExistingRefreshSession()
    {
        var client = _factory.CreateClient();
        var auth = await RegisterAsync(client, "alice-reset4@flow.test", "Alice");
        var token = await GenerateRealResetTokenAsync("alice-reset4@flow.test");

        await client.PostAsJsonAsync("/api/auth/reset-password", new
        {
            email = "alice-reset4@flow.test",
            token,
            newPassword = "BrandNewPassword456",
        });

        var refreshResponse = await client.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = auth.RefreshToken });

        Assert.Equal(HttpStatusCode.Unauthorized, refreshResponse.StatusCode);
    }
}
