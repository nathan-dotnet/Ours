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
/// Exercises the Money System (Account/Transaction/Budget) over real HTTP through the same
/// generic sync endpoints as every other feature — couple isolation, partner switching (the
/// highest-priority invariant of this phase), and cross-couple security.
/// </summary>
public class MoneySyncFlowTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public MoneySyncFlowTests(CustomWebApplicationFactory factory) => _factory = factory;

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
        var alice = await RegisterAsync(client, $"alice-money-{suffix}@flow.test", "Alice");
        var bob = await RegisterAsync(client, $"bob-money-{suffix}@flow.test", "Bob");

        Authorize(client, alice.AccessToken);
        var created = (await (await client.PostAsync("/api/couples", null)).Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;

        Authorize(client, bob.AccessToken);
        var joinResponse = await client.PostAsJsonAsync("/api/couples/join", new JoinCoupleRequestDto { InviteCode = created.Couple.InviteCode });
        var joined = (await joinResponse.Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;

        return (client, created, joined.Auth);
    }

    private static SyncPushItemDto CreateAccountPush(Guid id, string name, decimal openingBalance) => new()
    {
        EntityType = SyncService.AccountEntityType,
        EntityId = id,
        Operation = SyncOperation.Create,
        ClientUpdatedAt = DateTimeOffset.UtcNow,
        Payload = JsonSerializer.SerializeToElement(new { name, type = "Bank", icon = "bpi", openingBalance, currency = "PHP", isActive = true }),
    };

    private static SyncPushItemDto CreateExpensePush(Guid id, Guid accountId, decimal amount, string description = "Dinner") => new()
    {
        EntityType = SyncService.TransactionEntityType,
        EntityId = id,
        Operation = SyncOperation.Create,
        ClientUpdatedAt = DateTimeOffset.UtcNow,
        Payload = JsonSerializer.SerializeToElement(new
        {
            type = "Expense",
            amount,
            currency = "PHP",
            accountId,
            category = "Food",
            transactionDate = DateOnly.FromDateTime(DateTime.UtcNow),
            description,
        }),
    };

    private static SyncPushItemDto CreateBudgetPush(Guid id, string category, decimal amount) => new()
    {
        EntityType = SyncService.BudgetEntityType,
        EntityId = id,
        Operation = SyncOperation.Create,
        ClientUpdatedAt = DateTimeOffset.UtcNow,
        Payload = JsonSerializer.SerializeToElement(new { category, year = DateTime.UtcNow.Year, month = DateTime.UtcNow.Month, amount, currency = "PHP" }),
    };

    [Fact]
    public async Task PartnerCreatesAccountAndExpense_OtherPartnerPullsBoth()
    {
        var (client, alice, bobAuth) = await CreatePairedCoupleAsync(_factory, "pull");
        var accountId = Guid.NewGuid();

        Authorize(client, alice.Auth.AccessToken);
        await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [CreateAccountPush(accountId, "BPI", 10_000m)] });
        var expenseId = Guid.NewGuid();
        await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [CreateExpensePush(expenseId, accountId, 500m)] });

        Authorize(client, bobAuth.AccessToken);
        var pullResult = (await (await client.GetAsync("/api/sync/pull")).Content.ReadFromJsonAsync<SyncPullResponseDto>())!;

        Assert.Contains(pullResult.Changes, c => c.EntityType == SyncService.AccountEntityType && c.EntityId == accountId);
        Assert.Contains(pullResult.Changes, c => c.EntityType == SyncService.TransactionEntityType && c.EntityId == expenseId);
    }

    [Fact]
    public async Task TransferBetweenAccounts_BothPartnersConverge()
    {
        var (client, alice, bobAuth) = await CreatePairedCoupleAsync(_factory, "transfer");
        var bpi = Guid.NewGuid();
        var cash = Guid.NewGuid();

        Authorize(client, alice.Auth.AccessToken);
        await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes = [CreateAccountPush(bpi, "BPI", 10_000m), CreateAccountPush(cash, "Cash", 5_000m)],
        });
        var transferId = Guid.NewGuid();
        var transferResponse = await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes =
            [
                new SyncPushItemDto
                {
                    EntityType = SyncService.TransactionEntityType,
                    EntityId = transferId,
                    Operation = SyncOperation.Create,
                    ClientUpdatedAt = DateTimeOffset.UtcNow,
                    Payload = JsonSerializer.SerializeToElement(new
                    {
                        type = "Transfer",
                        amount = 2_000m,
                        currency = "PHP",
                        accountId = bpi,
                        destinationAccountId = cash,
                        transactionDate = DateOnly.FromDateTime(DateTime.UtcNow),
                    }),
                },
            ],
        });
        Assert.True((await transferResponse.Content.ReadFromJsonAsync<SyncPushResponseDto>())!.Results[0].Accepted);

        Authorize(client, bobAuth.AccessToken);
        var pullResult = (await (await client.GetAsync("/api/sync/pull")).Content.ReadFromJsonAsync<SyncPullResponseDto>())!;
        var change = Assert.Single(pullResult.Changes, c => c.EntityId == transferId);
        var payload = ((JsonElement)change.Payload!).Deserialize<Ours.Application.DTOs.Money.TransactionPayloadDto>(
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.Equal("Transfer", payload!.Type);
        Assert.Equal(cash, payload.DestinationAccountId);
    }

    [Fact]
    public async Task CoupleAB_CannotSeeCoupleCDsMoneyData()
    {
        var (clientAB, aliceAB, _) = await CreatePairedCoupleAsync(_factory, "ab");
        var (clientCD, aliceCD, _) = await CreatePairedCoupleAsync(_factory, "cd");

        Authorize(clientAB, aliceAB.Auth.AccessToken);
        await clientAB.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [CreateAccountPush(Guid.NewGuid(), "AB's BPI", 10_000m)] });

        Authorize(clientCD, aliceCD.Auth.AccessToken);
        var cdAccountId = Guid.NewGuid();
        await clientCD.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [CreateAccountPush(cdAccountId, "CD's GCash", 5_000m)] });

        var pullResult = (await (await clientCD.GetAsync("/api/sync/pull")).Content.ReadFromJsonAsync<SyncPullResponseDto>())!;
        var accountChanges = pullResult.Changes.Where(c => c.EntityType == SyncService.AccountEntityType).ToList();
        Assert.Single(accountChanges);
        Assert.Equal(cdAccountId, accountChanges[0].EntityId);
    }

    [Fact]
    public async Task PartnerSwitching_OldAccountTransactionAndBudget_AreInvisibleAfterLeavingAndRepartnering()
    {
        var (clientAB, aliceAB, bobAuth) = await CreatePairedCoupleAsync(_factory, "switch");
        Authorize(clientAB, aliceAB.Auth.AccessToken);
        var oldAccountId = Guid.NewGuid();
        await clientAB.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [CreateAccountPush(oldAccountId, "BPI", 10_000m)] });
        await clientAB.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [CreateExpensePush(Guid.NewGuid(), oldAccountId, 1_000m, "Dinner")] });
        await clientAB.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [CreateBudgetPush(Guid.NewGuid(), "Food", 5_000m)] });

        // A leaves B.
        var leaveResponse = await clientAB.PostAsync("/api/couples/leave", null);
        Assert.Equal(HttpStatusCode.OK, leaveResponse.StatusCode);

        // A joins/creates a couple with C.
        var clientAC = _factory.CreateClient();
        var carol = await RegisterAsync(clientAC, "carol-money-switch@flow.test", "Carol");
        var aliceLogin = await clientAC.PostAsJsonAsync("/api/auth/login", new LoginRequestDto
        {
            Email = "alice-money-switch@flow.test",
            Password = "Password123",
        });
        var aliceFreshAuth = (await aliceLogin.Content.ReadFromJsonAsync<AuthResponseDto>())!;
        Authorize(clientAC, aliceFreshAuth.AccessToken);
        var acCouple = (await (await clientAC.PostAsync("/api/couples", null)).Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;

        Authorize(clientAC, acCouple.Auth.AccessToken);
        var pullAfterSwitch = (await (await clientAC.GetAsync("/api/sync/pull")).Content.ReadFromJsonAsync<SyncPullResponseDto>())!;
        Assert.DoesNotContain(pullAfterSwitch.Changes, c => c.EntityType == SyncService.AccountEntityType);
        Assert.DoesNotContain(pullAfterSwitch.Changes, c => c.EntityType == SyncService.TransactionEntityType);
        Assert.DoesNotContain(pullAfterSwitch.Changes, c => c.EntityType == SyncService.BudgetEntityType);

        // A creates a fresh account with C.
        var newAccountId = Guid.NewGuid();
        await clientAC.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [CreateAccountPush(newAccountId, "GCash", 5_000m)] });

        Authorize(clientAC, carol.AccessToken);
        var carolJoin = await clientAC.PostAsJsonAsync("/api/couples/join", new JoinCoupleRequestDto { InviteCode = acCouple.Couple.InviteCode });
        var carolAuth = (await carolJoin.Content.ReadFromJsonAsync<CoupleActionResponseDto>())!.Auth;
        Authorize(clientAC, carolAuth.AccessToken);
        var carolPull = (await (await clientAC.GetAsync("/api/sync/pull")).Content.ReadFromJsonAsync<SyncPullResponseDto>())!;
        var carolAccount = Assert.Single(carolPull.Changes, c => c.EntityType == SyncService.AccountEntityType);
        Assert.Equal(newAccountId, carolAccount.EntityId);

        // B (the old partner) must never see A+C's new account.
        Authorize(clientAB, bobAuth.AccessToken);
        var bobPull = (await (await clientAB.GetAsync("/api/sync/pull")).Content.ReadFromJsonAsync<SyncPullResponseDto>())!;
        Assert.DoesNotContain(bobPull.Changes, c => c.EntityType == SyncService.AccountEntityType && c.EntityId == newAccountId);
    }

    [Fact]
    public async Task StaleToken_CannotPushMoneyMutations_AfterLeavingTheCouple()
    {
        var (client, alice, _) = await CreatePairedCoupleAsync(_factory, "staletoken");
        Authorize(client, alice.Auth.AccessToken);
        var accountId = Guid.NewGuid();
        await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [CreateAccountPush(accountId, "BPI", 10_000m)] });

        await client.PostAsync("/api/couples/leave", null);

        // Still using the pre-leave access token — its coupleId claim is now stale.
        var response = await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes = [CreateExpensePush(Guid.NewGuid(), accountId, 500m)],
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task PaidByUserId_RejectedWhenNotAnActiveMemberOfTheCallersCouple()
    {
        var (client, alice, _) = await CreatePairedCoupleAsync(_factory, "paidby");
        Authorize(client, alice.Auth.AccessToken);
        var accountId = Guid.NewGuid();
        await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [CreateAccountPush(accountId, "BPI", 10_000m)] });

        var response = await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes =
            [
                new SyncPushItemDto
                {
                    EntityType = SyncService.TransactionEntityType,
                    EntityId = Guid.NewGuid(),
                    Operation = SyncOperation.Create,
                    ClientUpdatedAt = DateTimeOffset.UtcNow,
                    Payload = JsonSerializer.SerializeToElement(new
                    {
                        type = "Expense",
                        amount = 100.00m,
                        currency = "PHP",
                        accountId,
                        category = "Food",
                        transactionDate = DateOnly.FromDateTime(DateTime.UtcNow),
                        paidByUserId = Guid.NewGuid(),
                    }),
                },
            ],
        });

        var result = (await response.Content.ReadFromJsonAsync<SyncPushResponseDto>())!;
        Assert.False(result.Results[0].Accepted);
    }
}
