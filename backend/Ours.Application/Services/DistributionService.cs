using Microsoft.EntityFrameworkCore;
using Ours.Application.Abstractions;
using Ours.Application.Common;
using Ours.Application.DTOs.Money;
using Ours.Domain.Entities;

namespace Ours.Application.Services;

/// <summary>
/// The "Distribute Money" action from the Money Calculator: takes a combined-income figure, a
/// Budget/Savings/Wants percentage split, a per-goal Savings sub-split, and a per-member Wants
/// sub-split — and, after re-validating every number itself, never trusting client-rounded
/// amounts — records the result. Ours never touches a real bank (see Distribution's doc
/// comment); what this *does* do is credit real accounts via real IncomeAllocation transactions
/// so Ours' own balances genuinely reflect the plan: Budget and Savings each credit their one
/// destination account, then Savings sweeps into named goals via SavingsContribution
/// transactions (net change = whatever wasn't allocated to a goal); Wants has no pooled account
/// at all — it credits each member's own destination account directly, split by their share.
///
/// Like MissMeService, this needs a synchronous server-enforced check (has this income period
/// already been distributed?) and an atomic multi-record outcome, so it's a small dedicated
/// service behind its own endpoint rather than a synced entity — see Distribution's doc comment.
/// </summary>
public class DistributionService(IApplicationDbContext db, ICurrentUserService currentUser, IDateTimeProvider clock)
{
    /// <summary>Same sanity ceiling as SyncService.MaxMoneyAmount — kept as its own constant here rather than shared, matching how each service already carries its own copy of this kind of guard rail.</summary>
    private const decimal MaxMoneyAmount = 10_000_000m;

    private const int HistoryLimit = 12;

    public async Task<DistributionStatusResponseDto> GetStatusAsync(int year, int month, CancellationToken ct = default)
    {
        var coupleId = RequireCoupleId();

        var forPeriod = await db.Distributions
            .Where(d => d.CoupleId == coupleId && d.Year == year && d.Month == month)
            .OrderByDescending(d => d.CreatedAt)
            .ToListAsync(ct);

        var history = await db.Distributions
            .Where(d => d.CoupleId == coupleId)
            .OrderByDescending(d => d.CreatedAt)
            .Take(HistoryLimit)
            .ToListAsync(ct);

        return new DistributionStatusResponseDto
        {
            AlreadyDistributed = forPeriod.Count > 0,
            DistributionsForPeriod = forPeriod.Select(ToDto).ToList(),
            RecentHistory = history.Select(ToDto).ToList(),
        };
    }

