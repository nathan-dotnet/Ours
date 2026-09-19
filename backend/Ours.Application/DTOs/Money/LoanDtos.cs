using System.ComponentModel.DataAnnotations;

namespace Ours.Application.DTOs.Money;

/// <summary>
/// A loan plus its *derived* figures (see Loan's doc comment) — only ever returned by
/// LoanService.PayAsync's response. Every other read of a loan's record happens through the
/// generic sync pull (LoanPayloadDto) + the mobile app deriving these same figures locally from
/// its own transaction mirror (utils/moneyCalculations.ts) — this DTO exists purely so a payment's
/// response can hand back the couple's fresh state in one round trip, without a second endpoint.
/// </summary>
public sealed class LoanDto
{
    public Guid Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Provider { get; init; }
    public decimal OriginalAmount { get; init; }
    public decimal MonthlyPayment { get; init; }
    public int TotalInstallments { get; init; }
    public DateOnly FirstDueDate { get; init; }
    public string Frequency { get; init; } = "Monthly";
    public decimal? FeesAmount { get; init; }
    public string Currency { get; init; } = "PHP";
    public Guid PaymentAccountId { get; init; }
    public Guid? OwnerUserId { get; init; }

    public decimal PaidAmount { get; init; }
    public decimal RemainingBalance { get; init; }
    public int InstallmentsPaid { get; init; }
    public int RemainingInstallments { get; init; }

    /// <summary>Null once the loan is fully paid off — see LoanScheduleCalculator.GetNextUnpaidInstallment.</summary>
    public decimal? NextPaymentAmount { get; init; }
    public DateOnly? NextPaymentDueDate { get; init; }

    /// <summary>"Active" or "PaidOff" — see LoanStatus.</summary>
    public string Status { get; init; } = string.Empty;
}

public static class LoanStatus
{
    public const string Active = "Active";
    public const string PaidOff = "PaidOff";
}

/// <summary>Request to record one payment toward a loan — mirrors DistributeMoneyRequestDto's "server re-derives everything, never trusts a client-computed amount" discipline.</summary>
public sealed class LoanPaymentRequestDto
{
    /// <summary>
    /// Device-generated (see the mobile UUID convention) — becomes the created Transaction's Id.
    /// Trusted as-is on first create, exactly like every other transaction; sending the *same*
    /// PaymentId twice (a double tap, a retried request, a sync retry) is what makes this endpoint
    /// idempotent — see LoanService.PayAsync.
    /// </summary>
    [Required]
    public Guid PaymentId { get; init; }

    [Required]
    public decimal Amount { get; init; }

    [Required]
    public Guid AccountId { get; init; }

    /// <summary>Defaults to today (server clock) when omitted.</summary>
    public DateOnly? PaymentDate { get; init; }

    [MaxLength(2000)]
    public string? Description { get; init; }

    [MaxLength(2000)]
    public string? Notes { get; init; }
}

public sealed class LoanPaymentResponseDto
{
    public LoanDto Loan { get; init; } = null!;

    /// <summary>The created (or, on a duplicate PaymentId, the already-existing) LoanPayment transaction id.</summary>
    public Guid TransactionId { get; init; }
}
