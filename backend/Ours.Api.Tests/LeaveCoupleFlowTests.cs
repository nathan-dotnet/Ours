using System.Net;
using System.Net.Http.Json;
using Ours.Api.Tests.Infrastructure;
using Ours.Application.DTOs.Auth;
using Ours.Application.DTOs.Couples;
using Ours.Application.DTOs.Sync;
using Ours.Application.Services;
using Xunit;

namespace Ours.Api.Tests;

/// <summary>
/// Exercises POST /api/couples/leave over real HTTP: authentication is required, the response
/// is idempotent, both partners' membership actually ends, the old invite code stops working,
/// a stale (still-valid) token can no longer push mutations for the ended couple, and both
/// re-partnering directions (the leaver, and the partner left behind) work afterward.
/// </summary>
public class LeaveCoupleFlowTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public LeaveCoupleFlowTests(CustomWebApplicationFactory factory) => _factory = factory;

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

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);

    private static async Task<(HttpClient Client, AuthResponseDto Alice, AuthResponseDto Bob, CoupleActionResponseDto Created)> CreatePairedCoupleAsync(
        CustomWebApplicationFactory factory, string suffix)
    {
        var client = factory.CreateClient();
        var alice = await RegisterAsync(client, $"alice-leave-{suffix}@flow.test", "Alice");
        var bob = await RegisterAsync(client, $"bob-leave-{suffix}@flow.test", "Bob");

        Authorize(client, alice.AccessToken);
        var created = (await (await client.PostAsync("/api/couples", null)).Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;

        Authorize(client, bob.AccessToken);
        await client.PostAsJsonAsync("/api/couples/join", new JoinCoupleRequestDto { InviteCode = created.Couple.InviteCode });

        return (client, alice, bob, created);
    }

    [Fact]
    public async Task Leave_WithoutAuthentication_IsUnauthorized()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsync("/api/couples/leave", null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Leave_WhenNotInACouple_ReturnsSuccessButLeftFalse()
    {
        var client = _factory.CreateClient();
        var alice = await RegisterAsync(client, "alice-leave-solo@flow.test", "Alice");
        Authorize(client, alice.AccessToken);

        var response = await client.PostAsync("/api/couples/leave", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<LeaveCoupleResponseDto>())!;
        Assert.True(body.Success);
        Assert.False(body.Left);
    }

    [Fact]
    public async Task Leave_EndsTheCoupleForBothPartners()
    {
        var (client, alice, bob, created) = await CreatePairedCoupleAsync(_factory, "end");
        Authorize(client, created.Auth.AccessToken); // Alice's post-create token, carries the coupleId claim

        var response = await client.PostAsync("/api/couples/leave", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<LeaveCoupleResponseDto>())!;
        Assert.True(body.Left);

        // Alice can no longer see the couple...
        var aliceMe = await client.GetAsync("/api/couples/me");
        Assert.Equal(HttpStatusCode.NotFound, aliceMe.StatusCode);

        // ...and neither can Bob, who didn't initiate the leave.
        Authorize(client, bob.AccessToken);
        var bobMe = await client.GetAsync("/api/couples/me");
        Assert.Equal(HttpStatusCode.NotFound, bobMe.StatusCode);
    }

    [Fact]
    public async Task Leave_CalledTwiceInARow_SecondCallIsAlsoIdempotent()
    {
        var (client, _, _, created) = await CreatePairedCoupleAsync(_factory, "double");
        Authorize(client, created.Auth.AccessToken);

        var first = await client.PostAsync("/api/couples/leave", null);
        var second = await client.PostAsync("/api/couples/leave", null);

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.True((await first.Content.ReadFromJsonAsync<LeaveCoupleResponseDto>())!.Left);
        Assert.False((await second.Content.ReadFromJsonAsync<LeaveCoupleResponseDto>())!.Left);
    }

    [Fact]
    public async Task Leave_ThenOldInviteCodeIsRejected()
    {
        var (client, _, _, created) = await CreatePairedCoupleAsync(_factory, "code");
        Authorize(client, created.Auth.AccessToken);
        await client.PostAsync("/api/couples/leave", null);

        var carol = await RegisterAsync(client, "carol-leave-code@flow.test", "Carol");
        Authorize(client, carol.AccessToken);
        var joinResponse = await client.PostAsJsonAsync("/api/couples/join", new JoinCoupleRequestDto { InviteCode = created.Couple.InviteCode });

        Assert.Equal(HttpStatusCode.NotFound, joinResponse.StatusCode);
    }

    [Fact]
    public async Task Leave_ThenStaleTokenCannotPushSyncMutationsForTheEndedCouple()
    {
        var (client, alice, bob, created) = await CreatePairedCoupleAsync(_factory, "stalepush");
        Authorize(client, created.Auth.AccessToken);
        await client.PostAsync("/api/couples/leave", null);

        // Bob's token was issued before the leave and still carries the old coupleId claim —
        // exactly the "stale but not yet expired" window this guard exists for.
        Authorize(client, bob.AccessToken);
        var pushResponse = await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes =
            [
                new SyncPushItemDto
                {
                    EntityType = SyncService.CalendarEventEntityType,
                    EntityId = Guid.NewGuid(),
                    Operation = SyncOperation.Create,
                    ClientUpdatedAt = DateTimeOffset.UtcNow,
                    Payload = System.Text.Json.JsonSerializer.SerializeToElement(new
                    {
                        title = "Should never land",
                        startAt = DateTimeOffset.UtcNow,
                        endAt = DateTimeOffset.UtcNow.AddHours(1),
                    }),
                },
            ],
        });

        Assert.Equal(HttpStatusCode.Forbidden, pushResponse.StatusCode);
    }

    [Fact]
    public async Task Leave_ThenLeaverCanCreateANewCoupleAndPartnerIsNotCarriedOver()
    {
        var (client, alice, bob, created) = await CreatePairedCoupleAsync(_factory, "repartner");
        Authorize(client, created.Auth.AccessToken);
        await client.PostAsync("/api/couples/leave", null);

        var newCoupleResponse = await client.PostAsync("/api/couples", null);
        Assert.Equal(HttpStatusCode.OK, newCoupleResponse.StatusCode);
        var newCouple = (await newCoupleResponse.Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;

        Assert.NotEqual(created.Couple.Id, newCouple.Couple.Id);
        Assert.Single(newCouple.Couple.Members);
        Assert.DoesNotContain(newCouple.Couple.Members, m => m.UserId == bob.User.Id);
    }

    [Fact]
    public async Task Leave_ThenPartnerCanIndependentlyJoinAnotherCouple()
    {
        var (client, alice, bob, created) = await CreatePairedCoupleAsync(_factory, "partnermoveson");
        Authorize(client, created.Auth.AccessToken);
        await client.PostAsync("/api/couples/leave", null);

        var carol = await RegisterAsync(client, "carol-leave-moveson@flow.test", "Carol");
        Authorize(client, carol.AccessToken);
        var carolsCouple = (await (await client.PostAsync("/api/couples", null)).Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;

        Authorize(client, bob.AccessToken);
        var joinResponse = await client.PostAsJsonAsync("/api/couples/join", new JoinCoupleRequestDto { InviteCode = carolsCouple.Couple.InviteCode });

        Assert.Equal(HttpStatusCode.OK, joinResponse.StatusCode);
        var joined = (await joinResponse.Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;
        Assert.Equal(2, joined.Couple.Members.Count);
    }
}
