using Microsoft.EntityFrameworkCore;
using Ours.Application.Common;
using Ours.Application.DTOs.Money;
using Ours.Application.Services;
using Ours.Application.Tests.Fakes;
using Ours.Domain.Entities;
using Ours.Infrastructure.Persistence;
using Xunit;

namespace Ours.Application.Tests.Services;

public class DistributionServiceTests
{
    private static async Task<(
        DistributionService Service,
        FakeDateTimeProvider Clock,
        AppDbContext Db,
        Guid CoupleId,
        Guid AliceId,
        Guid BobId,
        Account BudgetAccount,
        Account SavingsAccount,
        Account AliceWantsAccount,
        Account BobWantsAccount,
        SavingsGoal EmergencyFund,
        SavingsGoal Travel)> BuildAsync()
    {
        var db = TestDbContextFactory.Create();
        var clock = new FakeDateTimeProvider();
        var aliceId = Guid.NewGuid();
        var bobId = Guid.NewGuid();
        var coupleId = Guid.NewGuid();

        db.Couples.Add(new Couple
        {
            Id = coupleId,
            InviteCode = "OURS-TEST",
            CreatedByUserId = aliceId,
            UpdatedByUserId = aliceId,
            CreatedAt = clock.UtcNow,
            UpdatedAt = clock.UtcNow,
            Version = 1,
        });
        db.CoupleMembers.Add(new CoupleMember { Id = Guid.NewGuid(), CoupleId = coupleId, UserId = aliceId, JoinedAt = clock.UtcNow });
        db.CoupleMembers.Add(new CoupleMember { Id = Guid.NewGuid(), CoupleId = coupleId, UserId = bobId, JoinedAt = clock.UtcNow });

        Account MakeAccount(string name) => new()
        {
            Id = Guid.NewGuid(),
            CoupleId = coupleId,
            Name = name,
            Type = AccountType.Bank,
            OpeningBalance = 0m,
            CreatedByUserId = aliceId,
            UpdatedByUserId = aliceId,
            CreatedAt = clock.UtcNow,
            UpdatedAt = clock.UtcNow,
            Version = 1,
        };

        var budgetAccount = MakeAccount("MariBank");
        var savingsAccount = MakeAccount("BPI");
        var aliceWantsAccount = MakeAccount("GCash");
        var bobWantsAccount = MakeAccount("Maya");
        db.Accounts.AddRange(budgetAccount, savingsAccount, aliceWantsAccount, bobWantsAccount);

        var emergencyFund = new SavingsGoal
        {
            Id = Guid.NewGuid(),
            CoupleId = coupleId,
            Name = "Emergency Fund",
            TargetAmount = 50_000m,
            CreatedByUserId = aliceId,
            UpdatedByUserId = aliceId,
            CreatedAt = clock.UtcNow,
            UpdatedAt = clock.UtcNow,
            Version = 1,
        };
        var travel = new SavingsGoal
        {
            Id = Guid.NewGuid(),
            CoupleId = coupleId,
            Name = "Travel",
            TargetAmount = 30_000m,
            CreatedByUserId = aliceId,
            UpdatedByUserId = aliceId,
            CreatedAt = clock.UtcNow,
            UpdatedAt = clock.UtcNow,
            Version = 1,
        };
        db.SavingsGoals.AddRange(emergencyFund, travel);

        await db.SaveChangesAsync();

        var currentUser = new FakeCurrentUserService { UserId = aliceId, CoupleId = coupleId };
        return (new DistributionService(db, currentUser, clock), clock, db, coupleId, aliceId, bobId, budgetAccount, savingsAccount, aliceWantsAccount, bobWantsAccount, emergencyFund, travel);
    }

