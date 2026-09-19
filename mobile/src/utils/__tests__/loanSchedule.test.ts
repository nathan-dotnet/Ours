import type { Loan, Transaction } from '../../types/entities';
import {
  allocatePaymentsToSchedule,
  generateLoanSchedule,
  getLoanDueStatus,
  getLoanProgress,
  getNextUnpaidInstallment,
  isSameMonth,
} from '../loanSchedule';

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
    created_by_user_id: 'user-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    updated_by_user_id: 'user-1',
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
    transaction_date: '2026-09-15',
    notes: null,
    paid_by_user_id: 'user-1',
    created_by_user_id: 'user-1',
    created_at: '2026-09-15T00:00:00.000Z',
    updated_at: '2026-09-15T00:00:00.000Z',
    updated_by_user_id: 'user-1',
    version: 1,
    is_deleted: 0,
    ...overrides,
  };
}

describe('generateLoanSchedule', () => {
  it('matches the spec worked example: three monthly installments', () => {
    const schedule = generateLoanSchedule(loan());

    expect(schedule).toEqual([
      { installmentNumber: 1, dueDate: '2026-09-15', scheduledAmountCents: 1_000_00 },
      { installmentNumber: 2, dueDate: '2026-10-15', scheduledAmountCents: 1_000_00 },
      { installmentNumber: 3, dueDate: '2026-11-15', scheduledAmountCents: 1_000_00 },
    ]);
  });

  it('the last installment absorbs any remainder so the schedule sums to exactly the original amount', () => {
    const schedule = generateLoanSchedule(loan({ original_amount_cents: 10_205_00, monthly_payment_cents: 1_700_00, total_installments: 6 }));

    expect(schedule[0].scheduledAmountCents).toBe(1_700_00);
    expect(schedule[5].scheduledAmountCents).toBe(1_705_00); // 10,205 - (5 * 1,700)
    expect(schedule.reduce((sum, s) => sum + s.scheduledAmountCents, 0)).toBe(10_205_00);
  });

  it('clamps to the shorter month — January 31st into February', () => {
    const schedule = generateLoanSchedule(loan({ first_due_date: '2026-01-31', total_installments: 3 }));

    expect(schedule[0].dueDate).toBe('2026-01-31');
    expect(schedule[1].dueDate).toBe('2026-02-28'); // 2026 is not a leap year
    expect(schedule[2].dueDate).toBe('2026-03-31'); // never rolls forward from February's clamp
  });

  it('respects a leap February', () => {
    const schedule = generateLoanSchedule(loan({ first_due_date: '2028-01-31', total_installments: 2 })); // 2028 is a leap year

    expect(schedule[1].dueDate).toBe('2028-02-29');
  });
});

describe('allocatePaymentsToSchedule', () => {
  it('one payment per installment marks each fully paid in order', () => {
    const schedule = generateLoanSchedule(loan());

    const afterOne = allocatePaymentsToSchedule(schedule, [1_000_00]);
    expect(afterOne[0].isFullyPaid).toBe(true);
    expect(afterOne[1].isFullyPaid).toBe(false);
    expect(getNextUnpaidInstallment(afterOne)?.installmentNumber).toBe(2);

    const afterAll = allocatePaymentsToSchedule(schedule, [1_000_00, 1_000_00, 1_000_00]);
    expect(afterAll.every((p) => p.isFullyPaid)).toBe(true);
    expect(getNextUnpaidInstallment(afterAll)).toBeNull();
  });

  it('a partial payment does not falsely complete an installment', () => {
    const schedule = generateLoanSchedule(loan());

    const progress = allocatePaymentsToSchedule(schedule, [500_00]);

    expect(progress[0].isFullyPaid).toBe(false);
    expect(progress[0].paidTowardCents).toBe(500_00);
    expect(progress[0].remainingCents).toBe(500_00);
    expect(getNextUnpaidInstallment(progress)?.remainingCents).toBe(500_00);
  });

  it('a top-up payment completes the previously partial installment', () => {
    const schedule = generateLoanSchedule(loan());

    const progress = allocatePaymentsToSchedule(schedule, [500_00, 500_00]);

    expect(progress[0].isFullyPaid).toBe(true);
    expect(progress[0].remainingCents).toBe(0);
    expect(progress[1].isFullyPaid).toBe(false);
  });

  it('an overpayment across installments credits multiple installments at once', () => {
    const schedule = generateLoanSchedule(loan());

    const progress = allocatePaymentsToSchedule(schedule, [2_500_00]); // 2 full + half of the 3rd

    expect(progress[0].isFullyPaid).toBe(true);
    expect(progress[1].isFullyPaid).toBe(true);
    expect(progress[2].isFullyPaid).toBe(false);
    expect(progress[2].paidTowardCents).toBe(500_00);
  });

  it('payment order does not matter, only the total does', () => {
    const schedule = generateLoanSchedule(loan());

    const a = allocatePaymentsToSchedule(schedule, [300_00, 1_200_00, 500_00]);
    const b = allocatePaymentsToSchedule(schedule, [2_000_00]);

    expect(a.map((p) => p.paidTowardCents)).toEqual(b.map((p) => p.paidTowardCents));
  });

  it('no payments leaves every installment unpaid', () => {
    const schedule = generateLoanSchedule(loan());

    const progress = allocatePaymentsToSchedule(schedule, []);

    expect(progress.every((p) => !p.isFullyPaid)).toBe(true);
    expect(getNextUnpaidInstallment(progress)?.installmentNumber).toBe(1);
  });
});

