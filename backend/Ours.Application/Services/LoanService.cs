using Microsoft.EntityFrameworkCore;
using Ours.Application.Abstractions;
using Ours.Application.Common;
using Ours.Application.DTOs.Money;
using Ours.Domain.Entities;

namespace Ours.Application.Services;

/// <summary>
/// "Pay" a loan from the Loans tab. A loan's own record (name, provider, schedule, owner,
/// payment account) is a plain synced entity — see Loan's doc comment — but *paying* one needs
/// something the generic offline sync pipeline can't give it: a synchronous, server-enforced
/// balance/overpayment check and an atomic, idempotent outcome. Like Distribution/MissMe, this is
/// a small dedicated service behind its own endpoint rather than a synced action.
///
/// Ours never talks to a real bank/lender (see Loan's doc comment) — this only ever moves money
/// between the couple's own tracked accounts and records that internal fact via one real
/// LoanPayment transaction; the couple still pays Shopee/TikTok/their bank themselves, outside
/// the app.
/// </summary>
public class LoanService(IApplicationDbContext db, ICurrentUserService currentUser, IDateTimeProvider clock)
{
    /// <summary>Same sanity ceiling as SyncService.MaxMoneyAmount/DistributionService.MaxMoneyAmount.</summary>
    private const decimal MaxMoneyAmount = 10_000_000m;

    public async Task<LoanPaymentResponseDto> PayAsync(Guid loanId, LoanPaymentRequestDto request, CancellationToken ct = default)
    {
        var coupleId = currentUser.CoupleId ?? throw new ForbiddenAppException("You must belong to a couple to do this.");

        var loan = await db.Loans.FirstOrDefaultAsync(l => l.Id == loanId, ct);
        // Same "wrong id and not-yours look identical" shape as Vault's reveal 404 — nothing about
        // this response should tell a caller whether the id exists at all versus isn't theirs.
        if (loan is null || loan.CoupleId != coupleId || loan.IsDeleted)
        {
            throw new NotFoundAppException("Loan not found.");
        }

        // Idempotency: the client mints the payment's transaction id itself (same convention as
        // every other transaction — see TransactionPayloadDto). A double tap, a retried request,
        // or a sync retry that resends the *same* PaymentId must never double-debit — it's simply
        // handed back its already-applied result, the same idempotent-replay shape MissMe's
        // duplicate "Miss You Too" reply already uses.
        var existingPayment = await db.Transactions.FirstOrDefaultAsync(t => t.Id == request.PaymentId, ct);
        if (existingPayment is not null)
        {
            if (existingPayment.CoupleId != coupleId || existingPayment.LoanId != loan.Id || existingPayment.Type != TransactionType.LoanPayment)
            {
                throw new ValidationAppException("This payment id has already been used for a different transaction.");
            }
            return await BuildResponseAsync(loan, existingPayment.Id, ct);
        }

        if (request.Amount <= 0)
        {
            throw new ValidationAppException("Payment amount must be greater than zero.");
        }

        if (request.Amount > MaxMoneyAmount)
        {
            throw new ValidationAppException("Payment amount exceeds the maximum allowed.");
        }

        var paidSoFar = await CalculatePaidAmountAsync(loan.Id, ct);
        var remainingBalance = loan.OriginalAmount - paidSoFar;
        if (remainingBalance <= 0)
        {
            throw new ValidationAppException("This loan is already paid off.");
        }

        if (request.Amount > remainingBalance)
        {
            throw new ValidationAppException($"Payment cannot exceed the remaining balance of {remainingBalance:0.00}.");
        }

        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == request.AccountId && a.CoupleId == coupleId, ct);
        if (account is null)
        {
            throw new ValidationAppException("Account must belong to your couple.");
        }

        // Server-side balance check — never rely on the mobile preview alone (§17 of the spec).
        var accountTransactions = await db.Transactions.Where(t => t.CoupleId == coupleId && !t.IsDeleted
            && (t.AccountId == account.Id || t.DestinationAccountId == account.Id)).ToListAsync(ct);
        var accountBalance = MoneyCalculator.CalculateAccountBalance(account.OpeningBalance, account.Id, accountTransactions);
        if (request.Amount > accountBalance)
        {
            throw new ValidationAppException($"Insufficient balance. Available: {accountBalance:0.00}, required: {request.Amount:0.00}.");
        }

