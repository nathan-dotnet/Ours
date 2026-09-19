namespace Ours.Domain.Entities;

/// <summary>
/// A record of one "Distribute Money" action — a snapshot of the combined income and the
/// Budget/Savings/Wants split that was actually used, for one income period (Year/Month).
/// Deliberately NOT an <see cref="ISyncableEntity"/>, for the same reason as
/// <see cref="MissMeInteraction"/>: every row is a one-shot, server-created, append-only fact
/// ("we distributed ₱50,000 this way, at this instant"), never edited or deleted, and creating
/// one requires a synchronous server-enforced check (has this period already been distributed?)
/// that doesn't fit the generic offline sync pipeline — see DistributionService. The mobile app
/// reads history/status through a small dedicated endpoint instead, same as MissMeService.
///
/// Ours has no connection to any real bank — a couple still moves their actual money between
/// real accounts themselves, entirely outside the app. What this row (and the transactions it
/// creates — see DistributionService.DistributeAsync) represents is Ours' own internal ledger
/// catching up to that: Budget and Savings each get a real IncomeAllocation transaction
/// crediting their destination account, so Ours' account balances end up reflecting the plan,
/// not just displaying it. Savings additionally gets swept from its account into named goals via
/// SavingsContribution transactions, so that account's *net* change is only whatever wasn't
/// allocated to any goal. Wants has no single account of its own — it's split between the
/// couple's members instead, each getting their own IncomeAllocation transaction (see
/// DistributeMoneyRequestDto.WantsAllocations); only the bucket's total is recorded here, the
/// per-member breakdown lives in the transaction ledger itself (each carrying that member's
/// PaidByUserId), the same way the Savings-to-goals breakdown was never duplicated here either.
/// </summary>
public class Distribution
{
    public Guid Id { get; set; }

    public Guid CoupleId { get; set; }

    public int Year { get; set; }

    /// <summary>1-12.</summary>
    public int Month { get; set; }

    public decimal CombinedIncome { get; set; }

    public string Currency { get; set; } = "PHP";

    public decimal BudgetPercent { get; set; }
    public decimal BudgetAmount { get; set; }
    public Guid? BudgetAccountId { get; set; }

    public decimal SavingsPercent { get; set; }
    public decimal SavingsAmount { get; set; }
    public Guid? SavingsAccountId { get; set; }

    public decimal WantsPercent { get; set; }
    public decimal WantsAmount { get; set; }

    public Guid CreatedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