    public async Task<DistributeMoneyResponseDto> DistributeAsync(DistributeMoneyRequestDto request, CancellationToken ct = default)
    {
        var coupleId = RequireCoupleId();

        if (request.Month is < 1 or > 12)
        {
            throw new ValidationAppException("Month must be between 1 and 12.");
        }

        if (request.Year is < 2000 or > 2100)
        {
            throw new ValidationAppException("Invalid year.");
        }

        if (request.CombinedIncome <= 0)
        {
            throw new ValidationAppException("Combined income must be greater than zero.");
        }

        if (request.CombinedIncome > MaxMoneyAmount)
        {
            throw new ValidationAppException("Combined income exceeds the maximum allowed.");
        }

        if (!IsValidCurrencyCode(request.Currency))
        {
            throw new ValidationAppException("Invalid currency code.");
        }

        var bucketPercents = new[] { request.BudgetPercent, request.SavingsPercent, request.WantsPercent };
        if (bucketPercents.Any(p => p < 0 || p > 100))
        {
            throw new ValidationAppException("Percentages must be between 0 and 100.");
        }

        if (bucketPercents.Sum() != 100m)
        {
            throw new ValidationAppException("Your allocation must equal exactly 100%.");
        }

        // Withheld, not silently duplicated — the client must explicitly confirm past this (see
        // Force's doc comment), same "ask again on purpose" shape as MissMe's cooldown.
        var alreadyDistributed = await db.Distributions.AnyAsync(d => d.CoupleId == coupleId && d.Year == request.Year && d.Month == request.Month, ct);
        if (alreadyDistributed && !request.Force)
        {
            throw new ConflictAppException($"{request.Year}-{request.Month:D2}'s income has already been distributed.");
        }

        // Budget/Savings each credit a real account, so both must genuinely belong to this
        // couple — never trust an id just because it exists somewhere in the system. Wants'
        // accounts are validated below, alongside its per-member split.
        var destinationAccountIds = new[] { request.BudgetAccountId, request.SavingsAccountId }.Distinct().ToList();
        var ownedCount = await db.Accounts.CountAsync(a => destinationAccountIds.Contains(a.Id) && a.CoupleId == coupleId, ct);
        if (ownedCount != destinationAccountIds.Count)
        {
            throw new ValidationAppException("Each allocation account must belong to your couple.");
        }

        if (request.WantsAllocations.Count == 0)
        {
            throw new ValidationAppException("Split Wants between at least one member to receive this month's Wants allocation.");
        }

        var wantsUserIds = request.WantsAllocations.Select(a => a.UserId).ToList();
        if (wantsUserIds.Distinct().Count() != wantsUserIds.Count)
        {
            throw new ValidationAppException("Each member's Wants share can only appear once.");
        }

        var activeMemberUserIds = await db.CoupleMembers
            .Where(m => m.CoupleId == coupleId && wantsUserIds.Contains(m.UserId) && m.LeftAt == null)
            .Select(m => m.UserId)
            .ToListAsync(ct);
        if (activeMemberUserIds.Count != wantsUserIds.Count)
        {
            throw new ValidationAppException("Each member's Wants share must be for an active member of your couple.");
        }

        var wantsAccountIds = request.WantsAllocations.Select(a => a.AccountId).Distinct().ToList();
        var ownedWantsAccountCount = await db.Accounts.CountAsync(a => wantsAccountIds.Contains(a.Id) && a.CoupleId == coupleId, ct);
        if (ownedWantsAccountCount != wantsAccountIds.Count)
        {
            throw new ValidationAppException("Each member's Wants account must belong to your couple.");
        }

        if (request.WantsAllocations.Any(a => a.AllocationPercent < 0 || a.AllocationPercent > 100))
        {
            throw new ValidationAppException("Wants share percentages must be between 0 and 100.");
        }

        if (request.WantsAllocations.Sum(a => a.AllocationPercent) != 100m)
        {
            throw new ValidationAppException("Your Wants split must add up to exactly 100% of the Wants allocation.");
        }

        if (request.SavingsGoalAllocations.Count == 0)
        {
            throw new ValidationAppException("Select at least one savings goal to receive this month's Savings allocation.");
        }

        var goalIds = request.SavingsGoalAllocations.Select(a => a.SavingsGoalId).ToList();
        if (goalIds.Distinct().Count() != goalIds.Count)
        {
            throw new ValidationAppException("Each savings goal can only appear once.");
        }

        var goals = await db.SavingsGoals.Where(g => goalIds.Contains(g.Id) && g.CoupleId == coupleId && !g.IsDeleted).ToListAsync(ct);
        if (goals.Count != goalIds.Count)
        {
            throw new ValidationAppException("Each savings goal must belong to your couple.");
        }

        if (request.SavingsGoalAllocations.Any(a => a.AllocationPercent < 0 || a.AllocationPercent > 100))
        {
            throw new ValidationAppException("Savings goal percentages must be between 0 and 100.");
        }

        if (request.SavingsGoalAllocations.Sum(a => a.AllocationPercent) != 100m)
        {
            throw new ValidationAppException("Your savings goals must add up to exactly 100% of the Savings allocation.");
        }

        // Server-authoritative rounding: the three bucket amounts (and, below, each goal's
        // amount) are computed here, never trusted from the client, and reconciled to the exact
        // cent — see SplitExactly's doc comment for how "last one absorbs the remainder" makes
        // that guaranteed rather than merely likely.
        var bucketAmounts = SplitExactly(request.CombinedIncome, bucketPercents);
        var budgetAmount = bucketAmounts[0];
        var savingsAmount = bucketAmounts[1];
        var wantsAmount = bucketAmounts[2];

        var goalPercents = request.SavingsGoalAllocations.Select(a => a.AllocationPercent).ToList();
        var goalAmounts = SplitExactly(savingsAmount, goalPercents);

        var wantsPercents = request.WantsAllocations.Select(a => a.AllocationPercent).ToList();
        var wantsMemberAmounts = SplitExactly(wantsAmount, wantsPercents);

        var now = clock.UtcNow;
        var distribution = new Distribution
        {
            Id = Guid.NewGuid(),
            CoupleId = coupleId,
            Year = request.Year,
            Month = request.Month,
            CombinedIncome = request.CombinedIncome,
            Currency = request.Currency,
            BudgetPercent = request.BudgetPercent,
            BudgetAmount = budgetAmount,
            BudgetAccountId = request.BudgetAccountId,
            SavingsPercent = request.SavingsPercent,
            SavingsAmount = savingsAmount,
            SavingsAccountId = request.SavingsAccountId,
            WantsPercent = request.WantsPercent,
            WantsAmount = wantsAmount,
            CreatedByUserId = currentUser.UserId,
            CreatedAt = now,
        };
        db.Distributions.Add(distribution);

        // Budget and Savings each land in their one destination account as a real,
        // system-generated credit — this is Ours' own ledger catching up to the plan, never a
        // real bank transfer (see Distribution's doc comment). Skipped for a 0% bucket — no fake
        // zero-amount transaction, same rule SavingsContribution already follows below.
        AddIncomeAllocation(coupleId, request.BudgetAccountId, budgetAmount, request.Currency, "Budget", request.Month, request.Year, now, paidByUserId: null);
        AddIncomeAllocation(coupleId, request.SavingsAccountId, savingsAmount, request.Currency, "Savings", request.Month, request.Year, now, paidByUserId: null);

        // Wants has no single account — each member's share credits their own account directly
        // (no pooling step, unlike Savings' sweep into goals). PaidByUserId records whose share
        // this is — the existing "who this concerns" field, not a new one.
        for (var i = 0; i < request.WantsAllocations.Count; i++)
        {
            var allocation = request.WantsAllocations[i];
            AddIncomeAllocation(coupleId, allocation.AccountId, wantsMemberAmounts[i], request.Currency, "Wants", request.Month, request.Year, now, paidByUserId: allocation.UserId);
        }

        for (var i = 0; i < request.SavingsGoalAllocations.Count; i++)
        {
            var amount = goalAmounts[i];
            if (amount <= 0) continue; // a 0% goal contributes nothing this round — no fake zero-amount transaction

            var goal = goals.First(g => g.Id == request.SavingsGoalAllocations[i].SavingsGoalId);
            db.Transactions.Add(new Transaction
            {
                Id = Guid.NewGuid(),
                CoupleId = coupleId,
                Type = TransactionType.SavingsContribution,
                Amount = amount,
                Currency = request.Currency,
                AccountId = request.SavingsAccountId,
                SavingsGoalId = goal.Id,
                Description = $"Monthly distribution — {goal.Name}",
                TransactionDate = DateOnly.FromDateTime(now.UtcDateTime),
                CreatedByUserId = currentUser.UserId,
                CreatedAt = now,
                UpdatedAt = now,
                UpdatedByUserId = currentUser.UserId,
                Version = 1,
            });
        }

        // One SaveChangesAsync — the Distribution row and every SavingsContribution it creates
        // land in the same implicit EF Core transaction, so this can never half-apply.
        await db.SaveChangesAsync(ct);

        return new DistributeMoneyResponseDto { Distribution = ToDto(distribution) };
    }

