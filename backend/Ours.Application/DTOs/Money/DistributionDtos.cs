using System.ComponentModel.DataAnnotations;

namespace Ours.Application.DTOs.Money;

/// <summary>One savings goal's share of a single "Distribute Money" action — see DistributeMoneyRequestDto.</summary>
public sealed class SavingsGoalAllocationInputDto
{
    [Required]
    public Guid SavingsGoalId { get; init; }

    /// <summary>This goal's share (0-100) of the Savings amount for *this* distribution — every entry across the request must sum to exactly 100.</summary>
    [Required, Range(0, 100)]
    public decimal AllocationPercent { get; init; }
}

/// <summary>One couple member's share of the Wants bucket for a single "Distribute Money" action — see DistributeMoneyRequestDto.WantsAllocations.</summary>
public sealed class WantsAllocationInputDto
{
    /// <summary>Must be an active member of the caller's own couple.</summary>
    [Required]
    public Guid UserId { get; init; }

    /// <summary>This member's share (0-100) of the Wants amount for *this* distribution — every entry across the request must sum to exactly 100.</summary>
    [Required, Range(0, 100)]
    public decimal AllocationPercent { get; init; }

    /// <summary>Where this member's Wants share is credited.</summary>
    [Required]
    public Guid AccountId { get; init; }
}

/// <summary>
/// Request to execute one "Distribute Money" action — the client sends the plan it wants used
/// (which may or may not match the couple's currently-saved default), and the server
/// authoritatively re-derives every peso amount rather than trusting client-rounded figures.
/// </summary>
public sealed class DistributeMoneyRequestDto
{
    [Required]
    public int Year { get; init; }

    /// <summary>1-12.</summary>
    [Required]
    public int Month { get; init; }

    [Required]
    public decimal CombinedIncome { get; init; }

    [Required, MaxLength(3)]
    public string Currency { get; init; } = "PHP";

    [Required, Range(0, 100)]
    public decimal BudgetPercent { get; init; }

    /// <summary>Where the Budget share is credited — an IncomeAllocation transaction is created against this account for BudgetAmount.</summary>
    [Required]
    public Guid BudgetAccountId { get; init; }

    [Required, Range(0, 100)]
    public decimal SavingsPercent { get; init; }

    /// <summary>Where the Savings share is credited — an IncomeAllocation transaction credits this account for SavingsAmount, then a SavingsContribution debits it again per goal (see SavingsGoalAllocations), so it nets to zero once the full amount is swept into named goals.</summary>
    [Required]
    public Guid SavingsAccountId { get; init; }

    /// <summary>How the Savings amount splits across goals — every non-zero-amount goal here gets a real SavingsContribution. Percentages must sum to exactly 100.</summary>
    [Required, MinLength(1)]
    public List<SavingsGoalAllocationInputDto> SavingsGoalAllocations { get; init; } = [];

    [Required, Range(0, 100)]
    public decimal WantsPercent { get; init; }

    /// <summary>How the Wants amount splits between the couple's members — every entry gets a real IncomeAllocation transaction crediting its own account. Percentages must sum to exactly 100.</summary>
    [Required, MinLength(1)]
    public List<WantsAllocationInputDto> WantsAllocations { get; init; } = [];

    /// <summary>
    /// Explicit confirmation to create another distribution for a period that already has one —
    /// see DistributionService.DistributeAsync. Defaults false, so a plain retry can never
    /// silently double a period's distribution.
    /// </summary>
    public bool Force { get; init; }
}

public sealed class DistributionDto
{
    public Guid Id { get; init; }
    public int Year { get; init; }
    public int Month { get; init; }
    public decimal CombinedIncome { get; init; }
    public string Currency { get; init; } = "PHP";
    public decimal BudgetPercent { get; init; }
    public decimal BudgetAmount { get; init; }
    public Guid? BudgetAccountId { get; init; }
    public decimal SavingsPercent { get; init; }
    public decimal SavingsAmount { get; init; }
    public Guid? SavingsAccountId { get; init; }
    public decimal WantsPercent { get; init; }
    public decimal WantsAmount { get; init; }
    public DateTimeOffset CreatedAt { get; init; }
    public Guid CreatedByUserId { get; init; }
}

/// <summary>Everything the Calculator screen needs for one income period in one call — has it already been distributed, plus a short overall history. Mirrors MissMeStatusResponseDto's "one call" shape.</summary>
public sealed class DistributionStatusResponseDto
{
    public bool AlreadyDistributed { get; init; }

    /// <summary>Every distribution already recorded for the requested period — normally 0 or 1, but a "Distribute Again" (Force=true) can add more.</summary>
    public List<DistributionDto> DistributionsForPeriod { get; init; } = [];

    /// <summary>A short recent history for the couple across all periods, newest first.</summary>
    public List<DistributionDto> RecentHistory { get; init; } = [];
}

public sealed class DistributeMoneyResponseDto
{
    public DistributionDto Distribution { get; init; } = null!;
}