    private static DistributeMoneyRequestDto ValidRequest(
        Account budgetAccount,
        Account savingsAccount,
        Guid aliceId,
        Account aliceWantsAccount,
        Guid bobId,
        Account bobWantsAccount,
        SavingsGoal a,
        SavingsGoal b,
        bool force = false,
        decimal combinedIncome = 50_000m,
        decimal budgetPercent = 50m,
        decimal savingsPercent = 30m,
        decimal wantsPercent = 20m,
        List<SavingsGoalAllocationInputDto>? savingsGoalAllocations = null,
        List<WantsAllocationInputDto>? wantsAllocations = null) => new()
    {
        Year = 2026,
        Month = 9,
        CombinedIncome = combinedIncome,
        Currency = "PHP",
        BudgetPercent = budgetPercent,
        BudgetAccountId = budgetAccount.Id,
        SavingsPercent = savingsPercent,
        SavingsAccountId = savingsAccount.Id,
        SavingsGoalAllocations = savingsGoalAllocations ??
        [
            new SavingsGoalAllocationInputDto { SavingsGoalId = a.Id, AllocationPercent = 60m },
            new SavingsGoalAllocationInputDto { SavingsGoalId = b.Id, AllocationPercent = 40m },
        ],
        WantsPercent = wantsPercent,
        WantsAllocations = wantsAllocations ??
        [
            new WantsAllocationInputDto { UserId = aliceId, AllocationPercent = 50m, AccountId = aliceWantsAccount.Id },
            new WantsAllocationInputDto { UserId = bobId, AllocationPercent = 50m, AccountId = bobWantsAccount.Id },
        ],
        Force = force,
    };

    [Fact]
    public async Task DistributeAsync_CreditsBudgetAndSavings_WithTheirBucketAmounts()
    {
        var (service, _, db, coupleId, aliceId, bobId, budgetAccount, savingsAccount, aliceWantsAccount, bobWantsAccount, emergencyFund, travel) = await BuildAsync();

        var response = await service.DistributeAsync(ValidRequest(budgetAccount, savingsAccount, aliceId, aliceWantsAccount, bobId, bobWantsAccount, emergencyFund, travel));

        Assert.Equal(25_000m, response.Distribution.BudgetAmount);
        Assert.Equal(15_000m, response.Distribution.SavingsAmount);
        Assert.Equal(10_000m, response.Distribution.WantsAmount);

        var allocations = await db.Transactions.Where(t => t.CoupleId == coupleId && t.Type == TransactionType.IncomeAllocation).ToListAsync();
        Assert.Equal(25_000m, allocations.Single(t => t.AccountId == budgetAccount.Id).Amount);
        Assert.Equal(15_000m, allocations.Single(t => t.AccountId == savingsAccount.Id).Amount);
    }

    [Fact]
    public async Task DistributeAsync_SplitsWantsBetweenBothMembers_CreditingEachOwnAccount()
    {
        var (service, _, db, coupleId, aliceId, bobId, budgetAccount, savingsAccount, aliceWantsAccount, bobWantsAccount, emergencyFund, travel) = await BuildAsync();

        await service.DistributeAsync(ValidRequest(
            budgetAccount, savingsAccount, aliceId, aliceWantsAccount, bobId, bobWantsAccount, emergencyFund, travel,
            wantsAllocations:
            [
                new WantsAllocationInputDto { UserId = aliceId, AllocationPercent = 60m, AccountId = aliceWantsAccount.Id },
                new WantsAllocationInputDto { UserId = bobId, AllocationPercent = 40m, AccountId = bobWantsAccount.Id },
            ]));

        var wantsAllocations = await db.Transactions
            .Where(t => t.CoupleId == coupleId && t.Type == TransactionType.IncomeAllocation && t.AccountId != budgetAccount.Id && t.AccountId != savingsAccount.Id)
            .ToListAsync();
        Assert.Equal(2, wantsAllocations.Count);

        var aliceShare = wantsAllocations.Single(t => t.AccountId == aliceWantsAccount.Id);
        Assert.Equal(6_000m, aliceShare.Amount); // 60% of 10,000
        Assert.Equal(aliceId, aliceShare.PaidByUserId);

        var bobShare = wantsAllocations.Single(t => t.AccountId == bobWantsAccount.Id);
        Assert.Equal(4_000m, bobShare.Amount); // 40% of 10,000
        Assert.Equal(bobId, bobShare.PaidByUserId);
    }

