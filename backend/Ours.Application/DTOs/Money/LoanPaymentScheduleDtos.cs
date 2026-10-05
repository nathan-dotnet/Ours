namespace Ours.Application.DTOs.Money;

/// <summary>Payload for the couple-synced planned installment entity.</summary>
public sealed class LoanPaymentSchedulePayloadDto
{
    public Guid LoanId { get; init; }

    public DateOnly DueDate { get; init; }

    public decimal PlannedAmount { get; init; }
}

public sealed class LoanMonthReportDto
{
    public int Year { get; init; }

    public int Month { get; init; }

    public decimal TotalDue { get; init; }

    public decimal TotalPaid { get; init; }

    public decimal Remaining { get; init; }

    public List<LoanMonthReportItemDto> Loans { get; init; } = [];
}

public sealed class LoanMonthReportItemDto
{
    public Guid LoanId { get; init; }

    public string LoanName { get; init; } = string.Empty;

    public string Currency { get; init; } = "PHP";

    public decimal TotalDue { get; init; }

    public decimal TotalPaid { get; init; }

    public decimal Remaining { get; init; }
}