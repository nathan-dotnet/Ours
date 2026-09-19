using Microsoft.EntityFrameworkCore;
using Ours.Application.Common;
using Ours.Application.DTOs.Money;
using Ours.Application.Services;
using Ours.Application.Tests.Fakes;
using Ours.Domain.Entities;
using Ours.Infrastructure.Persistence;
using Xunit;

namespace Ours.Application.Tests.Services;

public class LoanServiceTests
{
    private static async Task<(
        LoanService Service,
        FakeDateTimeProvider Clock,
        AppDbContext Db,
        Guid CoupleId,
        Guid AliceId,
        Account GCash,
        Account Bpi,
        Loan Shopee)> BuildAsync()
    {
        var db = TestDbContextFactory.Create();
        var clock = new FakeDateTimeProvider();
        var aliceId = Guid.NewGuid();
        var coupleId = Guid.NewGuid();

        db.Couples.Add(new Couple
        {
            Id = coupleId,
            InviteCode = "OURS-TEST",
            CreatedByUserId = aliceId,
            UpdatedByUserId = aliceId,
            CreatedAt = clock.UtcNow,
            UpdatedAt = clock.UtcNow,
            Version = 1,
        });
        db.CoupleMembers.Add(new CoupleMember { Id = Guid.NewGuid(), CoupleId = coupleId, UserId = aliceId, JoinedAt = clock.UtcNow });

        Account MakeAccount(string name, decimal openingBalance) => new()
        {
            Id = Guid.NewGuid(),
            CoupleId = coupleId,
            Name = name,
            Type = AccountType.Bank,
            OpeningBalance = openingBalance,
            CreatedByUserId = aliceId,
            UpdatedByUserId = aliceId,
            CreatedAt = clock.UtcNow,
            UpdatedAt = clock.UtcNow,
            Version = 1,
        };

        var gcash = MakeAccount("GCash", 10_000m);
        var bpi = MakeAccount("BPI", 5_000m);
        db.Accounts.AddRange(gcash, bpi);

        var shopee = new Loan
        {
            Id = Guid.NewGuid(),
            CoupleId = coupleId,
            Name = "Shopee PayLater",
            Provider = "Shopee",
            OriginalAmount = 10_200m,
            MonthlyPayment = 1_700m,
            TotalInstallments = 6,
            FirstDueDate = new DateOnly(2026, 9, 15),
            Currency = "PHP",
            PaymentAccountId = gcash.Id,
            OwnerUserId = aliceId,
            CreatedByUserId = aliceId,
            UpdatedByUserId = aliceId,
            CreatedAt = clock.UtcNow,
            UpdatedAt = clock.UtcNow,
            Version = 1,
        };
        db.Loans.Add(shopee);

        await db.SaveChangesAsync();

        var currentUser = new FakeCurrentUserService { UserId = aliceId, CoupleId = coupleId };
        return (new LoanService(db, currentUser, clock), clock, db, coupleId, aliceId, gcash, bpi, shopee);
    }

    private static LoanPaymentRequestDto PaymentRequest(Guid accountId, decimal amount, Guid? paymentId = null) => new()
    {
        PaymentId = paymentId ?? Guid.NewGuid(),
        Amount = amount,
        AccountId = accountId,
    };

    [Fact]
    public async Task PayAsync_MatchesTheSpecWorkedExample_DecreasingTheAccountAndTheLoanTogether()
    {
        var (service, _, db, _, _, gcash, _, shopee) = await BuildAsync();

        var response = await service.PayAsync(shopee.Id, PaymentRequest(gcash.Id, 1_700m));

        Assert.Equal(8_500m, response.Loan.RemainingBalance);
        Assert.Equal(1, response.Loan.InstallmentsPaid);
        Assert.Equal(5, response.Loan.RemainingInstallments);
        Assert.Equal(LoanStatus.Active, response.Loan.Status);

        var transactions = await db.Transactions.ToListAsync();
        Assert.Equal(8_300m, MoneyCalculator.CalculateAccountBalance(gcash.OpeningBalance, gcash.Id, transactions)); // 10,000 - 1,700
    }

    [Fact]
    public async Task PayAsync_CreatesOneLoanPaymentTransaction_IdentifyingTheLoanAndWhoPaid()
    {
        var (service, _, db, coupleId, aliceId, gcash, _, shopee) = await BuildAsync();

        await service.PayAsync(shopee.Id, PaymentRequest(gcash.Id, 1_700m));

        var payment = await db.Transactions.SingleAsync(t => t.CoupleId == coupleId && t.Type == TransactionType.LoanPayment);
        Assert.Equal(shopee.Id, payment.LoanId);
        Assert.Equal(gcash.Id, payment.AccountId);
        Assert.Equal(1_700m, payment.Amount);
        Assert.Equal(aliceId, payment.PaidByUserId);
        Assert.Null(payment.Category);
    }