    [Fact]
    public async Task DistributeAsync_ActuallyMovesTheMoney_SoEachAccountsBalanceReflectsThePlan()
    {
        var (service, _, db, _, aliceId, bobId, budgetAccount, savingsAccount, aliceWantsAccount, bobWantsAccount, emergencyFund, travel) = await BuildAsync();

        await service.DistributeAsync(ValidRequest(budgetAccount, savingsAccount, aliceId, aliceWantsAccount, bobId, bobWantsAccount, emergencyFund, travel));

        var transactions = await db.Transactions.ToListAsync();
        Assert.Equal(25_000m, MoneyCalculator.CalculateAccountBalance(0m, budgetAccount.Id, transactions));
        Assert.Equal(5_000m, MoneyCalculator.CalculateAccountBalance(0m, aliceWantsAccount.Id, transactions)); // 50% of 10,000
        Assert.Equal(5_000m, MoneyCalculator.CalculateAccountBalance(0m, bobWantsAccount.Id, transactions));
        // Savings receives its share, then it's fully swept into the two goals (60/40 of it) — net zero.
        Assert.Equal(0m, MoneyCalculator.CalculateAccountBalance(0m, savingsAccount.Id, transactions));
        Assert.Equal(9_000m, MoneyCalculator.CalculateSavingsGoalBalance(emergencyFund.Id, transactions)); // 60% of 15,000
        Assert.Equal(6_000m, MoneyCalculator.CalculateSavingsGoalBalance(travel.Id, transactions)); // 40% of 15,000
    }

    [Fact]
    public async Task DistributeAsync_CreatesOneSavingsContributionPerGoal_DebitingTheSavingsAccount()
    {
        var (service, _, db, coupleId, aliceId, bobId, budgetAccount, savingsAccount, aliceWantsAccount, bobWantsAccount, emergencyFund, travel) = await BuildAsync();

        await service.DistributeAsync(ValidRequest(budgetAccount, savingsAccount, aliceId, aliceWantsAccount, bobId, bobWantsAccount, emergencyFund, travel));

        var contributions = await db.Transactions.Where(t => t.CoupleId == coupleId && t.Type == TransactionType.SavingsContribution).ToListAsync();
        Assert.Equal(2, contributions.Count);
        Assert.Equal(9_000m, contributions.Single(c => c.SavingsGoalId == emergencyFund.Id).Amount);
        Assert.Equal(6_000m, contributions.Single(c => c.SavingsGoalId == travel.Id).Amount);
        Assert.All(contributions, c => Assert.Equal(savingsAccount.Id, c.AccountId));
    }

    [Fact]
    public async Task DistributeAsync_NeverCreatesAnyOtherTransactionType_ThanIncomeAllocationAndSavingsContribution()
    {
        var (service, _, db, coupleId, aliceId, bobId, budgetAccount, savingsAccount, aliceWantsAccount, bobWantsAccount, emergencyFund, travel) = await BuildAsync();

        await service.DistributeAsync(ValidRequest(budgetAccount, savingsAccount, aliceId, aliceWantsAccount, bobId, bobWantsAccount, emergencyFund, travel));

        var allTransactions = await db.Transactions.Where(t => t.CoupleId == coupleId).ToListAsync();
        Assert.All(allTransactions, t => Assert.Contains(t.Type, new[] { TransactionType.IncomeAllocation, TransactionType.SavingsContribution }));
    }

    [Fact]
    public async Task DistributeAsync_NeverCountsAnIncomeAllocationAsSpending()
    {
        var (service, clock, db, _, aliceId, bobId, budgetAccount, savingsAccount, aliceWantsAccount, bobWantsAccount, emergencyFund, travel) = await BuildAsync();

        await service.DistributeAsync(ValidRequest(budgetAccount, savingsAccount, aliceId, aliceWantsAccount, bobId, bobWantsAccount, emergencyFund, travel));

        var transactions = await db.Transactions.ToListAsync();
        Assert.Equal(0m, MoneyCalculator.CalculateMonthlySpending(transactions, clock.UtcNow.Year, clock.UtcNow.Month));
    }

    [Fact]
    public async Task DistributeAsync_RejectsWhenBucketPercentagesDoNotSumTo100()
    {
        var (service, _, _, _, aliceId, bobId, budgetAccount, savingsAccount, aliceWantsAccount, bobWantsAccount, emergencyFund, travel) = await BuildAsync();
        var request = ValidRequest(budgetAccount, savingsAccount, aliceId, aliceWantsAccount, bobId, bobWantsAccount, emergencyFund, travel, wantsPercent: 30m); // 50+30+30 = 110

        await Assert.ThrowsAsync<ValidationAppException>(() => service.DistributeAsync(request));
    }

