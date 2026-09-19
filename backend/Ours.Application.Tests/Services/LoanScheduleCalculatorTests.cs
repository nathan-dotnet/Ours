using Ours.Domain.Entities;
using Ours.Application.Services;
using Xunit;

namespace Ours.Application.Tests.Services;

public class LoanScheduleCalculatorTests
{
    private static Loan MakeLoan(decimal originalAmount, decimal monthlyPayment, int totalInstallments, DateOnly firstDueDate) => new()
    {
        Id = Guid.NewGuid(),
        Name = "Shopee PayLater",
        OriginalAmount = originalAmount,
        MonthlyPayment = monthlyPayment,
        TotalInstallments = totalInstallments,
        FirstDueDate = firstDueDate,
        Frequency = LoanFrequency.Monthly,
        Currency = "PHP",
    };

    [Fact]
    public void GenerateSchedule_MatchesTheSpecWorkedExample_ThreeMonthlyInstallments()
    {
        var loan = MakeLoan(3_000m, 1_000m, 3, new DateOnly(2026, 9, 15));

        var schedule = LoanScheduleCalculator.GenerateSchedule(loan);

        Assert.Equal(3, schedule.Count);
        Assert.Equal(new DateOnly(2026, 9, 15), schedule[0].DueDate);
        Assert.Equal(new DateOnly(2026, 10, 15), schedule[1].DueDate);
        Assert.Equal(new DateOnly(2026, 11, 15), schedule[2].DueDate);
        Assert.All(schedule, s => Assert.Equal(1_000m, s.ScheduledAmount));
    }

    [Fact]
    public void GenerateSchedule_TheLastInstallmentAbsorbsAnyRemainder_SoTheScheduleSumsToExactlyTheOriginalAmount()
    {
        // 10,200 / 6 = 1,700 exactly, but a mismatched MonthlyPayment (e.g. entered slightly off)
        // must still reconcile to the true OriginalAmount, never drift by a few cents/pesos.
        var loan = MakeLoan(10_205m, 1_700m, 6, new DateOnly(2026, 9, 15));

        var schedule = LoanScheduleCalculator.GenerateSchedule(loan);

        Assert.Equal(1_700m, schedule[0].ScheduledAmount);
        Assert.Equal(1_705m, schedule[^1].ScheduledAmount); // 10,205 - (5 * 1,700)
        Assert.Equal(10_205m, schedule.Sum(s => s.ScheduledAmount));
    }

    [Fact]
    public void GenerateSchedule_ClampsToTheShorterMonth_JanuaryThirtyFirstIntoFebruary()
    {
        var loan = MakeLoan(3_000m, 1_000m, 3, new DateOnly(2026, 1, 31));

        var schedule = LoanScheduleCalculator.GenerateSchedule(loan);

        Assert.Equal(new DateOnly(2026, 1, 31), schedule[0].DueDate);
        Assert.Equal(new DateOnly(2026, 2, 28), schedule[1].DueDate); // 2026 is not a leap year
        Assert.Equal(new DateOnly(2026, 3, 31), schedule[2].DueDate); // never rolls forward from Feb's clamp
    }

    [Fact]
    public void GenerateSchedule_ClampsToTheShorterMonth_RespectsALeapFebruary()
    {
        var loan = MakeLoan(2_000m, 1_000m, 2, new DateOnly(2028, 1, 31)); // 2028 is a leap year

        var schedule = LoanScheduleCalculator.GenerateSchedule(loan);

        Assert.Equal(new DateOnly(2028, 2, 29), schedule[1].DueDate);
    }

    [Fact]
    public void AllocatePayments_OnePaymentPerInstallment_MarksEachFullyPaidInOrder()
    {
        var loan = MakeLoan(3_000m, 1_000m, 3, new DateOnly(2026, 9, 15));
        var schedule = LoanScheduleCalculator.GenerateSchedule(loan);

        var afterOne = LoanScheduleCalculator.AllocatePayments(schedule, [1_000m]);
        Assert.True(afterOne[0].IsFullyPaid);
        Assert.False(afterOne[1].IsFullyPaid);
        Assert.False(afterOne[2].IsFullyPaid);
        Assert.Equal(2, LoanScheduleCalculator.GetNextUnpaidInstallment(afterOne)!.InstallmentNumber);

        var afterTwo = LoanScheduleCalculator.AllocatePayments(schedule, [1_000m, 1_000m]);
        Assert.True(afterTwo[0].IsFullyPaid);
        Assert.True(afterTwo[1].IsFullyPaid);
        Assert.False(afterTwo[2].IsFullyPaid);
        Assert.Equal(2, afterTwo[1].InstallmentNumber);

        var afterThree = LoanScheduleCalculator.AllocatePayments(schedule, [1_000m, 1_000m, 1_000m]);
        Assert.All(afterThree, p => Assert.True(p.IsFullyPaid));
        Assert.Null(LoanScheduleCalculator.GetNextUnpaidInstallment(afterThree));
    }

