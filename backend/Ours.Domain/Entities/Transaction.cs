using Ours.Domain.Common;

namespace Ours.Domain.Entities;

/// <summary>
/// A single movement of money — one of <see cref="TransactionType"/>. <see cref="Amount"/> is
/// always stored positive; direction is implied entirely by <see cref="Type"/> plus which of
/// <see cref="AccountId"/>/<see cref="DestinationAccountId"/> it touches (see MoneyCalculator).
/// </summary>
public class Transaction : ISyncableEntity
{
    /// <summary>Device-generated (see the mobile UUID convention) — trusted as-is on first create.</summary>
    public Guid Id { get; set; }

    public Guid CoupleId { get; set; }

    /// <summary>One of <see cref="TransactionType"/>'s constants.</summary>
    public string Type { get; set; } = TransactionType.Expense;

    /// <summary>Always positive — exact decimal, never float/double (see numeric(18,2) in ExpenseConfiguration's successor, TransactionConfiguration).</summary>
    public decimal Amount { get; set; }

    public string Currency { get; set; } = "PHP";

    /// <summary>The affected account for Expense/Income; the *source* account for a Transfer.</summary>
    public Guid AccountId { get; set; }

    /// <summary>Only set for a Transfer — the account the money moves *into*. Null for Expense/Income.</summary>
    public Guid? DestinationAccountId { get; set; }

    /// <summary>One of <see cref="TransactionCategory"/>'s Expense or Income vocabularies — always null for a Transfer or a savings contribution/withdrawal.</summary>
    public string? Category { get; set; }

    /// <summary>
    /// Set only for <see cref="TransactionType.SavingsContribution"/>/<see cref="TransactionType.SavingsWithdrawal"/>
    /// — which goal this movement is credited to (contribution) or debited from (withdrawal).
    /// Null for every other type. See MoneyCalculator for how this affects AccountId's balance.
    /// </summary>
    public Guid? SavingsGoalId { get; set; }

    /// <summary>
    /// Set only for <see cref="TransactionType.LoanPayment"/> — which loan this payment reduces.
    /// Null for every other type. See MoneyCalculator for how this affects AccountId's balance
    /// and Loan's doc comment for why the loan's own remaining balance is derived from this
    /// instead of stored.
    /// </summary>
    public Guid? LoanId { get; set; }

    public string? Description { get; set; }

    /// <summary>
    /// The day the money actually moved — independent of <see cref="CreatedAt"/> (a user can log
    /// a transaction after the fact). <c>DateOnly</c> has no time-of-day/timezone component,
    /// which is what prevents it from ever shifting by a day depending on the reader's offset.
    /// </summary>
    public DateOnly TransactionDate { get; set; }

    public string? Notes { get; set; }

    /// <summary>
    /// Optional "who actually paid/received" — distinct from <see cref="CreatedByUserId"/> (who
    /// logged it). Null means unspecified. When set, must be an active member of this same
    /// couple — validated server-side, never trusted from the client.
    /// </summary>
    public Guid? PaidByUserId { get; set; }

    public Guid CreatedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Guid UpdatedByUserId { get; set; }

    public int Version { get; set; } = 1;

    public bool IsDeleted { get; set; }
}
