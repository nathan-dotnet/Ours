import type { Account, Transaction } from '../../types/entities';
import {
  calculateAccountBalance,
  calculateBudgetRemaining,
  calculateCategorySpending,
  calculateLoanPaidAmount,
  calculateLoanRemainingBalance,
  calculateMonthlySpending,
  calculateSavingsGoalBalance,
  calculateTotalBalance,
} from '../moneyCalculations';

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx-1',
    couple_id: 'couple-1',
    type: 'Expense',
    amount_cents: 0,
    currency: 'PHP',
    account_id: 'account-1',
    destination_account_id: null,
    category: 'Food',
    savings_goal_id: null,
    loan_id: null,
    description: null,
    transaction_date: '2026-09-01',
    notes: null,
    paid_by_user_id: null,
    created_by_user_id: 'user-1',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    updated_by_user_id: 'user-1',
    version: 1,
    is_deleted: 0,
    ...overrides,
  };
}

function account(overrides: Partial<Account>): Account {
  return {
    id: 'account-1',
    couple_id: 'couple-1',
    name: 'BPI',
    type: 'Bank',
    icon: 'bpi',
    opening_balance_cents: 0,
    currency: 'PHP',
    is_active: 1,
    created_by_user_id: 'user-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    updated_by_user_id: 'user-1',
    version: 1,
    is_deleted: 0,
    ...overrides,
  };
}

describe('calculateAccountBalance', () => {
  it('expense decreases the balance', () => {
    const balance = calculateAccountBalance(1_000_000, 'account-1', [tx({ type: 'Expense', amount_cents: 50_000, account_id: 'account-1' })]);
    expect(balance).toBe(950_000);
  });

  it('income increases the balance', () => {
    const balance = calculateAccountBalance(950_000, 'account-1', [tx({ type: 'Income', amount_cents: 2_000_000, account_id: 'account-1' })]);
    expect(balance).toBe(2_950_000);
  });

  it('a transfer moves money between the two accounts it touches', () => {
    const transactions = [tx({ type: 'Transfer', amount_cents: 200_000, account_id: 'bpi', destination_account_id: 'cash' })];
    expect(calculateAccountBalance(1_000_000, 'bpi', transactions)).toBe(800_000);
    expect(calculateAccountBalance(500_000, 'cash', transactions)).toBe(700_000);
  });

  it('excludes deleted transactions', () => {
    const balance = calculateAccountBalance(1_000_000, 'account-1', [tx({ type: 'Expense', amount_cents: 50_000, is_deleted: 1 })]);
    expect(balance).toBe(1_000_000);
  });

  it('deleting an expense restores the amount — recomputed, not explicitly reversed', () => {
    const expense = tx({ type: 'Expense', amount_cents: 50_000, account_id: 'account-1' });
    expect(calculateAccountBalance(1_000_000, 'account-1', [expense])).toBe(950_000);
    expense.is_deleted = 1;
    expect(calculateAccountBalance(1_000_000, 'account-1', [expense])).toBe(1_000_000);
  });

  it('editing an expense to a different account moves the effect', () => {
    const expense = tx({ type: 'Expense', amount_cents: 50_000, account_id: 'bpi' });
    expect(calculateAccountBalance(1_000_000, 'bpi', [expense])).toBe(950_000);
    expense.account_id = 'gcash'; // simulates the edit
    expect(calculateAccountBalance(1_000_000, 'bpi', [expense])).toBe(1_000_000);
    expect(calculateAccountBalance(500_000, 'gcash', [expense])).toBe(450_000);
  });
});

describe('calculateAccountBalance — savings movements', () => {
  it('a savings contribution decreases the source account, like an expense', () => {
    const balance = calculateAccountBalance(1_000_000, 'account-1', [
      tx({ type: 'SavingsContribution', amount_cents: 300_000, account_id: 'account-1', category: null, savings_goal_id: 'goal-1' }),
    ]);
    expect(balance).toBe(700_000);
  });

  it('a savings withdrawal increases the account, like income', () => {
    const balance = calculateAccountBalance(700_000, 'account-1', [
      tx({ type: 'SavingsWithdrawal', amount_cents: 100_000, account_id: 'account-1', category: null, savings_goal_id: 'goal-1' }),
    ]);
    expect(balance).toBe(800_000);
  });
});