    [Fact]
    public async Task PayAsync_NeverCountsALoanPayment_AsOrdinarySpending()
    {
        var (service, clock, db, _, _, gcash, _, shopee) = await BuildAsync();

        await service.PayAsync(shopee.Id, PaymentRequest(gcash.Id, 1_700m));

        var transactions = await db.Transactions.ToListAsync();
        Assert.Equal(0m, MoneyCalculator.CalculateMonthlySpending(transactions, clock.UtcNow.Year, clock.UtcNow.Month));
    }

    [Fact]
    public async Task PayAsync_TracksTwoIndependentLoans_WithoutCrossContamination()
    {
        var (service, clock, db, coupleId, aliceId, gcash, bpi, shopee) = await BuildAsync();
        var tiktok = new Loan
        {
            Id = Guid.NewGuid(),
            CoupleId = coupleId,
            Name = "TikTok PayLater",
            OriginalAmount = 5_000m,
            MonthlyPayment = 1_000m,
            TotalInstallments = 5,
            FirstDueDate = new DateOnly(2026, 9, 20),
            Currency = "PHP",
            PaymentAccountId = bpi.Id,
            CreatedByUserId = aliceId,
            UpdatedByUserId = aliceId,
            CreatedAt = clock.UtcNow,
            UpdatedAt = clock.UtcNow,
            Version = 1,
        };
        db.Loans.Add(tiktok);
        await db.SaveChangesAsync();

        await service.PayAsync(shopee.Id, PaymentRequest(gcash.Id, 1_700m));
        await service.PayAsync(tiktok.Id, PaymentRequest(bpi.Id, 1_000m));

        var transactions = await db.Transactions.ToListAsync();
        Assert.Equal(8_300m, MoneyCalculator.CalculateAccountBalance(gcash.OpeningBalance, gcash.Id, transactions));
        Assert.Equal(4_000m, MoneyCalculator.CalculateAccountBalance(bpi.OpeningBalance, bpi.Id, transactions));
        Assert.Equal(8_500m, shopee.OriginalAmount - MoneyCalculator.CalculateLoanPaidAmount(shopee.Id, transactions));
        Assert.Equal(4_000m, tiktok.OriginalAmount - MoneyCalculator.CalculateLoanPaidAmount(tiktok.Id, transactions));
    }

    [Fact]
    public async Task PayAsync_MultiplePayments_AdvanceInstallmentsCorrectly_AndReachPaidOff()
    {
        var (service, _, db, coupleId, aliceId, _, _, shopee) = await BuildAsync();
        // 6 x 1,700 = 10,200 total — GCash's spec-worked-example balance (10,000) isn't quite
        // enough to fully pay this off across every installment, so this test uses its own
        // sufficiently funded account rather than stretch the shared fixture's own numbers.
        var wellFunded = new Account { Id = Guid.NewGuid(), CoupleId = coupleId, Name = "Well-funded", Type = AccountType.Bank, OpeningBalance = 20_000m, CreatedByUserId = aliceId, UpdatedByUserId = aliceId };
        db.Accounts.Add(wellFunded);
        await db.SaveChangesAsync();

        for (var i = 0; i < 5; i++)
        {
            var progress = await service.PayAsync(shopee.Id, PaymentRequest(wellFunded.Id, 1_700m));
            Assert.Equal(i + 1, progress.Loan.InstallmentsPaid);
            Assert.Equal(LoanStatus.Active, progress.Loan.Status);
        }

        var final = await service.PayAsync(shopee.Id, PaymentRequest(wellFunded.Id, 1_700m));
        Assert.Equal(6, final.Loan.InstallmentsPaid);
        Assert.Equal(0, final.Loan.RemainingInstallments);
        Assert.Equal(0m, final.Loan.RemainingBalance);
        Assert.Equal(LoanStatus.PaidOff, final.Loan.Status);
    }

    [Fact]
    public async Task PayAsync_APartialPayment_DoesNotFalselyCompleteAnInstallment()
    {
        var (service, _, _, _, _, gcash, _, shopee) = await BuildAsync();

        var response = await service.PayAsync(shopee.Id, PaymentRequest(gcash.Id, 850m)); // half of the 1,700 installment

        Assert.Equal(0, response.Loan.InstallmentsPaid);
        Assert.Equal(6, response.Loan.RemainingInstallments);
        Assert.Equal(9_350m, response.Loan.RemainingBalance);
    }