    [Fact]
    public void AllocatePayments_APartialPayment_DoesNotFalselyCompleteAnInstallment()
    {
        var loan = MakeLoan(3_000m, 1_000m, 3, new DateOnly(2026, 9, 15));
        var schedule = LoanScheduleCalculator.GenerateSchedule(loan);

        var progress = LoanScheduleCalculator.AllocatePayments(schedule, [500m]);

        Assert.False(progress[0].IsFullyPaid);
        Assert.Equal(500m, progress[0].PaidToward);
        Assert.Equal(500m, progress[0].RemainingAmount);
        var next = LoanScheduleCalculator.GetNextUnpaidInstallment(progress);
        Assert.NotNull(next);
        Assert.Equal(1, next!.InstallmentNumber);
        Assert.Equal(500m, next.RemainingAmount);
    }

    [Fact]
    public void AllocatePayments_ATopUpPayment_CompletesThePreviouslyPartialInstallment()
    {
        var loan = MakeLoan(3_000m, 1_000m, 3, new DateOnly(2026, 9, 15));
        var schedule = LoanScheduleCalculator.GenerateSchedule(loan);

        // Two separate payments totalling the full installment — same result as one payment of 1,000.
        var progress = LoanScheduleCalculator.AllocatePayments(schedule, [500m, 500m]);

        Assert.True(progress[0].IsFullyPaid);
        Assert.Equal(0m, progress[0].RemainingAmount);
        Assert.False(progress[1].IsFullyPaid);
    }

    [Fact]
    public void AllocatePayments_AnOverpaymentAcrossInstallments_CreditsMultipleInstallmentsAtOnce()
    {
        var loan = MakeLoan(3_000m, 1_000m, 3, new DateOnly(2026, 9, 15));
        var schedule = LoanScheduleCalculator.GenerateSchedule(loan);

        var progress = LoanScheduleCalculator.AllocatePayments(schedule, [2_500m]); // 2 full + half of the 3rd

        Assert.True(progress[0].IsFullyPaid);
        Assert.True(progress[1].IsFullyPaid);
        Assert.False(progress[2].IsFullyPaid);
        Assert.Equal(500m, progress[2].PaidToward);
        Assert.Equal(500m, progress[2].RemainingAmount);
    }

    [Fact]
    public void AllocatePayments_NoPayments_LeavesEveryInstallmentUnpaid()
    {
        var loan = MakeLoan(3_000m, 1_000m, 3, new DateOnly(2026, 9, 15));
        var schedule = LoanScheduleCalculator.GenerateSchedule(loan);

        var progress = LoanScheduleCalculator.AllocatePayments(schedule, []);

        Assert.All(progress, p => Assert.False(p.IsFullyPaid));
        Assert.Equal(1, LoanScheduleCalculator.GetNextUnpaidInstallment(progress)!.InstallmentNumber);
    }

    [Fact]
    public void AllocatePayments_FullyPaidLoan_HasNoNextUnpaidInstallment()
    {
        var loan = MakeLoan(3_000m, 1_000m, 3, new DateOnly(2026, 9, 15));
        var schedule = LoanScheduleCalculator.GenerateSchedule(loan);

        var progress = LoanScheduleCalculator.AllocatePayments(schedule, [3_000m]);

        Assert.Null(LoanScheduleCalculator.GetNextUnpaidInstallment(progress));
    }

    [Fact]
    public void AllocatePayments_PaymentOrderDoesNotMatter_OnlyTheTotalDoes()
    {
        var loan = MakeLoan(3_000m, 1_000m, 3, new DateOnly(2026, 9, 15));
        var schedule = LoanScheduleCalculator.GenerateSchedule(loan);

        var a = LoanScheduleCalculator.AllocatePayments(schedule, [300m, 1_200m, 500m]);
        var b = LoanScheduleCalculator.AllocatePayments(schedule, [2_000m]);

        Assert.Equal(a.Select(p => p.PaidToward), b.Select(p => p.PaidToward));
    }
}
