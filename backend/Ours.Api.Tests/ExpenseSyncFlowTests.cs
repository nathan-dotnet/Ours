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
/// Exercises expenses over real HTTP through the same generic sync endpoints as couple_profile
/// and calendar_event — offline create/edit/delete followed by sync, couple isolation, and the
/// partner-switching scenario that is this feature's single highest-priority invariant.
/// </summary>
public class ExpenseSyncFlowTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public ExpenseSyncFlowTests(CustomWebApplicationFactory factory) => _factory = factory;

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
        var alice = await RegisterAsync(client, $"alice-exp-{suffix}@flow.test", "Alice");
        var bob = await RegisterAsync(client, $"bob-exp-{suffix}@flow.test", "Bob");

        Authorize(client, alice.AccessToken);
        var created = (await (await client.PostAsync("/api/couples", null)).Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;

        Authorize(client, bob.AccessToken);
        var joinResponse = await client.PostAsJsonAsync("/api/couples/join", new JoinCoupleRequestDto { InviteCode = created.Couple.InviteCode });
        var joined = (await joinResponse.Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;

        return (client, created, joined.Auth);
    }

    private static SyncPushItemDto CreateExpensePush(Guid id, decimal amount, string description = "Dinner") => new()
    {
        EntityType = SyncService.ExpenseEntityType,
        EntityId = id,
        Operation = SyncOperation.Create,
        ClientUpdatedAt = DateTimeOffset.UtcNow,
        Payload = JsonSerializer.SerializeToElement(new
        {
            amount,
            currency = "PHP",
            category = "Food",
            expenseDate = DateOnly.FromDateTime(DateTime.UtcNow),
            description,
        }),
    };

    [Fact]
    public async Task PartnerCreatesExpense_OtherPartnerPullsIt()
    {
        var (client, alice, bobAuth) = await CreatePairedCoupleAsync(_factory, "pull");
        var expenseId = Guid.NewGuid();

        Authorize(client, alice.Auth.AccessToken);
        var pushResponse = await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes = [CreateExpensePush(expenseId, 1500.00m, "Dinner")],
        });
        Assert.Equal(HttpStatusCode.OK, pushResponse.StatusCode);
        var pushResult = (await pushResponse.Content.ReadFromJsonAsync<SyncPushResponseDto>())!;
        Assert.True(pushResult.Results[0].Accepted);

        Authorize(client, bobAuth.AccessToken);
        var pullResponse = await client.GetAsync("/api/sync/pull");
        var pullResult = (await pullResponse.Content.ReadFromJsonAsync<SyncPullResponseDto>())!;

        var change = Assert.Single(pullResult.Changes, c => c.EntityType == SyncService.ExpenseEntityType);
        Assert.Equal(expenseId, change.EntityId);
        var payload = ((JsonElement)change.Payload!).Deserialize<Ours.Application.DTOs.Expenses.ExpensePayloadDto>(
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.Equal(1500.00m, payload!.Amount);
    }

    [Fact]
    public async Task PartnerEditsSharedExpense_BothSeeTheSameUpdatedRecord()
    {
        var (client, alice, bobAuth) = await CreatePairedCoupleAsync(_factory, "edit");
        var expenseId = Guid.NewGuid();

        Authorize(client, alice.Auth.AccessToken);
        await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [CreateExpensePush(expenseId, 1500.00m)] });

        Authorize(client, bobAuth.AccessToken);
        await client.GetAsync("/api/sync/pull"); // Bob first sees Alice's expense...
        var editResponse = await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes =
            [
                new SyncPushItemDto
                {
                    EntityType = SyncService.ExpenseEntityType,
                    EntityId = expenseId,
                    Operation = SyncOperation.Update,
                    ClientUpdatedAt = DateTimeOffset.UtcNow.AddMinutes(1),
                    Payload = JsonSerializer.SerializeToElement(new
                    {
                        amount = 1800.00m,
                        currency = "PHP",
                        category = "Food",
                        expenseDate = DateOnly.FromDateTime(DateTime.UtcNow),
                        description = "Dinner",
                    }),
                },
            ],
        }); // ...then edits it — the same shared record, not a personal copy.
        Assert.True((await editResponse.Content.ReadFromJsonAsync<SyncPushResponseDto>())!.Results[0].Accepted);

        Authorize(client, alice.Auth.AccessToken);
        var pullResult = (await (await client.GetAsync("/api/sync/pull")).Content.ReadFromJsonAsync<SyncPullResponseDto>())!;
        var change = Assert.Single(pullResult.Changes, c => c.EntityId == expenseId);
        var payload = ((JsonElement)change.Payload!).Deserialize<Ours.Application.DTOs.Expenses.ExpensePayloadDto>(
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.Equal(1800.00m, payload!.Amount);
    }

    [Fact]
    public async Task DeleteOfflineThenSync_PartnerPullsTheDeletion()
    {
        var (client, alice, bobAuth) = await CreatePairedCoupleAsync(_factory, "delete");
        var expenseId = Guid.NewGuid();

        Authorize(client, alice.Auth.AccessToken);
        await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [CreateExpensePush(expenseId, 500.00m)] });
        var deleteResponse = await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes =
            [
                new SyncPushItemDto
                {
                    EntityType = SyncService.ExpenseEntityType,
                    EntityId = expenseId,
                    Operation = SyncOperation.Delete,
                    ClientUpdatedAt = DateTimeOffset.UtcNow.AddMinutes(1),
                    Payload = JsonSerializer.SerializeToElement<object?>(null),
                },
            ],
        });
        Assert.True((await deleteResponse.Content.ReadFromJsonAsync<SyncPushResponseDto>())!.Results[0].Accepted);

        Authorize(client, bobAuth.AccessToken);
        var pullResult = (await (await client.GetAsync("/api/sync/pull")).Content.ReadFromJsonAsync<SyncPullResponseDto>())!;
        var change = Assert.Single(pullResult.Changes, c => c.EntityId == expenseId);
        Assert.Equal(SyncOperation.Delete, change.Operation);
    }

    [Fact]
    public async Task CoupleAB_CannotSeeCoupleCDsExpenses()
    {
        var (clientAB, aliceAB, _) = await CreatePairedCoupleAsync(_factory, "ab");
        var (clientCD, aliceCD, _) = await CreatePairedCoupleAsync(_factory, "cd");

        Authorize(clientAB, aliceAB.Auth.AccessToken);
        await clientAB.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [CreateExpensePush(Guid.NewGuid(), 1500.00m, "AB's dinner")] });

        Authorize(clientCD, aliceCD.Auth.AccessToken);
        var expenseIdCD = Guid.NewGuid();
        await clientCD.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [CreateExpensePush(expenseIdCD, 800.00m, "CD's lunch")] });

        var pullResult = (await (await clientCD.GetAsync("/api/sync/pull")).Content.ReadFromJsonAsync<SyncPullResponseDto>())!;
        var expenseChanges = pullResult.Changes.Where(c => c.EntityType == SyncService.ExpenseEntityType).ToList();
        Assert.Single(expenseChanges);
        Assert.Equal(expenseIdCD, expenseChanges[0].EntityId);
    }

    [Fact]
    public async Task CoupleA_CannotEditCoupleBsExpense()
    {
        var (clientA, aliceA, _) = await CreatePairedCoupleAsync(_factory, "hijack-a");
        var (clientB, aliceB, _) = await CreatePairedCoupleAsync(_factory, "hijack-b");

        Authorize(clientA, aliceA.Auth.AccessToken);
        var expenseId = Guid.NewGuid();
        await clientA.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [CreateExpensePush(expenseId, 1500.00m)] });

        Authorize(clientB, aliceB.Auth.AccessToken);
        var hijackResponse = await clientB.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes =
            [
                new SyncPushItemDto
                {
                    EntityType = SyncService.ExpenseEntityType,
                    EntityId = expenseId,
                    Operation = SyncOperation.Update,
                    ClientUpdatedAt = DateTimeOffset.UtcNow.AddMinutes(1),
                    Payload = JsonSerializer.SerializeToElement(new
                    {
                        amount = 1.00m,
                        currency = "PHP",
                        category = "Food",
                        expenseDate = DateOnly.FromDateTime(DateTime.UtcNow),
                        description = "Hijacked",
                    }),
                },
            ],
        });

        var result = (await hijackResponse.Content.ReadFromJsonAsync<SyncPushResponseDto>())!;
        Assert.False(result.Results[0].Accepted);
    }

    [Fact]
    public async Task PaidByUserId_RejectedWhenNotAnActiveMemberOfTheCallersCouple()
    {
        var (client, alice, _) = await CreatePairedCoupleAsync(_factory, "paidby");
        var strangerId = Guid.NewGuid();

        Authorize(client, alice.Auth.AccessToken);
        var response = await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes =
            [
                new SyncPushItemDto
                {
                    EntityType = SyncService.ExpenseEntityType,
                    EntityId = Guid.NewGuid(),
                    Operation = SyncOperation.Create,
                    ClientUpdatedAt = DateTimeOffset.UtcNow,
                    Payload = JsonSerializer.SerializeToElement(new
                    {
                        amount = 100.00m,
                        currency = "PHP",
                        category = "Food",
                        expenseDate = DateOnly.FromDateTime(DateTime.UtcNow),
                        paidByUserId = strangerId,
                    }),
                },
            ],
        });

        var result = (await response.Content.ReadFromJsonAsync<SyncPushResponseDto>())!;
        Assert.False(result.Results[0].Accepted);
    }

    [Fact]
    public async Task PartnerSwitching_OldExpenseIsInvisibleAfterLeavingAndRepartnering_AndOldPartnerCannotSeeTheNewOne()
    {
        var (clientAB, aliceAB, bobAuth) = await CreatePairedCoupleAsync(_factory, "switch");
        Authorize(clientAB, aliceAB.Auth.AccessToken);
        await clientAB.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes = [CreateExpensePush(Guid.NewGuid(), 1500.00m, "Old Couple Dinner")],
        });

        // A leaves B.
        var leaveResponse = await clientAB.PostAsync("/api/couples/leave", null);
        Assert.Equal(HttpStatusCode.OK, leaveResponse.StatusCode);

        // A joins/creates a couple with C.
        var clientAC = _factory.CreateClient();
        var carol = await RegisterAsync(clientAC, "carol-exp-switch@flow.test", "Carol");
        // Re-authenticate Alice with a fresh token reflecting her post-leave (coupleless) state.
        var aliceLogin = await clientAC.PostAsJsonAsync("/api/auth/login", new LoginRequestDto
        {
            Email = "alice-exp-switch@flow.test",
            Password = "Password123",
        });
        var aliceFreshAuth = (await aliceLogin.Content.ReadFromJsonAsync<AuthResponseDto>())!;
        Authorize(clientAC, aliceFreshAuth.AccessToken);
        var acCouple = (await (await clientAC.PostAsync("/api/couples", null)).Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;

        Authorize(clientAC, acCouple.Auth.AccessToken);
        var pullAfterSwitch = (await (await clientAC.GetAsync("/api/sync/pull")).Content.ReadFromJsonAsync<SyncPullResponseDto>())!;
        Assert.DoesNotContain(pullAfterSwitch.Changes, c => c.EntityType == SyncService.ExpenseEntityType);

        // A creates a new expense with C.
        var newExpenseId = Guid.NewGuid();
        await clientAC.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes = [CreateExpensePush(newExpenseId, 800.00m, "New Couple Dinner")],
        });

        Authorize(clientAC, carol.AccessToken);
        var carolJoin = await clientAC.PostAsJsonAsync("/api/couples/join", new JoinCoupleRequestDto { InviteCode = acCouple.Couple.InviteCode });
        var carolAuth = (await carolJoin.Content.ReadFromJsonAsync<CoupleActionResponseDto>())!.Auth;
        Authorize(clientAC, carolAuth.AccessToken);
        var carolPull = (await (await clientAC.GetAsync("/api/sync/pull")).Content.ReadFromJsonAsync<SyncPullResponseDto>())!;
        var carolExpense = Assert.Single(carolPull.Changes, c => c.EntityType == SyncService.ExpenseEntityType);
        Assert.Equal(newExpenseId, carolExpense.EntityId);

        // B (the old partner) must never see A+C's new expense.
        Authorize(clientAB, bobAuth.AccessToken);
        var bobPull = (await (await clientAB.GetAsync("/api/sync/pull")).Content.ReadFromJsonAsync<SyncPullResponseDto>())!;
        Assert.DoesNotContain(bobPull.Changes, c => c.EntityType == SyncService.ExpenseEntityType && c.EntityId == newExpenseId);
    }
}
