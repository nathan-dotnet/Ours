using Ours.Domain.Common;

namespace Ours.Domain.Entities;

/// <summary>A synced planned installment. It is not payment history; paid amounts come only from LoanPayment transactions.</summary>
public class LoanPaymentSchedule : ISyncableEntity
{
    public Guid Id { get; set; }

    public Guid LoanId { get; set; }

    public Guid CoupleId { get; set; }

    public DateOnly DueDate { get; set; }

    public decimal PlannedAmount { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Guid UpdatedByUserId { get; set; }

    public int Version { get; set; } = 1;

    public bool IsDeleted { get; set; }
}