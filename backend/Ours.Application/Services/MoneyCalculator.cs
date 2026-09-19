using Ours.Domain.Entities;

namespace Ours.Application.Services;

/// <summary>
/// The one place that turns opening balances + transactions into an actual balance/spending
/// figure — see the Phase 3 spec's "Local calculation engine": every consumer (backend tests,
/// and the mobile equivalent in utils/moneyCalculations.ts) must agree with this, so there is
/// exactly one financial arithmetic implementation to reason about, not five.
///
/// Deliberately stateless and pull-based rather than incremental: an edited or deleted
/// transaction needs no explicit "reverse the old effect" step anywhere, because every figure
/// here is recomputed from the current set of non-deleted transactions every time it's asked
/// for — there is nothing else to invalidate.
/// </summary>
public static class MoneyCalculator
{
    /// <summary>
    /// Balance = OpeningBalance + Income - Expense - TransferOut + TransferIn, over every
    /// non-deleted transaction touching this account. Transfers only ever move money between
    /// the couple's own accounts, so summed across every account they always net to zero.
    /// </summary>
    public static decimal CalculateAccountBalance(decimal openingBalance, Guid accountId, IEnumerable<Transaction> transactions)
    {
        var balance = openingBalance;
        foreach (var t in transactions)
        {
            if (t.IsDeleted) continue;

            if (t.Type == TransactionType.Income && t.AccountId == accountId)
            {
                balance += t.Amount;
            }
            else if (t.Type == TransactionType.Expense && t.AccountId == accountId)
            {
                balance -= t.Amount;
            }
            else if (t.Type == TransactionType.Transfer)
            {
                if (t.AccountId == accountId) balance -= t.Amount;
                if (t.DestinationAccountId == accountId) balance += t.Amount;
            }
            else if (t.Type == TransactionType.SavingsContribution && t.AccountId == accountId)
            {
                // The money leaves the spendable account into the earmarked goal — same
                // direction as an Expense, but never counted as spending (see CalculateMonthlySpending).
                balance -= t.Amount;
            }
            else if (t.Type == TransactionType.SavingsWithdrawal && t.AccountId == accountId)
            {
                balance += t.Amount;
            }
            else if (t.Type == TransactionType.IncomeAllocation && t.AccountId == accountId)
            {
                // A distribution bucket landing in its destination account — credits like Income.
                balance += t.Amount;
            }
            else if (t.Type == TransactionType.LoanPayment && t.AccountId == accountId)
            {
                // The money leaves the spendable account toward the loan — same direction as an
                // Expense, but tracked separately (see CalculateMonthlySpending/CalculateLoanPaidAmount).
                balance -= t.Amount;
            }
        }
        return balance;
    }

    /// <summary>
    /// A savings goal's progress — deliberately never a stored column (see SavingsGoal's doc
    /// comment): the sum of every non-deleted SavingsContribution (+) and SavingsWithdrawal (-)
    /// transaction linked to it, the same "derive fresh every time" approach as account balance.
    /// </summary>
    public static decimal CalculateSavingsGoalBalance(Guid savingsGoalId, IEnumerable<Transaction> transactions)
    {
        var balance = 0m;
        foreach (var t in transactions)
        {
            if (t.IsDeleted || t.SavingsGoalId != savingsGoalId) continue;

            if (t.Type == TransactionType.SavingsContribution) balance += t.Amount;
            else if (t.Type == TransactionType.SavingsWithdrawal) balance -= t.Amount;
        }
        return balance;
    }

    /// <summary>
    /// Total paid so far toward one loan — deliberately never a stored column (see Loan's doc
    /// comment): the sum of every non-deleted LoanPayment transaction linked to it. A loan's
    /// remaining balance is always <c>OriginalAmount - CalculateLoanPaidAmount(...)</c>, and its
    /// installments paid is <c>floor(CalculateLoanPaidAmount(...) / MonthlyPayment)</c> — both
    /// computed by the caller (LoanService/LoanDto), not here, so this stays the one place that
    /// actually sums the ledger.
    /// </summary>
    public static decimal CalculateLoanPaidAmount(Guid loanId, IEnumerable<Transaction> transactions) =>
        transactions.Where(t => !t.IsDeleted && t.Type == TransactionType.LoanPayment && t.LoanId == loanId).Sum(t => t.Amount);

    /// <summary>Sum of every active (non-deleted, IsActive) account's balance — a Transfer's two legs always cancel out across the whole couple, so this is unaffected by transfer volume.</summary>
    public static decimal CalculateTotalBalance(IEnumerable<Account> accounts, IEnumerable<Transaction> transactions)
    {
        var transactionList = transactions as IList<Transaction> ?? transactions.ToList();
        return accounts
            .Where(a => a.IsActive && !a.IsDeleted)
            .Sum(a => CalculateAccountBalance(a.OpeningBalance, a.Id, transactionList));
    }

    /// <summary>Total spent (Expense transactions only — never Income or Transfer) in the given calendar month.</summary>
    public static decimal CalculateMonthlySpending(IEnumerable<Transaction> transactions, int year, int month) =>
        transactions
            .Where(t => !t.IsDeleted && t.Type == TransactionType.Expense && t.TransactionDate.Year == year && t.TransactionDate.Month == month)
            .Sum(t => t.Amount);

    /// <summary>Per-category spending (Expense only) for the given calendar month — the same figures a budget's "spent" is measured against.</summary>
    public static IReadOnlyDictionary<string, decimal> CalculateCategorySpending(IEnumerable<Transaction> transactions, int year, int month) =>
        transactions
            .Where(t => !t.IsDeleted && t.Type == TransactionType.Expense && t.TransactionDate.Year == year && t.TransactionDate.Month == month && t.Category is not null)
            .GroupBy(t => t.Category!)
            .ToDictionary(g => g.Key, g => g.Sum(t => t.Amount));

    /// <summary>Budget remaining = budget amount - spent. Negative means over budget — the UI decides how to flag that; nothing here prevents or clamps it.</summary>
    public static decimal CalculateBudgetRemaining(decimal budgetAmount, decimal spent) => budgetAmount - spent;
}