    [Fact]
    public async Task DistributeAsync_RejectsWhenSavingsGoalPercentagesDoNotSumTo100()
    {
        var (service, _, _, _, aliceId, bobId, budgetAccount, savingsAccount, aliceWantsAccount, bobWantsAccount, emergencyFund, travel) = await BuildAsync();
        var request = ValidRequest(budgetAccount, savingsAccount, aliceId, aliceWantsAccount, bobId, bobWantsAccount, emergencyFund, travel, savingsGoalAllocations:
        [
            new SavingsGoalAllocationInputDto { SavingsGoalId = emergencyFund.Id, AllocationPercent = 60m },
            new SavingsGoalAllocationInputDto { SavingsGoalId = travel.Id, AllocationPercent = 30m }, // 60+30 = 90
        ]);

        await Assert.ThrowsAsync<ValidationAppException>(() => service.DistributeAsync(request));
    }

    [Fact]
    public async Task DistributeAsync_RejectsWhenTheWantsSplitDoesNotSumTo100()
    {
        var (service, _, _, _, aliceId, bobId, budgetAccount, savingsAccount, aliceWantsAccount, bobWantsAccount, emergencyFund, travel) = await BuildAsync();
        var request = ValidRequest(budgetAccount, savingsAccount, aliceId, aliceWantsAccount, bobId, bobWantsAccount, emergencyFund, travel, wantsAllocations:
        [
            new WantsAllocationInputDto { UserId = aliceId, AllocationPercent = 60m, AccountId = aliceWantsAccount.Id },
            new WantsAllocationInputDto { UserId = bobId, AllocationPercent = 30m, AccountId = bobWantsAccount.Id }, // 60+30 = 90
        ]);

        await Assert.ThrowsAsync<ValidationAppException>(() => service.DistributeAsync(request));
    }

    [Fact]
    public async Task DistributeAsync_RejectsWhenNoWantsSplitIsProvided()
    {
        var (service, _, _, _, aliceId, bobId, budgetAccount, savingsAccount, aliceWantsAccount, bobWantsAccount, emergencyFund, travel) = await BuildAsync();
        var request = ValidRequest(budgetAccount, savingsAccount, aliceId, aliceWantsAccount, bobId, bobWantsAccount, emergencyFund, travel, wantsAllocations: []);

        await Assert.ThrowsAsync<ValidationAppException>(() => service.DistributeAsync(request));
    }

    [Fact]
    public async Task DistributeAsync_RejectsAWantsShare_ForSomeoneNotAnActiveMemberOfTheCouple()
    {
        var (service, _, _, _, aliceId, _, budgetAccount, savingsAccount, aliceWantsAccount, bobWantsAccount, emergencyFund, travel) = await BuildAsync();
        var strangerId = Guid.NewGuid();
        var request = ValidRequest(budgetAccount, savingsAccount, aliceId, aliceWantsAccount, strangerId, bobWantsAccount, emergencyFund, travel);

        await Assert.ThrowsAsync<ValidationAppException>(() => service.DistributeAsync(request));
    }

    [Fact]
    public async Task DistributeAsync_RejectsAWantsAccount_ThatBelongsToAnotherCouple()
    {
        var (service, _, db, _, aliceId, bobId, budgetAccount, savingsAccount, aliceWantsAccount, _, emergencyFund, travel) = await BuildAsync();
        var otherAccount = new Account { Id = Guid.NewGuid(), CoupleId = Guid.NewGuid(), Name = "Someone else's", OpeningBalance = 0m };
        db.Accounts.Add(otherAccount);
        await db.SaveChangesAsync();

        var request = ValidRequest(budgetAccount, savingsAccount, aliceId, aliceWantsAccount, bobId, otherAccount, emergencyFund, travel);

        await Assert.ThrowsAsync<ValidationAppException>(() => service.DistributeAsync(request));
    }

    [Fact]
    public async Task DistributeAsync_RejectsASecondDistributionForTheSamePeriod_WithoutForce()
    {
        var (service, _, _, _, aliceId, bobId, budgetAccount, savingsAccount, aliceWantsAccount, bobWantsAccount, emergencyFund, travel) = await BuildAsync();
        await service.DistributeAsync(ValidRequest(budgetAccount, savingsAccount, aliceId, aliceWantsAccount, bobId, bobWantsAccount, emergencyFund, travel));

        await Assert.ThrowsAsync<ConflictAppException>(() => service.DistributeAsync(ValidRequest(budgetAccount, savingsAccount, aliceId, aliceWantsAccount, bobId, bobWantsAccount, emergencyFund, travel)));
    }