    [Fact]
    public async Task PayAsync_AnOverpaymentAcrossInstallments_CreditsMultipleInstallmentsAtOnce()
    {
        var (service, _, _, _, _, gcash, _, shopee) = await BuildAsync();

        var response = await service.PayAsync(shopee.Id, PaymentRequest(gcash.Id, 3_400m)); // exactly two installments

        Assert.Equal(2, response.Loan.InstallmentsPaid);
        Assert.Equal(4, response.Loan.RemainingInstallments);
    }

    [Fact]
    public async Task PayAsync_TheSamePaymentIdSentTwice_IsANoOp_NotADoubleDebit()
    {
        var (service, _, db, _, _, gcash, _, shopee) = await BuildAsync();
        var request = PaymentRequest(gcash.Id, 1_700m);

        var first = await service.PayAsync(shopee.Id, request);
        var second = await service.PayAsync(shopee.Id, request); // same PaymentId — a retried request/double tap

        Assert.Equal(first.TransactionId, second.TransactionId);
        Assert.Equal(8_500m, second.Loan.RemainingBalance); // still one installment's worth, not two
        Assert.Equal(1, await db.Transactions.CountAsync(t => t.Type == TransactionType.LoanPayment));

        var transactions = await db.Transactions.ToListAsync();
        Assert.Equal(8_300m, MoneyCalculator.CalculateAccountBalance(gcash.OpeningBalance, gcash.Id, transactions)); // debited only once
    }

    [Fact]
    public async Task PayAsync_RejectsAZeroOrNegativeAmount()
    {
        var (service, _, _, _, _, gcash, _, shopee) = await BuildAsync();

        await Assert.ThrowsAsync<ValidationAppException>(() => service.PayAsync(shopee.Id, PaymentRequest(gcash.Id, 0m)));
        await Assert.ThrowsAsync<ValidationAppException>(() => service.PayAsync(shopee.Id, PaymentRequest(gcash.Id, -100m)));
    }

    [Fact]
    public async Task PayAsync_RejectsAPaymentLargerThanTheRemainingBalance()
    {
        var (service, _, _, _, _, gcash, _, shopee) = await BuildAsync();

        await Assert.ThrowsAsync<ValidationAppException>(() => service.PayAsync(shopee.Id, PaymentRequest(gcash.Id, 10_300m)));
    }

    [Fact]
    public async Task PayAsync_RejectsPayingAnAlreadyPaidOffLoan()
    {
        var (service, _, db, coupleId, aliceId, gcash, _, shopee) = await BuildAsync();
        var wellFunded = new Account { Id = Guid.NewGuid(), CoupleId = coupleId, Name = "Well-funded", Type = AccountType.Bank, OpeningBalance = 20_000m, CreatedByUserId = aliceId, UpdatedByUserId = aliceId };
        db.Accounts.Add(wellFunded);
        await db.SaveChangesAsync();
        for (var i = 0; i < 6; i++)
        {
            await service.PayAsync(shopee.Id, PaymentRequest(wellFunded.Id, 1_700m));
        }

        await Assert.ThrowsAsync<ValidationAppException>(() => service.PayAsync(shopee.Id, PaymentRequest(gcash.Id, 100m)));
    }

    [Fact]
    public async Task PayAsync_RejectsInsufficientAccountBalance_ServerSide()
    {
        var (service, _, db, coupleId, aliceId, _, _, _) = await BuildAsync();
        var lowBalanceAccount = new Account
        {
            Id = Guid.NewGuid(), CoupleId = coupleId, Name = "Empty Wallet", Type = AccountType.EWallet,
            OpeningBalance = 1_000m, CreatedByUserId = aliceId, UpdatedByUserId = aliceId,
        };
        var loan = new Loan
        {
            Id = Guid.NewGuid(), CoupleId = coupleId, Name = "Small Loan", OriginalAmount = 5_000m,
            MonthlyPayment = 1_700m, TotalInstallments = 3, FirstDueDate = new DateOnly(2026, 9, 1), Currency = "PHP",
            PaymentAccountId = lowBalanceAccount.Id, CreatedByUserId = aliceId, UpdatedByUserId = aliceId,
        };
        db.Accounts.Add(lowBalanceAccount);
        db.Loans.Add(loan);
        await db.SaveChangesAsync();

        var ex = await Assert.ThrowsAsync<ValidationAppException>(() => service.PayAsync(loan.Id, PaymentRequest(lowBalanceAccount.Id, 1_700m)));
        Assert.Contains("Insufficient balance", ex.Message);
    }