describe('calculateMonthlySpending — savings movements', () => {
  it('never counts a savings contribution or withdrawal as spending', () => {
    const transactions = [
      tx({ type: 'SavingsContribution', amount_cents: 500_000, category: null, savings_goal_id: 'goal-1' }),
      tx({ type: 'SavingsWithdrawal', amount_cents: 100_000, category: null, savings_goal_id: 'goal-1' }),
    ];
    expect(calculateMonthlySpending(transactions, 2026, 9)).toBe(0);
  });
});

describe('calculateAccountBalance / calculateMonthlySpending — income allocation (Distribute Money)', () => {
  it('an income allocation increases the destination account, like income', () => {
    const balance = calculateAccountBalance(0, 'account-1', [tx({ type: 'IncomeAllocation', amount_cents: 2_500_000, category: null })]);
    expect(balance).toBe(2_500_000);
  });

  it('never counts an income allocation as spending', () => {
    expect(calculateMonthlySpending([tx({ type: 'IncomeAllocation', amount_cents: 2_500_000, category: null })], 2026, 9)).toBe(0);
  });
});

describe('calculateSavingsGoalBalance', () => {
  it('sums contributions minus withdrawals for that goal only', () => {
    const transactions = [
      tx({ type: 'SavingsContribution', amount_cents: 500_000, category: null, savings_goal_id: 'goal-1' }),
      tx({ type: 'SavingsContribution', amount_cents: 300_000, category: null, savings_goal_id: 'goal-1' }),
      tx({ type: 'SavingsWithdrawal', amount_cents: 100_000, category: null, savings_goal_id: 'goal-1' }),
      tx({ type: 'SavingsContribution', amount_cents: 999_900, category: null, savings_goal_id: 'goal-2' }), // a different goal — must not leak in
    ];
    expect(calculateSavingsGoalBalance('goal-1', transactions)).toBe(700_000);
  });

  it('excludes deleted contributions', () => {
    const transactions = [tx({ type: 'SavingsContribution', amount_cents: 500_000, category: null, savings_goal_id: 'goal-1', is_deleted: 1 })];
    expect(calculateSavingsGoalBalance('goal-1', transactions)).toBe(0);
  });
});

describe('calculateTotalBalance', () => {
  it('a transfer does not change the total', () => {
    const bpi = account({ id: 'bpi', opening_balance_cents: 1_000_000 });
    const cash = account({ id: 'cash', opening_balance_cents: 500_000 });
    const transactions = [tx({ type: 'Transfer', amount_cents: 200_000, account_id: 'bpi', destination_account_id: 'cash' })];

    expect(calculateTotalBalance([bpi, cash], transactions)).toBe(1_500_000);
  });

  it('excludes inactive and deleted accounts', () => {
    const active = account({ id: 'a', opening_balance_cents: 100_000, is_active: 1 });
    const inactive = account({ id: 'b', opening_balance_cents: 100_000, is_active: 0 });
    const deleted = account({ id: 'c', opening_balance_cents: 100_000, is_active: 1, is_deleted: 1 });

    expect(calculateTotalBalance([active, inactive, deleted], [])).toBe(100_000);
  });

  it('the four-account example from the spec: BPI + GCash + MariBank + Cash = 28,500', () => {
    const accounts = [
      account({ id: 'bpi', opening_balance_cents: 1_000_000 }),
      account({ id: 'gcash', opening_balance_cents: 550_000 }),
      account({ id: 'maribank', opening_balance_cents: 800_000 }),
      account({ id: 'cash', opening_balance_cents: 500_000 }),
    ];
    expect(calculateTotalBalance(accounts, [])).toBe(2_850_000);
  });
});

describe('calculateMonthlySpending', () => {
  it('counts only expenses, never income or transfers', () => {
    const transactions = [
      tx({ type: 'Expense', amount_cents: 50_000 }),
      tx({ type: 'Income', amount_cents: 2_000_000 }),
      tx({ type: 'Transfer', amount_cents: 200_000, destination_account_id: 'cash' }),
    ];
    expect(calculateMonthlySpending(transactions, 2026, 9)).toBe(50_000);
  });

  it('excludes other months and deleted transactions, and uses transaction_date not created_at', () => {
    const transactions = [
      tx({ type: 'Expense', amount_cents: 10_000, transaction_date: '2026-08-31', created_at: '2026-09-03T00:00:00.000Z' }),
      tx({ type: 'Expense', amount_cents: 20_000, is_deleted: 1 }),
    ];
    expect(calculateMonthlySpending(transactions, 2026, 9)).toBe(0);
  });
});