    [Fact]
    public async Task DistributeAsync_AllowsASecondDistributionForTheSamePeriod_WithForce()
    {
        var (service, _, db, coupleId, aliceId, bobId, budgetAccount, savingsAccount, aliceWantsAccount, bobWantsAccount, emergencyFund, travel) = await BuildAsync();
        await service.DistributeAsync(ValidRequest(budgetAccount, savingsAccount, aliceId, aliceWantsAccount, bobId, bobWantsAccount, emergencyFund, travel));

        var second = await service.DistributeAsync(ValidRequest(budgetAccount, savingsAccount, aliceId, aliceWantsAccount, bobId, bobWantsAccount, emergencyFund, travel, force: true));

        Assert.NotNull(second.Distribution);
        Assert.Equal(2, await db.Distributions.CountAsync(d => d.CoupleId == coupleId));
        // Two full distributions means the budget account was credited twice — no money lost or duplicated incorrectly.
        var transactions = await db.Transactions.ToListAsync();
        Assert.Equal(50_000m, MoneyCalculator.CalculateAccountBalance(0m, budgetAccount.Id, transactions));
    }

    [Fact]
    public async Task DistributeAsync_RejectsWhenTheSavingsAccountBelongsToAnotherCouple()
    {
        var (service, _, db, _, aliceId, bobId, budgetAccount, _, aliceWantsAccount, bobWantsAccount, emergencyFund, travel) = await BuildAsync();
        var otherAccount = new Account { Id = Guid.NewGuid(), CoupleId = Guid.NewGuid(), Name = "Someone else's", OpeningBalance = 0m };
        db.Accounts.Add(otherAccount);
        await db.SaveChangesAsync();

        var request = ValidRequest(budgetAccount, otherAccount, aliceId, aliceWantsAccount, bobId, bobWantsAccount, emergencyFund, travel);

        await Assert.ThrowsAsync<ValidationAppException>(() => service.DistributeAsync(request));
    }

    [Fact]
    public async Task DistributeAsync_RejectsWhenTheBudgetAccountBelongsToAnotherCouple()
    {
        var (service, _, db, _, aliceId, bobId, _, savingsAccount, aliceWantsAccount, bobWantsAccount, emergencyFund, travel) = await BuildAsync();
        var otherAccount = new Account { Id = Guid.NewGuid(), CoupleId = Guid.NewGuid(), Name = "Someone else's", OpeningBalance = 0m };
        db.Accounts.Add(otherAccount);
        await db.SaveChangesAsync();

        var request = ValidRequest(otherAccount, savingsAccount, aliceId, aliceWantsAccount, bobId, bobWantsAccount, emergencyFund, travel);

        await Assert.ThrowsAsync<ValidationAppException>(() => service.DistributeAsync(request));
    }

    [Fact]
    public async Task DistributeAsync_RejectsWhenASavingsGoalBelongsToAnotherCouple()
    {
        var (service, _, db, _, aliceId, bobId, budgetAccount, savingsAccount, aliceWantsAccount, bobWantsAccount, emergencyFund, _) = await BuildAsync();
        var otherGoal = new SavingsGoal { Id = Guid.NewGuid(), CoupleId = Guid.NewGuid(), Name = "Not yours", TargetAmount = 1_000m };
        db.SavingsGoals.Add(otherGoal);
        await db.SaveChangesAsync();

        var request = ValidRequest(budgetAccount, savingsAccount, aliceId, aliceWantsAccount, bobId, bobWantsAccount, emergencyFund, otherGoal);

        await Assert.ThrowsAsync<ValidationAppException>(() => service.DistributeAsync(request));
    }

    [Fact]
    public async Task DistributeAsync_RejectsWhenNoSavingsGoalsAreSelected()
    {
        var (service, _, _, _, aliceId, bobId, budgetAccount, savingsAccount, aliceWantsAccount, bobWantsAccount, emergencyFund, travel) = await BuildAsync();
        var request = ValidRequest(budgetAccount, savingsAccount, aliceId, aliceWantsAccount, bobId, bobWantsAccount, emergencyFund, travel, savingsGoalAllocations: []);

        await Assert.ThrowsAsync<ValidationAppException>(() => service.DistributeAsync(request));
    }