    [Fact]
    public async Task PayAsync_RejectsAnAccountThatBelongsToAnotherCouple()
    {
        var (service, _, db, _, _, _, _, shopee) = await BuildAsync();
        var otherAccount = new Account { Id = Guid.NewGuid(), CoupleId = Guid.NewGuid(), Name = "Not yours", OpeningBalance = 100_000m };
        db.Accounts.Add(otherAccount);
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<ValidationAppException>(() => service.PayAsync(shopee.Id, PaymentRequest(otherAccount.Id, 1_700m)));
    }

    [Fact]
    public async Task PayAsync_CanNeverBeUsedAcrossCoupleBoundaries()
    {
        var (service, _, db, _, aliceId, gcash, _, _) = await BuildAsync();
        var otherCoupleId = Guid.NewGuid();
        var otherLoan = new Loan
        {
            Id = Guid.NewGuid(), CoupleId = otherCoupleId, Name = "Not yours", OriginalAmount = 5_000m,
            MonthlyPayment = 1_000m, TotalInstallments = 5, FirstDueDate = new DateOnly(2026, 9, 1), Currency = "PHP",
            PaymentAccountId = Guid.NewGuid(), CreatedByUserId = aliceId, UpdatedByUserId = aliceId,
        };
        db.Loans.Add(otherLoan);
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<NotFoundAppException>(() => service.PayAsync(otherLoan.Id, PaymentRequest(gcash.Id, 1_000m)));
    }

    [Fact]
    public async Task PayAsync_RejectsAnUnknownLoanId()
    {
        var (service, _, _, _, _, gcash, _, _) = await BuildAsync();

        await Assert.ThrowsAsync<NotFoundAppException>(() => service.PayAsync(Guid.NewGuid(), PaymentRequest(gcash.Id, 1_000m)));
    }

    [Fact]
    public async Task PayAsync_ReportsTheNextUnpaidInstallment_AfterAPartialPayment()
    {
        var (service, _, _, _, _, gcash, _, shopee) = await BuildAsync();

        var response = await service.PayAsync(shopee.Id, PaymentRequest(gcash.Id, 850m)); // half of installment 1's 1,700

        // Still installment 1, but only what's left of it — never the full 1,700 again.
        Assert.Equal(850m, response.Loan.NextPaymentAmount);
        Assert.Equal(new DateOnly(2026, 9, 15), response.Loan.NextPaymentDueDate);
    }

    [Fact]
    public async Task PayAsync_CompletingAPartialPayment_AdvancesToTheNextInstallment()
    {
        var (service, _, _, _, _, gcash, _, shopee) = await BuildAsync();
        await service.PayAsync(shopee.Id, PaymentRequest(gcash.Id, 850m));

        var response = await service.PayAsync(shopee.Id, PaymentRequest(gcash.Id, 850m)); // tops up installment 1 to exactly 1,700

        Assert.Equal(1, response.Loan.InstallmentsPaid);
        Assert.Equal(1_700m, response.Loan.NextPaymentAmount); // installment 2's full amount
        Assert.Equal(new DateOnly(2026, 10, 15), response.Loan.NextPaymentDueDate);
    }

    [Fact]
    public async Task PayAsync_HasNoNextPayment_OnceTheLoanIsFullyPaidOff()
    {
        var (service, _, db, coupleId, aliceId, _, _, shopee) = await BuildAsync();
        var wellFunded = new Account { Id = Guid.NewGuid(), CoupleId = coupleId, Name = "Well-funded", Type = AccountType.Bank, OpeningBalance = 20_000m, CreatedByUserId = aliceId, UpdatedByUserId = aliceId };
        db.Accounts.Add(wellFunded);
        await db.SaveChangesAsync();

        LoanPaymentResponseDto final = null!;
        for (var i = 0; i < 6; i++)
        {
            final = await service.PayAsync(shopee.Id, PaymentRequest(wellFunded.Id, 1_700m));
        }

        Assert.Null(final.Loan.NextPaymentAmount);
        Assert.Null(final.Loan.NextPaymentDueDate);
    }

    [Fact]
    public async Task PayAsync_RejectsAPaidLoan_ThatHasBeenSoftDeleted()
    {
        var (service, _, db, _, _, gcash, _, shopee) = await BuildAsync();
        shopee.IsDeleted = true;
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<NotFoundAppException>(() => service.PayAsync(shopee.Id, PaymentRequest(gcash.Id, 1_700m)));
    }
}
