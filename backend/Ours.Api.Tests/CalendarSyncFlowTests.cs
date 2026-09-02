using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Ours.Api.Tests.Infrastructure;
using Ours.Application.DTOs.Auth;
using Ours.Application.DTOs.Couples;
using Ours.Application.DTOs.Sync;
using Ours.Application.Services;
using Xunit;

namespace Ours.Api.Tests;

/// <summary>
/// Exercises calendar events over real HTTP through the same generic sync endpoints as
/// couple_profile — offline create/edit/delete followed by sync, and a partner's device
/// picking up the change via pull.
/// </summary>
public class CalendarSyncFlowTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public CalendarSyncFlowTests(CustomWebApplicationFactory factory) => _factory = factory;

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

    private static async Task<(HttpClient Client, CoupleActionResponseDto Alice, AuthResponseDto Bob)> CreatePairedCoupleAsync(
        CustomWebApplicationFactory factory, string suffix)
    {
        var client = factory.CreateClient();
        var alice = await RegisterAsync(client, $"alice-cal-{suffix}@flow.test", "Alice");
        var bob = await RegisterAsync(client, $"bob-cal-{suffix}@flow.test", "Bob");

        Authorize(client, alice.AccessToken);
        var created = (await (await client.PostAsync("/api/couples", null)).Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;

        Authorize(client, bob.AccessToken);
        var joinResponse = await client.PostAsJsonAsync("/api/couples/join", new JoinCoupleRequestDto { InviteCode = created.Couple.InviteCode });
        var joined = (await joinResponse.Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;

        return (client, created, joined.Auth);
    }

    private static SyncPushItemDto CreateEventPush(Guid id, string title, DateTimeOffset start) => new()
    {
        EntityType = SyncService.CalendarEventEntityType,
        EntityId = id,
        Operation = SyncOperation.Create,
        ClientUpdatedAt = DateTimeOffset.UtcNow,
        Payload = JsonSerializer.SerializeToElement(new { title, startAt = start, endAt = start.AddHours(1) }),
    };

    [Fact]
    public async Task PartnerCreatesEvent_OtherPartnerPullsIt()
    {
        var (client, alice, bobAuth) = await CreatePairedCoupleAsync(_factory, "pull");
        var eventId = Guid.NewGuid();

        Authorize(client, alice.Auth.AccessToken);
        var pushResponse = await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes = [CreateEventPush(eventId, "Movie night", DateTimeOffset.UtcNow.AddDays(1))],
        });
        Assert.Equal(HttpStatusCode.OK, pushResponse.StatusCode);
        var pushResult = (await pushResponse.Content.ReadFromJsonAsync<SyncPushResponseDto>())!;
        Assert.True(pushResult.Results[0].Accepted);

        Authorize(client, bobAuth.AccessToken);
        var pullResponse = await client.GetAsync("/api/sync/pull");
        var pullResult = (await pullResponse.Content.ReadFromJsonAsync<SyncPullResponseDto>())!;

        var change = Assert.Single(pullResult.Changes, c => c.EntityType == SyncService.CalendarEventEntityType);
        Assert.Equal(eventId, change.EntityId);
        Assert.Equal(SyncOperation.Update, change.Operation); // not deleted -> surfaced as an upsert
    }

    [Fact]
    public async Task EditOfflineThenSync_PartnerPullsTheUpdate()
    {
        var (client, alice, bobAuth) = await CreatePairedCoupleAsync(_factory, "edit");
        var eventId = Guid.NewGuid();

        Authorize(client, alice.Auth.AccessToken);
        await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes = [CreateEventPush(eventId, "Dinner", DateTimeOffset.UtcNow.AddDays(1))],
        });

        var editResponse = await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes =
            [
                new SyncPushItemDto
                {
                    EntityType = SyncService.CalendarEventEntityType,
                    EntityId = eventId,
                    Operation = SyncOperation.Update,
                    ClientUpdatedAt = DateTimeOffset.UtcNow.AddMinutes(1),
                    Payload = JsonSerializer.SerializeToElement(new
                    {
                        title = "Dinner (moved)",
                        startAt = DateTimeOffset.UtcNow.AddDays(2),
                        endAt = DateTimeOffset.UtcNow.AddDays(2).AddHours(1),
                    }),
                },
            ],
        });
        Assert.True((await editResponse.Content.ReadFromJsonAsync<SyncPushResponseDto>())!.Results[0].Accepted);

        Authorize(client, bobAuth.AccessToken);
        var pullResult = (await (await client.GetAsync("/api/sync/pull")).Content.ReadFromJsonAsync<SyncPullResponseDto>())!;
        var change = Assert.Single(pullResult.Changes, c => c.EntityId == eventId);
        var payload = ((JsonElement)change.Payload!).Deserialize<Ours.Application.DTOs.Calendar.CalendarEventPayloadDto>(
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.Equal("Dinner (moved)", payload!.Title);
    }

    [Fact]
    public async Task DeleteOfflineThenSync_PartnerPullsTheDeletion()
    {
        var (client, alice, bobAuth) = await CreatePairedCoupleAsync(_factory, "delete");
        var eventId = Guid.NewGuid();

        Authorize(client, alice.Auth.AccessToken);
        await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes = [CreateEventPush(eventId, "Cancelled trip", DateTimeOffset.UtcNow.AddDays(3))],
        });

        var deleteResponse = await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes =
            [
                new SyncPushItemDto
                {
                    EntityType = SyncService.CalendarEventEntityType,
                    EntityId = eventId,
                    Operation = SyncOperation.Delete,
                    ClientUpdatedAt = DateTimeOffset.UtcNow.AddMinutes(1),
                    Payload = JsonSerializer.SerializeToElement<object?>(null),
                },
            ],
        });
        Assert.True((await deleteResponse.Content.ReadFromJsonAsync<SyncPushResponseDto>())!.Results[0].Accepted);

        Authorize(client, bobAuth.AccessToken);
        var pullResult = (await (await client.GetAsync("/api/sync/pull")).Content.ReadFromJsonAsync<SyncPullResponseDto>())!;
        var change = Assert.Single(pullResult.Changes, c => c.EntityId == eventId);
        Assert.Equal(SyncOperation.Delete, change.Operation);
    }

    [Fact]
    public async Task CoupleA_CannotEditCoupleBsEvent()
    {
        var (clientA, aliceA, _) = await CreatePairedCoupleAsync(_factory, "a");
        var (clientB, aliceB, _) = await CreatePairedCoupleAsync(_factory, "b");

        Authorize(clientA, aliceA.Auth.AccessToken);
        var eventId = Guid.NewGuid();
        await clientA.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes = [CreateEventPush(eventId, "Couple A's event", DateTimeOffset.UtcNow.AddDays(1))],
        });

        Authorize(clientB, aliceB.Auth.AccessToken);
        var hijackResponse = await clientB.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes =
            [
                new SyncPushItemDto
                {
                    EntityType = SyncService.CalendarEventEntityType,
                    EntityId = eventId,
                    Operation = SyncOperation.Update,
                    ClientUpdatedAt = DateTimeOffset.UtcNow.AddMinutes(1),
                    Payload = JsonSerializer.SerializeToElement(new
                    {
                        title = "Hijacked",
                        startAt = DateTimeOffset.UtcNow,
                        endAt = DateTimeOffset.UtcNow.AddHours(1),
                    }),
                },
            ],
        });

        var result = (await hijackResponse.Content.ReadFromJsonAsync<SyncPushResponseDto>())!;
        Assert.False(result.Results[0].Accepted);
    }
}