describe('calculateCategorySpending', () => {
  it('groups by category, expense only', () => {
    const transactions = [
      tx({ type: 'Expense', amount_cents: 250_000, category: 'Food' }),
      tx({ type: 'Expense', amount_cents: 100_000, category: 'Food' }),
      tx({ type: 'Expense', amount_cents: 300_000, category: 'Bills' }),
      tx({ type: 'Income', amount_cents: 2_000_000, category: 'Salary' }),
    ];

    const byCategory = calculateCategorySpending(transactions, 2026, 9);

    expect(byCategory.Food).toBe(350_000);
    expect(byCategory.Bills).toBe(300_000);
    expect(byCategory.Salary).toBeUndefined();
  });
});

describe('calculateBudgetRemaining', () => {
  it('can go negative when over budget', () => {
    expect(calculateBudgetRemaining(500_000, 550_000)).toBe(-50_000);
  });

  it('is positive when under budget', () => {
    expect(calculateBudgetRemaining(500_000, 100_000)).toBe(400_000);
  });
});

describe('calculateAccountBalance — LoanPayment', () => {
  it('debits the account, same direction as an Expense', () => {
    const transactions = [tx({ type: 'LoanPayment', amount_cents: 1_700_00, loan_id: 'loan-1' })];
    expect(calculateAccountBalance(1_000_000, 'account-1', transactions)).toBe(1_000_000 - 1_700_00);
  });

  it('is excluded from monthly spending, same as SavingsContribution', () => {
    const transactions = [tx({ type: 'LoanPayment', amount_cents: 1_700_00, loan_id: 'loan-1' })];
    expect(calculateMonthlySpending(transactions, 2026, 9)).toBe(0);
  });
});

describe('calculateLoanPaidAmount', () => {
  it('sums every non-deleted LoanPayment linked to the loan', () => {
    const transactions = [
      tx({ type: 'LoanPayment', amount_cents: 1_700_00, loan_id: 'loan-1', id: 'p1' }),
      tx({ type: 'LoanPayment', amount_cents: 1_700_00, loan_id: 'loan-1', id: 'p2' }),
      tx({ type: 'LoanPayment', amount_cents: 1_000_00, loan_id: 'loan-2', id: 'p3' }), // a different loan
      tx({ type: 'LoanPayment', amount_cents: 999_00, loan_id: 'loan-1', id: 'p4', is_deleted: 1 }), // deleted
    ];
    expect(calculateLoanPaidAmount('loan-1', transactions)).toBe(3_400_00);
  });

  it('is zero when nothing has been paid yet', () => {
    expect(calculateLoanPaidAmount('loan-1', [])).toBe(0);
  });
});

describe('calculateLoanRemainingBalance', () => {
  it('matches the spec worked example: 10,200 original, 1,700 paid -> 8,500 remaining', () => {
    expect(calculateLoanRemainingBalance(10_200_00, 1_700_00)).toBe(8_500_00);
  });

  it('never goes negative', () => {
    expect(calculateLoanRemainingBalance(1_000_00, 1_500_00)).toBe(0);
  });
});

// Per-installment schedule/progress/due-status tests (generateLoanSchedule, getLoanProgress,
// getLoanDueStatus) now live in utils/__tests__/loanSchedule.test.ts — they need a loan's full
// schedule (anchored by first_due_date), not just these two account/loan balance primitives.

describe('precision', () => {
  it('100.10 + 0.20 is exactly 100.30 (integer cents, never float)', () => {
    const transactions = [tx({ type: 'Income', amount_cents: 10_010 }), tx({ type: 'Income', amount_cents: 20, id: 'tx-2' })];
    expect(calculateAccountBalance(0, 'account-1', transactions)).toBe(10_030);
  });

  it('1999.99 + 0.01 is exactly 2000.00', () => {
    const transactions = [tx({ type: 'Income', amount_cents: 199_999 }), tx({ type: 'Income', amount_cents: 1, id: 'tx-2' })];
    expect(calculateAccountBalance(0, 'account-1', transactions)).toBe(200_000);
  });
});
