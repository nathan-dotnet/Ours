using System.Net;
using System.Net.Http.Json;
using Ours.Api.Tests.Infrastructure;
using Ours.Application.DTOs.Auth;
using Ours.Application.DTOs.Push;
using Xunit;

namespace Ours.Api.Tests;

/// <summary>
/// Exercises registering/unregistering a device's Expo push token over real HTTP — the mobile
/// side of the "Miss You" push flow (see MissMeFlowTests for the notification-triggering side).
/// </summary>
public class PushTokensFlowTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public PushTokensFlowTests(CustomWebApplicationFactory factory) => _factory = factory;

    private static async Task<AuthResponseDto> RegisterAsync(HttpClient client, string email)
    {
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequestDto
        {
            Email = email,
            Password = "Password123",
            DisplayName = "Alice",
        });
        return (await response.Content.ReadFromJsonAsync<AuthResponseDto>())!;
    }

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);

    [Fact]
    public async Task Register_RequiresAuthentication()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/push-tokens", new RegisterPushTokenRequestDto { Token = "ExponentPushToken[x]", Platform = "ios" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Register_ThenUnregister_Succeeds()
    {
        var client = _factory.CreateClient();
        var auth = await RegisterAsync(client, "push-register@flow.test");
        Authorize(client, auth.AccessToken);

        var registerResponse = await client.PostAsJsonAsync(
            "/api/push-tokens", new RegisterPushTokenRequestDto { Token = "ExponentPushToken[abc]", Platform = "android" });
        Assert.Equal(HttpStatusCode.NoContent, registerResponse.StatusCode);

        var unregisterRequest = new HttpRequestMessage(HttpMethod.Delete, "/api/push-tokens")
        {
            Content = JsonContent.Create(new UnregisterPushTokenRequestDto { Token = "ExponentPushToken[abc]" }),
        };
        var unregisterResponse = await client.SendAsync(unregisterRequest);
        Assert.Equal(HttpStatusCode.NoContent, unregisterResponse.StatusCode);
    }

    [Fact]
    public async Task Register_TwiceForTheSameToken_ReassignsItRatherThanDuplicating()
    {
        var client = _factory.CreateClient();
        var alice = await RegisterAsync(client, "push-alice@flow.test");
        var bob = await RegisterAsync(client, "push-bob@flow.test");
        const string sharedToken = "ExponentPushToken[shared-device]";

        Authorize(client, alice.AccessToken);
        await client.PostAsJsonAsync("/api/push-tokens", new RegisterPushTokenRequestDto { Token = sharedToken, Platform = "ios" });

        // Bob signs into the same physical device — re-registering the same token must move it
        // to Bob, not throw a duplicate-key error.
        Authorize(client, bob.AccessToken);
        var response = await client.PostAsJsonAsync("/api/push-tokens", new RegisterPushTokenRequestDto { Token = sharedToken, Platform = "ios" });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Fact]
    public async Task Unregister_ANonExistentToken_IsStillNoContent()
    {
        var client = _factory.CreateClient();
        var auth = await RegisterAsync(client, "push-noop@flow.test");
        Authorize(client, auth.AccessToken);

        var request = new HttpRequestMessage(HttpMethod.Delete, "/api/push-tokens")
        {
            Content = JsonContent.Create(new UnregisterPushTokenRequestDto { Token = "ExponentPushToken[never-registered]" }),
        };
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }
}
