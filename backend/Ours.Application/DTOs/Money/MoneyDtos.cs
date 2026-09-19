using System.ComponentModel.DataAnnotations;
using Ours.Domain.Entities;

namespace Ours.Application.DTOs.Money;

/// <summary>
/// Shape of the "account" sync payload (see <see cref="Sync.SyncPushItemDto"/>). Like every
/// other Money entity, accounts only ever move through the generic sync push/pull.
/// </summary>
public sealed class AccountPayloadDto
{
    [Required, MaxLength(100)]
    public string Name { get; init; } = string.Empty;

    [Required, MaxLength(20)]
    public string Type { get; init; } = string.Empty;

    [Required, MaxLength(50)]
    public string Icon { get; init; } = "generic";

    /// <summary>Only applied on first CREATE — see SyncService.ApplyAccountChangeAsync. An UPDATE can never move this; a balance can only change by recording a Transaction.</summary>
    public decimal OpeningBalance { get; init; }

    [Required, MaxLength(3)]
    public string Currency { get; init; } = "PHP";

    public bool IsActive { get; init; } = true;
}

/// <summary>Shape of the "money_transaction" sync payload.</summary>
public sealed class TransactionPayloadDto
{
    [Required, MaxLength(20)]
    public string Type { get; init; } = string.Empty;

    [Required]
    public decimal Amount { get; init; }

    [Required, MaxLength(3)]
    public string Currency { get; init; } = "PHP";

    [Required]
    public Guid AccountId { get; init; }

    /// <summary>Only for a Transfer — the account the money moves into.</summary>
    public Guid? DestinationAccountId { get; init; }

    [MaxLength(TransactionCategory.MaxExpenseCategoryLength)]
    public string? Category { get; init; }

    [MaxLength(2000)]
    public string? Description { get; init; }

    [Required]
    public DateOnly TransactionDate { get; init; }

    [MaxLength(2000)]
    public string? Notes { get; init; }

    /// <summary>Must be an active member of the caller's own couple — validated in SyncService, never trusted as-is.</summary>
    public Guid? PaidByUserId { get; init; }

    /// <summary>Only for SavingsContribution/SavingsWithdrawal — which goal this movement is credited to/debited from. Must belong to the caller's own couple — validated in SyncService.</summary>
    public Guid? SavingsGoalId { get; init; }

    /// <summary>Only for LoanPayment — which loan this payment reduces. Must belong to the caller's own couple — validated in SyncService. In practice a client never pushes a LoanPayment directly (see TransactionType.LoanPayment); this only ever arrives via a pull, from LoanService.PayAsync.</summary>
    public Guid? LoanId { get; init; }

    /// <summary>Set by the server on pull; a client push never sets this — the server derives it from the authenticated user on first creation.</summary>
    public Guid? CreatedByUserId { get; init; }
}

/// <summary>Shape of the "budget" sync payload.</summary>
public sealed class BudgetPayloadDto
{
    [Required, MaxLength(TransactionCategory.MaxExpenseCategoryLength)]
    public string Category { get; init; } = string.Empty;

    [Required]
    public int Year { get; init; }

    /// <summary>1-12.</summary>
    [Required]
    public int Month { get; init; }

    [Required]
    public decimal Amount { get; init; }

    [Required, MaxLength(3)]
    public string Currency { get; init; } = "PHP";
}

/// <summary>Shape of the "savings_goal" sync payload.</summary>
public sealed class SavingsGoalPayloadDto
{
    [Required, MaxLength(60)]
    public string Name { get; init; } = string.Empty;

    [Required]
    public decimal TargetAmount { get; init; }

    [Required, MaxLength(3)]
    public string Currency { get; init; } = "PHP";

    /// <summary>This goal's share (0-100) of the monthly Savings allocation during "Distribute Money" — null/0 means manual-only. See SavingsGoal.AllocationPercent.</summary>
    [Range(0, 100)]
    public decimal? AllocationPercent { get; init; }

    public bool IsActive { get; init; } = true;
}

/// <summary>
/// Shape of the "loan" sync payload. Like every other Money entity, a loan's record (name,
/// provider, schedule, owner, payment account) only ever moves through the generic sync push/pull
/// — see Loan's doc comment for why its remaining balance/installments/status are never part of
/// this payload at all (they're derived, not stored).
/// </summary>
public sealed class LoanPayloadDto
{
    [Required, MaxLength(60)]
    public string Name { get; init; } = string.Empty;

    [MaxLength(60)]
    public string? Provider { get; init; }

    [Required]
    public decimal OriginalAmount { get; init; }

    [Required]
    public decimal MonthlyPayment { get; init; }

    [Required]
    public int TotalInstallments { get; init; }

    /// <summary>The date installment 1 is due — anchors the whole schedule (see LoanScheduleCalculator).</summary>
    [Required]
    public DateOnly FirstDueDate { get; init; }

    /// <summary>One of <see cref="Ours.Domain.Entities.LoanFrequency"/>'s constants — only "Monthly" is valid today.</summary>
    [Required, MaxLength(20)]
    public string Frequency { get; init; } = "Monthly";

    public decimal? FeesAmount { get; init; }

    [Required, MaxLength(3)]
    public string Currency { get; init; } = "PHP";

    [Required]
    public Guid PaymentAccountId { get; init; }

    /// <summary>Null means Joint. Must be an active member of the caller's own couple — validated in SyncService, never trusted as-is.</summary>
    public Guid? OwnerUserId { get; init; }
}