    [Fact]
    public async Task DistributeAsync_ReconcilesBucketRounding_ToTheExactCombinedIncome_EvenWithAThirdsSplit()
    {
        var (service, _, _, _, aliceId, bobId, budgetAccount, savingsAccount, aliceWantsAccount, bobWantsAccount, emergencyFund, travel) = await BuildAsync();
        var request = ValidRequest(
            budgetAccount, savingsAccount, aliceId, aliceWantsAccount, bobId, bobWantsAccount, emergencyFund, travel,
            combinedIncome: 100.00m, budgetPercent: 33.33m, savingsPercent: 33.33m, wantsPercent: 33.34m);

        var response = await service.DistributeAsync(request);

        Assert.Equal(100.00m, response.Distribution.BudgetAmount + response.Distribution.SavingsAmount + response.Distribution.WantsAmount);
    }

    [Fact]
    public async Task DistributeAsync_ReconcilesWantsSplitRounding_ToTheExactWantsAmount()
    {
        var (service, _, db, coupleId, aliceId, bobId, budgetAccount, savingsAccount, aliceWantsAccount, bobWantsAccount, emergencyFund, travel) = await BuildAsync();

        var request = ValidRequest(
            budgetAccount, savingsAccount, aliceId, aliceWantsAccount, bobId, bobWantsAccount, emergencyFund, travel,
            combinedIncome: 100.00m, budgetPercent: 0m, savingsPercent: 0m, wantsPercent: 100m, // the whole 100.00 goes to Wants
            wantsAllocations:
            [
                new WantsAllocationInputDto { UserId = aliceId, AllocationPercent = 33.33m, AccountId = aliceWantsAccount.Id },
                new WantsAllocationInputDto { UserId = bobId, AllocationPercent = 66.67m, AccountId = bobWantsAccount.Id },
            ]);

        await service.DistributeAsync(request);

        var totalCredited = await db.Transactions
            .Where(t => t.CoupleId == coupleId && t.Type == TransactionType.IncomeAllocation && (t.AccountId == aliceWantsAccount.Id || t.AccountId == bobWantsAccount.Id))
            .SumAsync(t => t.Amount);
        Assert.Equal(100.00m, totalCredited); // never 99.99 or 100.01
    }

    [Fact]
    public async Task DistributeAsync_ReconcilesSavingsGoalRounding_ToTheExactSavingsAmount()
    {
        var (service, _, db, coupleId, aliceId, bobId, budgetAccount, savingsAccount, aliceWantsAccount, bobWantsAccount, emergencyFund, travel) = await BuildAsync();
        var other = new SavingsGoal { Id = Guid.NewGuid(), CoupleId = coupleId, Name = "Other", TargetAmount = 1_000m };
        db.SavingsGoals.Add(other);
        await db.SaveChangesAsync();

        var request = ValidRequest(
            budgetAccount, savingsAccount, aliceId, aliceWantsAccount, bobId, bobWantsAccount, emergencyFund, travel,
            combinedIncome: 100.00m, budgetPercent: 0m, savingsPercent: 100m, wantsPercent: 0m, // the whole 100.00 goes to Savings, split three ways below
            savingsGoalAllocations:
            [
                new SavingsGoalAllocationInputDto { SavingsGoalId = emergencyFund.Id, AllocationPercent = 33.33m },
                new SavingsGoalAllocationInputDto { SavingsGoalId = travel.Id, AllocationPercent = 33.33m },
                new SavingsGoalAllocationInputDto { SavingsGoalId = other.Id, AllocationPercent = 33.34m },
            ]);

        await service.DistributeAsync(request);

        var totalContributed = await db.Transactions
            .Where(t => t.CoupleId == coupleId && t.Type == TransactionType.SavingsContribution)
            .SumAsync(t => t.Amount);
        Assert.Equal(100.00m, totalContributed); // never 99.99 or 100.01
    }

    [Fact]
    public async Task GetStatusAsync_ReportsAlreadyDistributed_OnlyAfterASuccessfulDistribution()
    {
        var (service, _, _, _, aliceId, bobId, budgetAccount, savingsAccount, aliceWantsAccount, bobWantsAccount, emergencyFund, travel) = await BuildAsync();

        var before = await service.GetStatusAsync(2026, 9);
        Assert.False(before.AlreadyDistributed);

        await service.DistributeAsync(ValidRequest(budgetAccount, savingsAccount, aliceId, aliceWantsAccount, bobId, bobWantsAccount, emergencyFund, travel));

        var after = await service.GetStatusAsync(2026, 9);
        Assert.True(after.AlreadyDistributed);
        Assert.Single(after.DistributionsForPeriod);
        Assert.Single(after.RecentHistory);
    }
}
