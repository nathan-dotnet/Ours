import type { Loan, Transaction } from '../types/entities';
import { fromLocalDateString } from './date';
import { getLoanProgress, getNextUnpaidInstallment } from './loanSchedule';

/**
 * Plans due-date reminders for a couple's loans — pure data, no `expo-notifications` import
 * (that side effect lives in services/loanReminders.ts) so this stays fully unit-testable. See
 * the Loans due-date reminder spec: 3 days before, 1 day before, on the due date, and the day
 * after (overdue), each identified by a stable `LoanId + ScheduledDate + ReminderType` key so
 * scheduling the same one twice is naturally idempotent (see services/loanReminders.ts's
 * "schedule with this identifier replaces any pending one with the same id").
 */

export type LoanReminderType = '3-day' | '1-day' | 'due-today' | 'overdue';

export interface PlannedLoanReminder {
  /** Stable across calls for the same loan+installment+type — see the module doc comment. */
  identifier: string;
  loanId: string;
  triggerAt: Date;
  title: string;
  body: string;
  data: { kind: 'loan-reminder'; loanId: string };
}

const REMINDER_OFFSETS_DAYS: Record<LoanReminderType, number> = {
  '3-day': -3,
  '1-day': -1,
  'due-today': 0,
  overdue: 1,
};

const REMINDER_HOUR = 9; // 9am local — a reasonable, unsurprising time to be reminded about money.

function reminderTriggerAt(dueDate: Date, type: LoanReminderType): Date {
  const trigger = new Date(dueDate);
  trigger.setDate(trigger.getDate() + REMINDER_OFFSETS_DAYS[type]);
  trigger.setHours(REMINDER_HOUR, 0, 0, 0);
  return trigger;
}

function reminderContent(loan: Loan, type: LoanReminderType, remainingAmountText: string, dueDateText: string): { title: string; body: string } {
  switch (type) {
    case '3-day':
      return { title: '🔔 Loan payment coming up', body: `${loan.name} — ${remainingAmountText} due in 3 days` };
    case '1-day':
      return { title: '🔔 Loan payment tomorrow', body: `${loan.name} — ${remainingAmountText} due tomorrow` };
    case 'due-today':
      return { title: '🔔 Loan payment due today', body: `${loan.name} — ${remainingAmountText} due today` };
    case 'overdue':
      return { title: '⚠️ Loan payment overdue', body: `${loan.name} — ${remainingAmountText} was due ${dueDateText}` };
  }
}

/**
 * For every loan owned by `currentUserId` or Joint (see Loan.owner_user_id — a personal loan
 * never reminds the partner), reminds only about the *next* not-yet-fully-paid installment (see
 * utils/loanSchedule.ts's getNextUnpaidInstallment — a partial payment still reminds, just for
 * the remaining amount, never the original one) — never every future installment at once (a
 * 24-month loan would otherwise queue up dozens of reminders for months that haven't arrived
 * yet). "Then the next reminder is automatically associated with October 15" (once September's
 * installment is settled) falls out of this naturally, since the next call simply resolves to a
 * later installment.
 *
 * Only reminders whose ideal trigger is still in the future are returned — one whose moment has
 * already passed (e.g. the app wasn't opened for a week) is skipped rather than fired
 * retroactively; the loan still shows its correct overdue/due-today/upcoming status in the UI
 * regardless (see getLoanDueStatus), independent of whether a push ever fired for it.
 */
export function planLoanReminders(loans: Loan[], transactions: Transaction[], currentUserId: string, now: Date = new Date()): PlannedLoanReminder[] {
  const reminders: PlannedLoanReminder[] = [];

  for (const loan of loans) {
    if (loan.is_deleted) continue;
    if (loan.owner_user_id !== null && loan.owner_user_id !== currentUserId) continue; // someone else's personal loan

    const next = getNextUnpaidInstallment(getLoanProgress(loan, transactions));
    if (!next) continue; // paid off — nothing left to remind about

    const dueDate = fromLocalDateString(next.dueDate);
    const remainingAmountText = formatPesos(next.remainingCents, loan.currency);
    const dueDateText = shortDate(dueDate);

    for (const type of Object.keys(REMINDER_OFFSETS_DAYS) as LoanReminderType[]) {
      const triggerAt = reminderTriggerAt(dueDate, type);
      if (triggerAt <= now) continue;

      const { title, body } = reminderContent(loan, type, remainingAmountText, dueDateText);
      reminders.push({
        identifier: `loan-reminder:${loan.id}:${next.dueDate}:${type}`,
        loanId: loan.id,
        triggerAt,
        title,
        body,
        data: { kind: 'loan-reminder', loanId: loan.id },
      });
    }
  }

  return reminders;
}

/** Local, minimal money formatter — a notification body has no access to the app's currency-symbol table (utils/money.ts), so this covers the one case (PHP) this app actually uses today. */
function formatPesos(amountCents: number, currency: string): string {
  const amount = (amountCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === 'PHP' ? `₱${amount}` : `${currency} ${amount}`;
}

const shortDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' });
function shortDate(date: Date): string {
  return shortDateFormatter.format(date);
}