    private static readonly string[] MonthNames =
    [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ];

    /// <summary>
    /// Credits one bucket's (or one member's Wants share of a bucket's) amount into its
    /// destination account — see the IncomeAllocation type's own doc comment for why this, and
    /// not Income or a Transfer, is the right representation. <paramref name="paidByUserId"/>
    /// reuses Transaction's existing "who this concerns" field (see its own doc comment) to
    /// record whose share a per-member Wants credit is, without inventing a new column.
    /// </summary>
    private void AddIncomeAllocation(Guid coupleId, Guid accountId, decimal amount, string currency, string bucketLabel, int month, int year, DateTimeOffset now, Guid? paidByUserId)
    {
        if (amount <= 0) return;

        db.Transactions.Add(new Transaction
        {
            Id = Guid.NewGuid(),
            CoupleId = coupleId,
            Type = TransactionType.IncomeAllocation,
            Amount = amount,
            Currency = currency,
            AccountId = accountId,
            PaidByUserId = paidByUserId,
            Description = $"Distribute Money — {bucketLabel} allocation for {MonthNames[month - 1]} {year}",
            TransactionDate = DateOnly.FromDateTime(now.UtcDateTime),
            CreatedByUserId = currentUser.UserId,
            CreatedAt = now,
            UpdatedAt = now,
            UpdatedByUserId = currentUser.UserId,
            Version = 1,
        });
    }

    /// <summary>
    /// Splits <paramref name="total"/> across <paramref name="percents"/> (which must already
    /// sum to exactly 100) so the resulting amounts always sum to exactly <paramref name="total"/>
    /// — every share but the last is rounded normally; the last is whatever makes the total
    /// exact. This is what prevents the classic "three roundings of a whole never quite add back
    /// up" bug (e.g. ₱14,999.99 or ₱15,000.01 instead of ₱15,000.00).
    /// </summary>
    private static List<decimal> SplitExactly(decimal total, IReadOnlyList<decimal> percents)
    {
        var amounts = new List<decimal>(percents.Count);
        var runningTotal = 0m;
        for (var i = 0; i < percents.Count - 1; i++)
        {
            var amount = Math.Round(total * percents[i] / 100m, 2, MidpointRounding.AwayFromZero);
            amounts.Add(amount);
            runningTotal += amount;
        }
        amounts.Add(total - runningTotal);
        return amounts;
    }

    private Guid RequireCoupleId() => currentUser.CoupleId ?? throw new ForbiddenAppException("You must belong to a couple to do this.");

    /// <summary>Mirrors SyncService.IsValidCurrencyCode.</summary>
    private static bool IsValidCurrencyCode(string? currency) =>
        currency is not null && currency.Length == 3 && currency.All(c => c is >= 'A' and <= 'Z');

    private static DistributionDto ToDto(Distribution d) => new()
    {
        Id = d.Id,
        Year = d.Year,
        Month = d.Month,
        CombinedIncome = d.CombinedIncome,
        Currency = d.Currency,
        BudgetPercent = d.BudgetPercent,
        BudgetAmount = d.BudgetAmount,
        BudgetAccountId = d.BudgetAccountId,
        SavingsPercent = d.SavingsPercent,
        SavingsAmount = d.SavingsAmount,
        SavingsAccountId = d.SavingsAccountId,
        WantsPercent = d.WantsPercent,
        WantsAmount = d.WantsAmount,
        CreatedAt = d.CreatedAt,
        CreatedByUserId = d.CreatedByUserId,
    };
}
