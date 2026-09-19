using Ours.Domain.Entities;

namespace Ours.Application.Services;

/// <summary>One planned installment — never stored (see Loan's doc comment); always generated fresh from the loan's own fields.</summary>
public sealed record ScheduledInstallment(int InstallmentNumber, DateOnly DueDate, decimal ScheduledAmount);

/// <summary>One planned installment plus how much of it has actually been paid — see LoanScheduleCalculator.AllocatePayments.</summary>
public sealed record InstallmentProgress(int InstallmentNumber, DateOnly DueDate, decimal ScheduledAmount, decimal PaidToward, decimal RemainingAmount, bool IsFullyPaid);

/// <summary>
/// Turns a Loan's own fields into its fixed repayment schedule, and that schedule plus its actual
/// LoanPayment transactions into per-installment progress — the mobile mirror is
/// utils/loanSchedule.ts, and the two must stay in lockstep (same reasoning as MoneyCalculator's
/// own mobile mirror, utils/moneyCalculations.ts). See Loan's doc comment for why nothing here is
/// ever a stored column.
/// </summary>
public static class LoanScheduleCalculator
{
    /// <summary>
    /// Builds the fixed N-installment schedule: each installment lands one <see cref="LoanFrequency"/>
    /// period after the previous one (only Monthly exists today — one calendar month later,
    /// clamped to the shorter month exactly like DateTime's own end-of-month rules require, e.g. a
    /// Jan 31 first due date's second installment lands on Feb 28/29, never rolling into March).
    /// Every installment but the last is exactly <see cref="Loan.MonthlyPayment"/>; the last
    /// absorbs whatever remainder is needed so the schedule always sums to exactly
    /// <see cref="Loan.OriginalAmount"/> — the same "last share absorbs the remainder" technique
    /// DistributionService already uses for splitting income, applied here to splitting a debt.
    /// </summary>
    public static IReadOnlyList<ScheduledInstallment> GenerateSchedule(Loan loan)
    {
        var installments = new List<ScheduledInstallment>(loan.TotalInstallments);
        var runningTotal = 0m;
        for (var i = 0; i < loan.TotalInstallments; i++)
        {
            var dueDate = AddPeriods(loan.FirstDueDate, i, loan.Frequency);
            var isLast = i == loan.TotalInstallments - 1;
            var amount = isLast ? loan.OriginalAmount - runningTotal : loan.MonthlyPayment;
            installments.Add(new ScheduledInstallment(i + 1, dueDate, amount));
            runningTotal += amount;
        }
        return installments;
    }

    /// <summary>
    /// Waterfall allocation: pools every payment amount together (money is fungible — which
    /// specific payment covered which specific installment isn't a meaningful question, only the
    /// running total is), then walks the schedule in order, draining the pool into each
    /// installment's ScheduledAmount before spilling into the next. This is what makes a partial
    /// payment (₱500 of a ₱1,000 installment) show as incomplete rather than being silently
    /// rounded away by a naive <c>floor(totalPaid / MonthlyPayment)</c> — and what makes a later
    /// top-up payment correctly complete that same installment instead of starting a new one.
    /// </summary>
    public static IReadOnlyList<InstallmentProgress> AllocatePayments(IReadOnlyList<ScheduledInstallment> schedule, IEnumerable<decimal> payments)
    {
        var pool = payments.Sum();

        var progress = new List<InstallmentProgress>(schedule.Count);
        foreach (var installment in schedule)
        {
            var paidToward = Math.Max(0m, Math.Min(pool, installment.ScheduledAmount));
            pool -= paidToward;
            var remaining = installment.ScheduledAmount - paidToward;
            progress.Add(new InstallmentProgress(installment.InstallmentNumber, installment.DueDate, installment.ScheduledAmount, paidToward, remaining, remaining <= 0m));
        }
        return progress;
    }

    /// <summary>The first not-fully-paid installment, in schedule order — what the "Pay" screen defaults its amount/due-date display to.</summary>
    public static InstallmentProgress? GetNextUnpaidInstallment(IReadOnlyList<InstallmentProgress> progress) =>
        progress.FirstOrDefault(p => !p.IsFullyPaid);

    private static DateOnly AddPeriods(DateOnly firstDueDate, int periodsElapsed, string frequency)
    {
        // Only Monthly exists today (see LoanFrequency) — a future frequency adds its own branch here.
        return periodsElapsed == 0 ? firstDueDate : AddMonthsClamped(firstDueDate, periodsElapsed);
    }

    /// <summary>
    /// DateOnly.AddMonths already clamps to the shorter target month on its own (matching
    /// DateTime's behavior) — e.g. Jan 31 + 1 month = Feb 28 (or 29), never overflowing into
    /// March. Kept as its own named helper so the "why no manual clamping code" is documented
    /// once, rather than trusted silently at the call site.
    /// </summary>
    private static DateOnly AddMonthsClamped(DateOnly date, int months) => date.AddMonths(months);
}
