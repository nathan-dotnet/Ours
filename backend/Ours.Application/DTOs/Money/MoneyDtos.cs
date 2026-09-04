using System.ComponentModel.DataAnnotations;

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

    [MaxLength(20)]
    public string? Category { get; init; }

    [MaxLength(2000)]
    public string? Description { get; init; }

    [Required]
    public DateOnly TransactionDate { get; init; }

    [MaxLength(2000)]
    public string? Notes { get; init; }

    /// <summary>Must be an active member of the caller's own couple — validated in SyncService, never trusted as-is.</summary>
    public Guid? PaidByUserId { get; init; }

    /// <summary>Set by the server on pull; a client push never sets this — the server derives it from the authenticated user on first creation.</summary>
    public Guid? CreatedByUserId { get; init; }
}

/// <summary>Shape of the "budget" sync payload.</summary>
public sealed class BudgetPayloadDto
{
    [Required, MaxLength(20)]
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
