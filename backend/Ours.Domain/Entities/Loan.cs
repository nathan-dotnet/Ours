using Ours.Domain.Common;

namespace Ours.Domain.Entities;

/// <summary>
/// A couple's own liability/obligation — Shopee PayLater, TikTok PayLater, a credit card
/// installment, a personal loan, or anything else they type. Synced exactly like
/// <see cref="SavingsGoal"/>. Ours is not connected to any real bank or lender — the couple still
/// pays the real Shopee/TikTok/bank themselves, entirely outside the app; a "Pay" here only moves
/// money between the couple's own tracked <see cref="Account"/>s and records that internal fact
/// (see LoanService.PayAsync).
///
/// Deliberately has NO stored RemainingBalance, RemainingInstallments, Status, or per-installment
/// schedule row — same "derive, don't store" philosophy as Account's balance and SavingsGoal's
/// progress. <see cref="FirstDueDate"/> + <see cref="TotalInstallments"/> + <see cref="MonthlyPayment"/>
/// + <see cref="OriginalAmount"/> is enough to *generate* the fixed schedule
/// (LoanScheduleCalculator.GenerateSchedule); matching it against the loan's actual non-deleted
/// <see cref="Transaction.LoanId"/>-linked LoanPayment transactions (a waterfall allocation —
/// LoanScheduleCalculator.AllocatePayments) then derives every installment's progress, the loan's
/// overall remaining balance, and its paid-off status, all computed fresh every time. This makes
/// "the account balance decreased but the loan's balance didn't" structurally impossible — every
/// figure is read from the very same Transaction rows account balances already use, so there is
/// exactly one source of truth, not two that could ever disagree. Unlike a naive
/// <c>floor(totalPaid / MonthlyPayment)</c>, the waterfall allocation correctly leaves a partially
/// paid installment (e.g. ₱500 of a ₱1,000 installment) showing as incomplete rather than
/// silently rounding it away.
/// </summary>
public class Loan : ISyncableEntity
{
    /// <summary>Device-generated (see the mobile UUID convention) — trusted as-is on first create.</summary>
    public Guid Id { get; set; }

    public Guid CoupleId { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>Free text — "Shopee", "TikTok", a bank's name, or blank. Never a fixed list; a couple can track any obligation.</summary>
    public string? Provider { get; set; }

    /// <summary>Set once at creation, never changed by an edit afterward — same "a balance can only move by recording a transaction" discipline as Account.OpeningBalance.</summary>
    public decimal OriginalAmount { get; set; }

    /// <summary>The scheduled installment amount — what the "Pay" screen defaults to, not a cap on what can actually be paid in one go.</summary>
    public decimal MonthlyPayment { get; set; }

    public int TotalInstallments { get; set; }

    /// <summary>
    /// The date installment 1 is due — anchors the whole schedule (see
    /// LoanScheduleCalculator.GenerateSchedule), which is what a bare recurring day-of-month
    /// could never do (it can't say *which* month installment 1 falls in). Every later
    /// installment is exactly one <see cref="Frequency"/> period after the previous one, clamped
    /// to the shorter month where needed (e.g. a Jan 31 first due date's next installment lands
    /// on Feb 28/29, not March 3).
    /// </summary>
    public DateOnly FirstDueDate { get; set; }

    /// <summary>One of <see cref="LoanFrequency"/>'s constants — only "Monthly" is supported today.</summary>
    public string Frequency { get; set; } = LoanFrequency.Monthly;

    /// <summary>Optional interest/fees, for display only — never folded into OriginalAmount or the derived remaining-balance math.</summary>
    public decimal? FeesAmount { get; set; }

    public string Currency { get; set; } = "PHP";

    /// <summary>Where a payment is credited from by default — the "Pay" screen still lets the user pick a different one of the couple's accounts.</summary>
    public Guid PaymentAccountId { get; set; }

    /// <summary>
    /// Which couple member this loan belongs to — null means Joint (shared), matching
    /// <see cref="Transaction.PaidByUserId"/>'s existing "null = unspecified/shared" convention
    /// rather than a new enum. Displayed relative to the viewer ("Mine"/partner's name), never a
    /// hardcoded "You"/"Her" — the same approach the Money Calculator's Wants split already uses.
    /// </summary>
    public Guid? OwnerUserId { get; set; }

    public Guid CreatedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Guid UpdatedByUserId { get; set; }

    public int Version { get; set; } = 1;

    /// <summary>
    /// Soft-delete, same as every other entity here. Deleting a loan never touches its
    /// LoanPayment transactions — payment history is read straight from the transaction ledger
    /// (see LoanService), so a deleted loan's history survives regardless, and a paid-off loan
    /// never needs to be deleted at all to get out of the active list (see the derived remaining
    /// balance reaching zero).
    /// </summary>
    public bool IsDeleted { get; set; }
}