        var now = clock.UtcNow;
        var payment = new Transaction
        {
            Id = request.PaymentId,
            CoupleId = coupleId,
            Type = TransactionType.LoanPayment,
            Amount = request.Amount,
            Currency = loan.Currency,
            AccountId = account.Id,
            LoanId = loan.Id,
            PaidByUserId = currentUser.UserId,
            Description = request.Description ?? $"Loan payment — {loan.Name}",
            TransactionDate = request.PaymentDate ?? DateOnly.FromDateTime(now.UtcDateTime),
            Notes = request.Notes,
            CreatedByUserId = currentUser.UserId,
            CreatedAt = now,
            UpdatedAt = now,
            UpdatedByUserId = currentUser.UserId,
            Version = 1,
        };
        db.Transactions.Add(payment);

        // One SaveChangesAsync, and this is the *only* row being written — the loan's own
        // balance/status are derived (see Loan's doc comment), so there is no second write that
        // could ever half-apply. Atomic by construction, not by an explicit transaction wrapper.
        await db.SaveChangesAsync(ct);

        return await BuildResponseAsync(loan, payment.Id, ct);
    }

    private async Task<decimal> CalculatePaidAmountAsync(Guid loanId, CancellationToken ct)
    {
        var loanTransactions = await db.Transactions.Where(t => t.LoanId == loanId).ToListAsync(ct);
        return MoneyCalculator.CalculateLoanPaidAmount(loanId, loanTransactions);
    }

    private async Task<IReadOnlyList<decimal>> GetPaymentAmountsAsync(Guid loanId, CancellationToken ct) =>
        await db.Transactions.Where(t => t.LoanId == loanId && !t.IsDeleted && t.Type == TransactionType.LoanPayment)
            .Select(t => t.Amount)
            .ToListAsync(ct);

    private async Task<LoanPaymentResponseDto> BuildResponseAsync(Loan loan, Guid transactionId, CancellationToken ct)
    {
        var paymentAmounts = await GetPaymentAmountsAsync(loan.Id, ct);
        var paidAmount = paymentAmounts.Sum();
        return new LoanPaymentResponseDto { Loan = ToDto(loan, paidAmount, paymentAmounts), TransactionId = transactionId };
    }

    /// <summary>
    /// Builds every derived figure from the loan's generated schedule + its actual LoanPayment
    /// amounts, via LoanScheduleCalculator's waterfall allocation — never a naive
    /// <c>floor(paid / MonthlyPayment)</c> (see Loan's and LoanScheduleCalculator's doc comments
    /// for why that would misreport a partial payment as either incomplete-and-forgotten or
    /// silently-rounded-away).
    /// </summary>
    private static LoanDto ToDto(Loan loan, decimal paidAmount, IEnumerable<decimal> paymentAmounts)
    {
        var remainingBalance = Math.Max(0m, loan.OriginalAmount - paidAmount);
        var schedule = LoanScheduleCalculator.GenerateSchedule(loan);
        var progress = LoanScheduleCalculator.AllocatePayments(schedule, paymentAmounts);
        var installmentsPaid = progress.Count(p => p.IsFullyPaid);
        var remainingInstallments = loan.TotalInstallments - installmentsPaid;
        var next = LoanScheduleCalculator.GetNextUnpaidInstallment(progress);

        return new LoanDto
        {
            Id = loan.Id,
            Name = loan.Name,
            Provider = loan.Provider,
            OriginalAmount = loan.OriginalAmount,
            MonthlyPayment = loan.MonthlyPayment,
            TotalInstallments = loan.TotalInstallments,
            FirstDueDate = loan.FirstDueDate,
            Frequency = loan.Frequency,
            FeesAmount = loan.FeesAmount,
            Currency = loan.Currency,
            PaymentAccountId = loan.PaymentAccountId,
            OwnerUserId = loan.OwnerUserId,
            PaidAmount = paidAmount,
            RemainingBalance = remainingBalance,
            InstallmentsPaid = installmentsPaid,
            RemainingInstallments = remainingInstallments,
            NextPaymentAmount = next?.RemainingAmount,
            NextPaymentDueDate = next?.DueDate,
            Status = remainingBalance <= 0 ? LoanStatus.PaidOff : LoanStatus.Active,
        };
    }
}
