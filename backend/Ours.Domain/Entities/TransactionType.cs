namespace Ours.Domain.Entities;

/// <summary>
/// The three fundamental kinds of money movement (see the Phase 3 "Money System" spec) — a
/// Transfer is NOT an Expense with a special category; it is a structurally different operation
/// that moves money between the couple's own accounts and must never count as spending.
/// </summary>
public static class TransactionType
{
    public const string Expense = "Expense";
    public const string Income = "Income";
    public const string Transfer = "Transfer";

    /// <summary>Money moving from an account into a SavingsGoal — debits the account, exactly like an Expense (see MoneyCalculator), but is never counted as spending.</summary>
    public const string SavingsContribution = "SavingsContribution";

    /// <summary>Money moving from a SavingsGoal back into an account — credits the account, exactly like Income.</summary>
    public const string SavingsWithdrawal = "SavingsWithdrawal";

    /// <summary>
    /// One bucket's share of a "Distribute Money" action landing in its destination account —
    /// credits the account, exactly like Income (see MoneyCalculator), but is system-generated
    /// only: DistributionService is the only writer of this type; a client can never push one
    /// directly (see SyncService.ApplyTransactionChangeAsync) — that's what keeps it a reliable,
    /// unambiguous marker of "this money arrived via a distribution", not a real income entry a
    /// user typed in, and not a real bank transfer (Ours never talks to a real bank — see
    /// Distribution's doc comment).
    /// </summary>
    public const string IncomeAllocation = "IncomeAllocation";

    /// <summary>
    /// Money moving from an account toward a Loan's balance — debits the account, exactly like an
    /// Expense (see MoneyCalculator), but tracked separately from ordinary spending so a loan
    /// repayment is never double-counted against a Budget category (see Loan's doc comment for
    /// why the loan itself keeps no stored balance of its own).
    /// </summary>
    public const string LoanPayment = "LoanPayment";

    public static readonly IReadOnlyList<string> All = [Expense, Income, Transfer, SavingsContribution, SavingsWithdrawal, IncomeAllocation, LoanPayment];

    public static bool IsValid(string? value) => value is not null && All.Contains(value);
}