describe('getLoanProgress', () => {
  it('filters to only this loan\'s non-deleted LoanPayment transactions', () => {
    const l = loan();
    const transactions = [
      payment(1_000_00, { id: 'p1' }),
      payment(1_000_00, { id: 'p2', loan_id: 'loan-2' }), // a different loan
      payment(1_000_00, { id: 'p3', is_deleted: 1 }), // deleted
      payment(1_000_00, { id: 'p4', type: 'Expense' }), // not a loan payment
    ];

    const progress = getLoanProgress(l, transactions);

    expect(progress[0].isFullyPaid).toBe(true);
    expect(progress[1].isFullyPaid).toBe(false);
  });
});

describe('getLoanDueStatus', () => {
  const today = new Date(2026, 8, 15); // September 15, 2026

  it('is paid-off once every installment is fully paid', () => {
    const progress = allocatePaymentsToSchedule(generateLoanSchedule(loan()), [3_000_00]);
    expect(getLoanDueStatus(progress, today)).toBe('paid-off');
  });

  it('is due-today when the next unpaid installment is due today', () => {
    const progress = allocatePaymentsToSchedule(generateLoanSchedule(loan()), []);
    expect(getLoanDueStatus(progress, today)).toBe('due-today');
  });

  it('is upcoming when the next unpaid installment has not come due yet', () => {
    const progress = allocatePaymentsToSchedule(generateLoanSchedule(loan({ first_due_date: '2026-09-20' })), []);
    expect(getLoanDueStatus(progress, today)).toBe('upcoming');
  });

  it('is overdue when the next unpaid installment has already passed', () => {
    const progress = allocatePaymentsToSchedule(generateLoanSchedule(loan({ first_due_date: '2026-09-10' })), []);
    expect(getLoanDueStatus(progress, today)).toBe('overdue');
  });

  it('rolls forward to next month\'s installment (upcoming) once this month\'s is fully paid, even past the due date', () => {
    // Due the 10th (already passed today, the 15th) but fully paid — must not read as overdue.
    const schedule = generateLoanSchedule(loan({ first_due_date: '2026-09-10', total_installments: 3 }));
    const progress = allocatePaymentsToSchedule(schedule, [1_000_00]);
    expect(getLoanDueStatus(progress, today)).toBe('upcoming'); // installment 2 is due 2026-10-10
  });
});

describe('isSameMonth', () => {
  it('is true for a date in the same calendar month/year', () => {
    expect(isSameMonth('2026-09-15', new Date(2026, 8, 1))).toBe(true);
    expect(isSameMonth('2026-09-30', new Date(2026, 8, 1))).toBe(true);
  });

  it('is false for a different month or year', () => {
    expect(isSameMonth('2026-10-01', new Date(2026, 8, 1))).toBe(false);
    expect(isSameMonth('2025-09-15', new Date(2026, 8, 1))).toBe(false);
  });
});
