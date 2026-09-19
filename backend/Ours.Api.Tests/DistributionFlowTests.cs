using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Ours.Api.Tests.Infrastructure;
using Ours.Application.DTOs.Auth;
using Ours.Application.DTOs.Couples;
using Ours.Application.DTOs.Money;
using Ours.Application.DTOs.Sync;
using Ours.Application.Services;
using Xunit;

namespace Ours.Api.Tests;

/// <summary>
/// Exercises the Money Calculator's "Distribute Money" action over real HTTP: server-side
/// reconciliation, the duplicate-period guard and its Force override, and that every bucket
/// genuinely credits its destination account (Wants split between both partners) — see
/// MissMeFlowTests for the sibling "dedicated endpoint, not generic sync" feature this one is
/// modeled after.
/// </summary>
public class DistributionFlowTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public DistributionFlowTests(CustomWebApplicationFactory factory) => _factory = factory;

    private static async Task<AuthResponseDto> RegisterAsync(HttpClient client, string email, string displayName = "Alice")
    {
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequestDto { Email = email, Password = "Password123", DisplayName = displayName });
        return (await response.Content.ReadFromJsonAsync<AuthResponseDto>())!;
    }

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);

    private static SyncPushItemDto AccountPush(Guid id, string name) => new()
    {
        EntityType = SyncService.AccountEntityType,
        EntityId = id,
        Operation = SyncOperation.Create,
        ClientUpdatedAt = DateTimeOffset.UtcNow,
        Payload = JsonSerializer.SerializeToElement(new { name, type = "Bank", icon = "bpi", openingBalance = 0m, currency = "PHP", isActive = true }),
    };

    private static SyncPushItemDto SavingsGoalPush(Guid id, string name) => new()
    {
        EntityType = SyncService.SavingsGoalEntityType,
        EntityId = id,
        Operation = SyncOperation.Create,
        ClientUpdatedAt = DateTimeOffset.UtcNow,
        Payload = JsonSerializer.SerializeToElement(new { name, targetAmount = 50_000m, currency = "PHP", isActive = true }),
    };

    /// <summary>
    /// Registers Alice and Bob as a paired couple, and pushes Budget/Savings/Alice-Wants/Bob-Wants
    /// accounts plus two savings goals — everything a distribution needs.
    /// </summary>
    private static async Task<(
        HttpClient Client,
        Guid AliceId,
        Guid BobId,
        Guid BudgetAccountId,
        Guid SavingsAccountId,
        Guid AliceWantsAccountId,
        Guid BobWantsAccountId,
        Guid GoalAId,
        Guid GoalBId)> SetUpAsync(CustomWebApplicationFactory factory, string suffix)
    {
        var client = factory.CreateClient();
        var alice = await RegisterAsync(client, $"distribute-alice-{suffix}@flow.test", "Alice");
        Authorize(client, alice.AccessToken);
        var createResponse = await client.PostAsync("/api/couples", null);
        createResponse.EnsureSuccessStatusCode();
        var created = (await createResponse.Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;
        // The registration token has no coupleId claim yet — re-authorize with the fresh pair
        // create/join actually returns, exactly like every other flow test does.
        Authorize(client, created.Auth.AccessToken);

        var bobClient = factory.CreateClient();
        var bob = await RegisterAsync(bobClient, $"distribute-bob-{suffix}@flow.test", "Bob");
        Authorize(bobClient, bob.AccessToken);
        var joinResponse = await bobClient.PostAsJsonAsync("/api/couples/join", new JoinCoupleRequestDto { InviteCode = created.Couple.InviteCode });
        joinResponse.EnsureSuccessStatusCode();

        var budgetAccountId = Guid.NewGuid();
        var savingsAccountId = Guid.NewGuid();
        var aliceWantsAccountId = Guid.NewGuid();
        var bobWantsAccountId = Guid.NewGuid();
        var goalAId = Guid.NewGuid();
        var goalBId = Guid.NewGuid();
        var pushResponse = await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes =
            [
                AccountPush(budgetAccountId, "MariBank"),
                AccountPush(savingsAccountId, "BPI"),
                AccountPush(aliceWantsAccountId, "GCash"),
                AccountPush(bobWantsAccountId, "Maya"),
                SavingsGoalPush(goalAId, "Emergency Fund"),
                SavingsGoalPush(goalBId, "Travel"),
            ],
        });
        pushResponse.EnsureSuccessStatusCode();

        return (client, alice.User.Id, bob.User.Id, budgetAccountId, savingsAccountId, aliceWantsAccountId, bobWantsAccountId, goalAId, goalBId);
    }

    private static DistributeMoneyRequestDto ValidRequest(
        Guid budgetAccountId, Guid savingsAccountId, Guid aliceId, Guid aliceWantsAccountId, Guid bobId, Guid bobWantsAccountId, Guid goalAId, Guid goalBId, bool force = false) => new()
    {
        Year = 2026,
        Month = 9,
        CombinedIncome = 50_000m,
        Currency = "PHP",
        BudgetPercent = 50m,
        BudgetAccountId = budgetAccountId,
        SavingsPercent = 30m,
        SavingsAccountId = savingsAccountId,
        SavingsGoalAllocations =
        [
            new SavingsGoalAllocationInputDto { SavingsGoalId = goalAId, AllocationPercent = 60m },
            new SavingsGoalAllocationInputDto { SavingsGoalId = goalBId, AllocationPercent = 40m },
        ],
        WantsPercent = 20m,
        WantsAllocations =
        [
            new WantsAllocationInputDto { UserId = aliceId, AllocationPercent = 50m, AccountId = aliceWantsAccountId },
            new WantsAllocationInputDto { UserId = bobId, AllocationPercent = 50m, AccountId = bobWantsAccountId },
        ],
        Force = force,
    };

    [Fact]
    public async Task Distribute_RequiresAuthentication()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            "/api/distributions",
            ValidRequest(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid()));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Distribute_CreditsEachAccount_SplittingWantsBetweenBothPartners_ThenStatusReportsAlreadyDistributed()
    {
        var (client, aliceId, bobId, budgetAccountId, savingsAccountId, aliceWantsAccountId, bobWantsAccountId, goalAId, goalBId) = await SetUpAsync(_factory, "success");

        var response = await client.PostAsJsonAsync(
            "/api/distributions", ValidRequest(budgetAccountId, savingsAccountId, aliceId, aliceWantsAccountId, bobId, bobWantsAccountId, goalAId, goalBId));
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<DistributeMoneyResponseDto>();

        Assert.Equal(25_000m, body!.Distribution.BudgetAmount);
        Assert.Equal(15_000m, body.Distribution.SavingsAmount);
        Assert.Equal(10_000m, body.Distribution.WantsAmount);

        var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        var pulled = await (await client.GetAsync("/api/sync/pull")).Content.ReadFromJsonAsync<SyncPullResponseDto>();
        var allocationPayloads = pulled!.Changes
            .Where(c => c.EntityType == SyncService.TransactionEntityType)
            .Select(c => ((JsonElement)c.Payload!).Deserialize<TransactionPayloadDto>(jsonOptions)!)
            .Where(p => p.Type == "IncomeAllocation")
            .ToList();
        Assert.Equal(4, allocationPayloads.Count); // Budget, Savings, Alice's Wants share, Bob's Wants share
        Assert.Contains(allocationPayloads, p => p.AccountId == budgetAccountId && p.Amount == 25_000m);
        Assert.Contains(allocationPayloads, p => p.AccountId == savingsAccountId && p.Amount == 15_000m);
        Assert.Contains(allocationPayloads, p => p.AccountId == aliceWantsAccountId && p.Amount == 5_000m && p.PaidByUserId == aliceId);
        Assert.Contains(allocationPayloads, p => p.AccountId == bobWantsAccountId && p.Amount == 5_000m && p.PaidByUserId == bobId);

        var status = await (await client.GetAsync("/api/distributions/status?year=2026&month=9")).Content.ReadFromJsonAsync<DistributionStatusResponseDto>();
        Assert.True(status!.AlreadyDistributed);
        Assert.Single(status.DistributionsForPeriod);
    }

    [Fact]
    public async Task Distribute_RejectsASecondAttempt_ButAllowsItWithForce()
    {
        var (client, aliceId, bobId, budgetAccountId, savingsAccountId, aliceWantsAccountId, bobWantsAccountId, goalAId, goalBId) = await SetUpAsync(_factory, "duplicate");
        var request = ValidRequest(budgetAccountId, savingsAccountId, aliceId, aliceWantsAccountId, bobId, bobWantsAccountId, goalAId, goalBId);
        await client.PostAsJsonAsync("/api/distributions", request);

        var secondAttempt = await client.PostAsJsonAsync("/api/distributions", request);
        Assert.Equal(HttpStatusCode.Conflict, secondAttempt.StatusCode);

        var forcedRequest = ValidRequest(budgetAccountId, savingsAccountId, aliceId, aliceWantsAccountId, bobId, bobWantsAccountId, goalAId, goalBId, force: true);
        var forced = await client.PostAsJsonAsync("/api/distributions", forcedRequest);
        Assert.Equal(HttpStatusCode.OK, forced.StatusCode);
    }

    [Fact]
    public async Task Distribute_RejectsAnAllocationThatDoesNotSumTo100()
    {
        var (client, aliceId, bobId, budgetAccountId, savingsAccountId, aliceWantsAccountId, bobWantsAccountId, goalAId, goalBId) = await SetUpAsync(_factory, "badpercent");
        var request = ValidRequest(budgetAccountId, savingsAccountId, aliceId, aliceWantsAccountId, bobId, bobWantsAccountId, goalAId, goalBId);
        var badRequest = new DistributeMoneyRequestDto
        {
            Year = request.Year,
            Month = request.Month,
            CombinedIncome = request.CombinedIncome,
            Currency = request.Currency,
            BudgetPercent = 50m,
            BudgetAccountId = budgetAccountId,
            SavingsPercent = 30m,
            SavingsAccountId = savingsAccountId,
            SavingsGoalAllocations = request.SavingsGoalAllocations,
            WantsPercent = 30m, // 110
            WantsAllocations = request.WantsAllocations,
        };

        var response = await client.PostAsJsonAsync("/api/distributions", badRequest);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Distribute_RejectsAWantsSplitThatDoesNotSumTo100()
    {
        var (client, aliceId, bobId, budgetAccountId, savingsAccountId, aliceWantsAccountId, bobWantsAccountId, goalAId, goalBId) = await SetUpAsync(_factory, "badwants");
        var request = ValidRequest(budgetAccountId, savingsAccountId, aliceId, aliceWantsAccountId, bobId, bobWantsAccountId, goalAId, goalBId);
        var badRequest = new DistributeMoneyRequestDto
        {
            Year = request.Year,
            Month = request.Month,
            CombinedIncome = request.CombinedIncome,
            Currency = request.Currency,
            BudgetPercent = request.BudgetPercent,
            BudgetAccountId = budgetAccountId,
            SavingsPercent = request.SavingsPercent,
            SavingsAccountId = savingsAccountId,
            SavingsGoalAllocations = request.SavingsGoalAllocations,
            WantsPercent = request.WantsPercent,
            WantsAllocations =
            [
                new WantsAllocationInputDto { UserId = aliceId, AllocationPercent = 60m, AccountId = aliceWantsAccountId },
                new WantsAllocationInputDto { UserId = bobId, AllocationPercent = 30m, AccountId = bobWantsAccountId }, // 60+30 = 90
            ],
        };

        var response = await client.PostAsJsonAsync("/api/distributions", badRequest);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Distribute_CanNeverBeUsedAcrossCoupleBoundaries()
    {
        var (aliceClient, aliceId, bobId, aliceBudgetAccountId, aliceSavingsAccountId, aliceWantsAccountId, bobWantsAccountId, aliceGoalAId, aliceGoalBId) =
            await SetUpAsync(_factory, "isolation-a");
        var (_, _, _, _, otherSavingsAccountId, _, _, _, _) = await SetUpAsync(_factory, "isolation-b");

        // Alice tries to distribute using the other couple's savings account id — must not
        // succeed just because the id exists somewhere in the system.
        var request = ValidRequest(aliceBudgetAccountId, otherSavingsAccountId, aliceId, aliceWantsAccountId, bobId, bobWantsAccountId, aliceGoalAId, aliceGoalBId);
        var response = await aliceClient.PostAsJsonAsync("/api/distributions", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
