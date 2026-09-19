import type { Loan, Transaction } from '../../types/entities';
import { planLoanReminders } from '../loanReminders';

function loan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: 'loan-1',
    couple_id: 'couple-1',
    name: 'Shopee PayLater',
    provider: 'Shopee',
    original_amount_cents: 3_000_00,
    monthly_payment_cents: 1_000_00,
    total_installments: 3,
    first_due_date: '2026-09-15',
    frequency: 'Monthly',
    fees_amount_cents: null,
    currency: 'PHP',
    payment_account_id: 'account-1',
    owner_user_id: null,
    created_by_user_id: 'user-alice',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    updated_by_user_id: 'user-alice',
    version: 1,
    is_deleted: 0,
    ...overrides,
  };
}

function payment(amountCents: number, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `tx-${Math.random()}`,
    couple_id: 'couple-1',
    type: 'LoanPayment',
    amount_cents: amountCents,
    currency: 'PHP',
    account_id: 'account-1',
    destination_account_id: null,
    category: null,
    savings_goal_id: null,
    loan_id: 'loan-1',
    description: null,
    transaction_date: '2026-09-01',
    notes: null,
    paid_by_user_id: 'user-alice',
    created_by_user_id: 'user-alice',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    updated_by_user_id: 'user-alice',
    version: 1,
    is_deleted: 0,
    ...overrides,
  };
}

const ALICE = 'user-alice';
const today = new Date(2026, 8, 1, 12, 0, 0); // September 1, 2026, noon — well before the Sep 15 due date

describe('planLoanReminders', () => {
  it('plans all 4 reminder types for an unpaid installment, each with a stable identifier', () => {
    const reminders = planLoanReminders([loan()], [], ALICE, today);

    const types = reminders.filter((r) => r.loanId === 'loan-1').map((r) => r.identifier);
    expect(types).toEqual([
      'loan-reminder:loan-1:2026-09-15:3-day',
      'loan-reminder:loan-1:2026-09-15:1-day',
      'loan-reminder:loan-1:2026-09-15:due-today',
      'loan-reminder:loan-1:2026-09-15:overdue',
    ]);
  });

  it('the same loan/schedule/today always plans the exact same identifiers — idempotency by construction', () => {
    const first = planLoanReminders([loan()], [], ALICE, today);
    const second = planLoanReminders([loan()], [], ALICE, today);

    expect(first.map((r) => r.identifier)).toEqual(second.map((r) => r.identifier));
  });

  it('schedules the 3-day reminder exactly 3 days before the due date, at 9am', () => {
    const reminders = planLoanReminders([loan()], [], ALICE, today);
    const threeDay = reminders.find((r) => r.identifier.endsWith(':3-day'))!;

    expect(threeDay.triggerAt.getFullYear()).toBe(2026);
    expect(threeDay.triggerAt.getMonth()).toBe(8); // September
    expect(threeDay.triggerAt.getDate()).toBe(12);
    expect(threeDay.triggerAt.getHours()).toBe(9);
  });

  it('includes the loan name and remaining amount in the notification body', () => {
    const reminders = planLoanReminders([loan()], [], ALICE, today);
    const dueToday = reminders.find((r) => r.identifier.endsWith(':due-today'))!;

    expect(dueToday.title).toContain('due today');
    expect(dueToday.body).toContain('Shopee PayLater');
    expect(dueToday.body).toContain('₱1,000.00');
  });

  it('sets data.kind/loanId so a tap can navigate to the right loan', () => {
    const reminders = planLoanReminders([loan()], [], ALICE, today);
    expect(reminders[0].data).toEqual({ kind: 'loan-reminder', loanId: 'loan-1' });
  });

  it('moves on to the next installment once the current one is fully paid', () => {
    const reminders = planLoanReminders([loan()], [payment(1_000_00)], ALICE, today);

    // Installment 1 (Sep 15) is fully paid — reminders now track installment 2 (Oct 15) instead.
    expect(reminders.every((r) => r.identifier.includes('2026-10-15'))).toBe(true);
    expect(reminders.some((r) => r.identifier.includes('2026-09-15'))).toBe(false);
  });

  it('only ever plans reminders for the next unpaid installment, never every future one at once', () => {
    const reminders = planLoanReminders([loan()], [], ALICE, today);

    expect(reminders).toHaveLength(4); // exactly the 4 reminder types for installment 1
    expect(reminders.some((r) => r.identifier.includes('2026-10-15'))).toBe(false);
    expect(reminders.some((r) => r.identifier.includes('2026-11-15'))).toBe(false);
  });

  it('still reminds for the remaining amount after a partial payment, not the original one', () => {
    const reminders = planLoanReminders([loan()], [payment(400_00)], ALICE, today);
    const dueToday = reminders.find((r) => r.identifier.endsWith('2026-09-15:due-today'))!;

    expect(dueToday.body).toContain('₱600.00'); // 1,000 - 400
  });

  it('plans no further reminders once the loan is fully paid off', () => {
    const reminders = planLoanReminders([loan()], [payment(3_000_00)], ALICE, today);
    expect(reminders).toHaveLength(0);
  });

  it('plans reminders for a Joint loan regardless of which partner is asking', () => {
    const jointLoan = loan({ owner_user_id: null });
    const forAlice = planLoanReminders([jointLoan], [], 'user-alice', today);
    const forBob = planLoanReminders([jointLoan], [], 'user-bob', today);

    expect(forAlice.length).toBeGreaterThan(0);
    expect(forBob.length).toBeGreaterThan(0);
  });

  it("never plans reminders for someone else's personal loan", () => {
    const alicesLoan = loan({ owner_user_id: 'user-alice' });

    expect(planLoanReminders([alicesLoan], [], 'user-alice', today).length).toBeGreaterThan(0);
    expect(planLoanReminders([alicesLoan], [], 'user-bob', today)).toHaveLength(0);
  });

  it('skips a reminder whose ideal trigger has already passed, rather than firing it retroactively', () => {
    // Opened the app long after every reminder for the still-unpaid Sep 15 installment would have
    // fired (3-day/1-day/due-today/overdue are all in the past by Sep 30) — nothing retroactive is
    // planned. The loan still reads as "Overdue" in the UI regardless (see getLoanDueStatus),
    // independent of whether a push ever fired for it.
    const lateOpen = new Date(2026, 8, 30);
    const reminders = planLoanReminders([loan()], [], ALICE, lateOpen);

    expect(reminders).toHaveLength(0);
  });

  it('once the overdue installment is finally paid, reminders resume for the next one', () => {
    const lateOpen = new Date(2026, 8, 30);
    const reminders = planLoanReminders([loan()], [payment(1_000_00, { transaction_date: '2026-09-30' })], ALICE, lateOpen);

    // Installment 2 (Oct 15) still has every reminder ahead of it from this vantage point.
    expect(reminders.every((r) => r.identifier.includes('2026-10-15'))).toBe(true);
    expect(reminders.length).toBeGreaterThan(0);
  });

  it('ignores a soft-deleted loan', () => {
    const reminders = planLoanReminders([loan({ is_deleted: 1 })], [], ALICE, today);
    expect(reminders).toHaveLength(0);
  });
});
