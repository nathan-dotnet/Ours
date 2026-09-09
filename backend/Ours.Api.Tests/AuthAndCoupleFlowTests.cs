using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Ours.Api.Tests.Infrastructure;
using Ours.Application.DTOs.Auth;
using Ours.Application.DTOs.Couples;
using Ours.Application.DTOs.Sync;
using Xunit;

namespace Ours.Api.Tests;

/// <summary>
/// End-to-end walk through the Phase 1 success scenario over real HTTP: register both
/// partners, create + join a couple, then exercise the generic sync push/pull round trip.
/// </summary>
public class AuthAndCoupleFlowTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public AuthAndCoupleFlowTests(CustomWebApplicationFactory factory) => _factory = factory;

    private static async Task<AuthResponseDto> RegisterAsync(HttpClient client, string email, string displayName)
    {
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequestDto
        {
            Email = email,
            Password = "Password123",
            DisplayName = displayName,
        });
        if (!response.IsSuccessStatusCode)
        {
            throw new Exception($"Register failed ({response.StatusCode}): {await response.Content.ReadAsStringAsync()}");
        }
        return (await response.Content.ReadFromJsonAsync<AuthResponseDto>())!;
    }

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);

    /// <summary>Fails with the response body (and any WWW-Authenticate challenge) instead of just a status code mismatch.</summary>
    private static async Task EnsureOkAsync(HttpResponseMessage response, string action)
    {
        if (response.StatusCode != HttpStatusCode.OK)
        {
            var wwwAuth = string.Join(" | ", response.Headers.WwwAuthenticate);
            throw new Exception($"{action} failed ({response.StatusCode}): {await response.Content.ReadAsStringAsync()} {wwwAuth}");
        }
    }

    [Fact]
    public async Task FullCoupleAndSyncFlow_Succeeds()
    {
        var client = _factory.CreateClient();

        // Register both partners.
        var alice = await RegisterAsync(client, "alice@flow.test", "Alice");
        var bob = await RegisterAsync(client, "bob@flow.test", "Bob");

        // Alice creates the couple.
        Authorize(client, alice.AccessToken);
        var createResponse = await client.PostAsync("/api/couples", null);
        await EnsureOkAsync(createResponse, "Create couple");
        var created = (await createResponse.Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;
        Assert.StartsWith("OURS-", created.Couple.InviteCode);

        // Bob joins with the invite code.
        Authorize(client, bob.AccessToken);
        var joinResponse = await client.PostAsJsonAsync("/api/couples/join", new JoinCoupleRequestDto { InviteCode = created.Couple.InviteCode });
        await EnsureOkAsync(joinResponse, "Join couple");
        var joined = (await joinResponse.Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;
        Assert.Equal(2, joined.Couple.Members.Count);

        // Alice (re-authorized with her post-create token, which now carries coupleId) pushes an offline edit.
        Authorize(client, created.Auth.AccessToken);
        var pushResponse = await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes =
            [
                new SyncPushItemDto
                {
                    EntityType = "couple_profile",
                    EntityId = created.Couple.Id,
                    Operation = SyncOperation.Update,
                    ClientUpdatedAt = DateTimeOffset.UtcNow,
                    Payload = System.Text.Json.JsonSerializer.SerializeToElement(new { nickname = "Us Two" }),
                },
            ],
        });
        Assert.Equal(HttpStatusCode.OK, pushResponse.StatusCode);
        var pushResult = (await pushResponse.Content.ReadFromJsonAsync<SyncPushResponseDto>())!;
        Assert.True(pushResult.Results[0].Accepted);

        // Bob pulls and sees Alice's change.
        Authorize(client, joined.Auth.AccessToken);
        var pullResponse = await client.GetAsync("/api/sync/pull");
        Assert.Equal(HttpStatusCode.OK, pullResponse.StatusCode);
        var pullResult = (await pullResponse.Content.ReadFromJsonAsync<SyncPullResponseDto>())!;
        Assert.Single(pullResult.Changes);
    }

    [Fact]
    public async Task CreatorLearnsAboutTheJoin_OnHerNextOrdinarySyncPull()
    {
        // Regression test: joining used to never touch Couple.UpdatedAt/Version at all, so the
        // creator's device had no signal a partner had joined — PullAsync's change detection
        // (UpdatedAt > since) never fired, and she'd be stuck seeing "waiting for your partner"
        // indefinitely even after the join had actually succeeded.
        var client = _factory.CreateClient();
        var alice = await RegisterAsync(client, "alice-join-signal@flow.test", "Alice");
        var bob = await RegisterAsync(client, "bob-join-signal@flow.test", "Bob");

        Authorize(client, alice.AccessToken);
        var created = (await (await client.PostAsync("/api/couples", null)).Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;

        // Alice establishes a pull cursor *before* Bob joins — exactly what her app does on
        // every ordinary sync tick while she's alone, waiting.
        Authorize(client, created.Auth.AccessToken);
        var firstPull = (await (await client.GetAsync("/api/sync/pull")).Content.ReadFromJsonAsync<SyncPullResponseDto>())!;
        var cursor = firstPull.ServerTime;

        Authorize(client, bob.AccessToken);
        await client.PostAsJsonAsync("/api/couples/join", new JoinCoupleRequestDto { InviteCode = created.Couple.InviteCode });

        // Alice's next pull, using the cursor from before the join, must now see a change.
        Authorize(client, created.Auth.AccessToken);
        var secondPull = (await (await client.GetAsync($"/api/sync/pull?since={Uri.EscapeDataString(cursor.ToString("O"))}"))
            .Content.ReadFromJsonAsync<SyncPullResponseDto>())!;

        var change = Assert.Single(secondPull.Changes);
        Assert.Equal("couple_profile", change.EntityType);
        var payload = ((JsonElement)change.Payload!).Deserialize<CoupleProfilePayloadDto>(
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.NotNull(payload!.Members);
        Assert.Equal(2, payload.Members!.Count);
        Assert.Contains(payload.Members, m => m.DisplayName == "Bob");
    }

    [Fact]
    public async Task ThirdMember_CannotJoinAFullCouple()
    {
        var client = _factory.CreateClient();
        var alice = await RegisterAsync(client, "alice2@flow.test", "Alice");
        var bob = await RegisterAsync(client, "bob2@flow.test", "Bob");
        var carol = await RegisterAsync(client, "carol2@flow.test", "Carol");

        Authorize(client, alice.AccessToken);
        var created = (await (await client.PostAsync("/api/couples", null)).Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;

        Authorize(client, bob.AccessToken);
        await client.PostAsJsonAsync("/api/couples/join", new JoinCoupleRequestDto { InviteCode = created.Couple.InviteCode });

        Authorize(client, carol.AccessToken);
        var thirdJoin = await client.PostAsJsonAsync("/api/couples/join", new JoinCoupleRequestDto { InviteCode = created.Couple.InviteCode });

        Assert.Equal(HttpStatusCode.Conflict, thirdJoin.StatusCode);
    }
}
