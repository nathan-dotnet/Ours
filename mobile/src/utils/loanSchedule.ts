import type { Loan, Transaction } from '../types/entities';
import { fromLocalDateString, toLocalDateString } from './date';

/**
 * A loan's fixed repayment schedule + per-installment progress — the mobile mirror of the
 * backend's LoanScheduleCalculator (Ours.Application/Services). Every consumer (LoansTab,
 * LoanCard, the loan detail screen, loan reminders) reads through these functions instead of
 * computing its own arithmetic, so there's exactly one schedule implementation to keep correct —
 * see Loan's own doc comment (types/entities.ts) for why nothing here is ever a stored column.
 */

export interface ScheduledInstallment {
  installmentNumber: number;
  /** ISO "YYYY-MM-DD". */
  dueDate: string;
  scheduledAmountCents: number;
}

export interface InstallmentProgress extends ScheduledInstallment {
  paidTowardCents: number;
  remainingCents: number;
  isFullyPaid: boolean;
}

export type LoanDueStatus = 'paid-off' | 'overdue' | 'due-today' | 'upcoming';

/**
 * Mirrors DateOnly/DateTime.AddMonths' documented clamping: if the day doesn't exist in the
 * target month, it clamps to that month's last day (e.g. Jan 31 + 1 month = Feb 28/29) rather
 * than overflowing into the month after.
 */
function addMonthsClamped(date: Date, months: number): Date {
  const day = date.getDate();
  const targetIndex = date.getMonth() + months;
  const year = date.getFullYear() + Math.floor(targetIndex / 12);
  const month = ((targetIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDayOfTargetMonth));
}

/**
 * Builds the fixed N-installment schedule: each installment lands one month after the previous
 * one (only "Monthly" exists today — see Loan.frequency), clamped to the shorter month where
 * needed. Every installment but the last is exactly loan.monthly_payment_cents; the last absorbs
 * whatever remainder is needed so the schedule always sums to exactly
 * loan.original_amount_cents — the same "last share absorbs the remainder" technique used
 * throughout this app's money math (see utils/allocationCalculations.ts's splitExactly).
 */
export function generateLoanSchedule(loan: Loan): ScheduledInstallment[] {
  const firstDueDate = fromLocalDateString(loan.first_due_date);
  const installments: ScheduledInstallment[] = [];
  let runningTotal = 0;
  for (let i = 0; i < loan.total_installments; i++) {
    const dueDate = i === 0 ? firstDueDate : addMonthsClamped(firstDueDate, i);
    const isLast = i === loan.total_installments - 1;
    const amountCents = isLast ? loan.original_amount_cents - runningTotal : loan.monthly_payment_cents;
    installments.push({ installmentNumber: i + 1, dueDate: toLocalDateString(dueDate), scheduledAmountCents: amountCents });
    runningTotal += amountCents;
  }
  return installments;
}

/**
 * Waterfall allocation: pools every payment amount together (money is fungible — which specific
 * payment covered which specific installment isn't a meaningful question, only the running total
 * is), then walks the schedule in order, draining the pool into each installment's
 * scheduledAmountCents before spilling into the next. This is what makes a partial payment (₱500
 * of a ₱1,000 installment) show as incomplete rather than being silently rounded away by a naive
 * `floor(totalPaid / monthlyPayment)` — and what makes a later top-up payment correctly complete
 * that same installment instead of starting a new one.
 */
export function allocatePaymentsToSchedule(schedule: ScheduledInstallment[], paymentAmountsCents: number[]): InstallmentProgress[] {
  let pool = paymentAmountsCents.reduce((sum, amount) => sum + amount, 0);
  return schedule.map((installment) => {
    const paidTowardCents = Math.max(0, Math.min(pool, installment.scheduledAmountCents));
    pool -= paidTowardCents;
    const remainingCents = installment.scheduledAmountCents - paidTowardCents;
    return { ...installment, paidTowardCents, remainingCents, isFullyPaid: remainingCents <= 0 };
  });
}

/** Convenience: generates the schedule and allocates this loan's own LoanPayment transactions against it, in one call. */
export function getLoanProgress(loan: Loan, transactions: Transaction[]): InstallmentProgress[] {
  const schedule = generateLoanSchedule(loan);
  const paymentAmounts = transactions
    .filter((t) => !t.is_deleted && t.type === 'LoanPayment' && t.loan_id === loan.id)
    .map((t) => t.amount_cents);
  return allocatePaymentsToSchedule(schedule, paymentAmounts);
}

/** The first not-fully-paid installment, in schedule order — what the "Pay" screen defaults its amount/due-date display to. Null once every installment is fully paid. */
export function getNextUnpaidInstallment(progress: InstallmentProgress[]): InstallmentProgress | null {
  return progress.find((p) => !p.isFullyPaid) ?? null;
}

/**
 * Where a loan stands relative to its very next unpaid installment. Once an installment is fully
 * paid, `getNextUnpaidInstallment` moves on to the next one automatically (see its own doc
 * comment), so there is no separate "paid, but check back next month" state to track here — the
 * next installment's own due date already reads as "upcoming" the moment the current one is
 * settled.
 */
export function getLoanDueStatus(progress: InstallmentProgress[], today: Date = new Date()): LoanDueStatus {
  const next = getNextUnpaidInstallment(progress);
  if (!next) return 'paid-off';

  const todayStr = toLocalDateString(today);
  if (next.dueDate < todayStr) return 'overdue';
  if (next.dueDate === todayStr) return 'due-today';
  return 'upcoming';
}

/** True when `dateStr` (ISO "YYYY-MM-DD") falls in the same calendar month/year as `today` — used for "Due This Month" dashboard aggregates. */
export function isSameMonth(dateStr: string, today: Date): boolean {
  const prefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-`;
  return dateStr.startsWith(prefix);
}
