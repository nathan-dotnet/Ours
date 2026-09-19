import type { Transaction } from '../../types/entities';
import { filterExpenses, getLastUsedExpenseDefaults, groupExpensesByDay } from '../spendLog';

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `tx-${Math.random()}`,
    couple_id: 'couple-1',
    type: 'Expense',
    amount_cents: 35000,
    currency: 'PHP',
    account_id: 'gcash',
    destination_account_id: null,
    category: 'Food',
    savings_goal_id: null,
    loan_id: null,
    description: null,
    transaction_date: '2026-09-11',
    notes: null,
    paid_by_user_id: 'user-alice',
    created_by_user_id: 'user-alice',
    created_at: '2026-09-11T12:00:00.000Z',
    updated_at: '2026-09-11T12:00:00.000Z',
    updated_by_user_id: 'user-alice',
    version: 1,
    is_deleted: 0,
    ...overrides,
  };
}

const today = new Date(2026, 8, 11); // September 11, 2026

describe('groupExpensesByDay', () => {
  it('groups expenses under Today/Yesterday/a full date label', () => {
    const groups = groupExpensesByDay(
      [
        tx({ id: 't1', transaction_date: '2026-09-11' }),
        tx({ id: 't2', transaction_date: '2026-09-10' }),
        tx({ id: 't3', transaction_date: '2026-09-01' }),
      ],
      today,
    );

    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Tuesday, September 1']);
  });

  it('sorts groups newest day first', () => {
    const groups = groupExpensesByDay(
      [tx({ id: 't1', transaction_date: '2026-09-01' }), tx({ id: 't2', transaction_date: '2026-09-11' })],
      today,
    );

    expect(groups.map((g) => g.dateKey)).toEqual(['2026-09-11', '2026-09-01']);
  });

  it("sums each day's total from its own expenses", () => {
    const groups = groupExpensesByDay(
      [
        tx({ id: 't1', transaction_date: '2026-09-11', amount_cents: 35000 }),
        tx({ id: 't2', transaction_date: '2026-09-11', amount_cents: 42000 }),
      ],
      today,
    );

    expect(groups[0].totalCents).toBe(77000);
    expect(groups[0].expenses).toHaveLength(2);
  });

  it('orders expenses within a day newest-created first', () => {
    const groups = groupExpensesByDay(
      [
        tx({ id: 'older', transaction_date: '2026-09-11', created_at: '2026-09-11T08:00:00.000Z' }),
        tx({ id: 'newer', transaction_date: '2026-09-11', created_at: '2026-09-11T18:00:00.000Z' }),
      ],
      today,
    );

    expect(groups[0].expenses.map((e) => e.id)).toEqual(['newer', 'older']);
  });

  it('returns nothing for an empty list', () => {
    expect(groupExpensesByDay([], today)).toEqual([]);
  });
});

describe('getLastUsedExpenseDefaults', () => {
  it('returns the most recently created expense\'s account/category', () => {
    const defaults = getLastUsedExpenseDefaults([
      tx({ id: 't1', created_at: '2026-09-10T08:00:00.000Z', category: 'Food', account_id: 'gcash' }),
      tx({ id: 't2', created_at: '2026-09-11T08:00:00.000Z', category: 'Transportation', account_id: 'bpi' }),
    ]);

    expect(defaults).toEqual({ accountId: 'bpi', category: 'Transportation' });
  });

  it('ignores non-Expense transactions and deleted ones', () => {
    const defaults = getLastUsedExpenseDefaults([
      tx({ id: 't1', created_at: '2026-09-11T08:00:00.000Z', category: 'Food', account_id: 'gcash' }),
      tx({ id: 't2', created_at: '2026-09-12T08:00:00.000Z', type: 'Income', category: 'Salary' }),
      tx({ id: 't3', created_at: '2026-09-13T08:00:00.000Z', category: 'Shopping', is_deleted: 1 }),
    ]);

    expect(defaults).toEqual({ accountId: 'gcash', category: 'Food' });
  });

  it('returns null when there is no expense history yet', () => {
    expect(getLastUsedExpenseDefaults([])).toBeNull();
  });
});

describe('filterExpenses', () => {
  const expenses = [
    tx({ id: 't1', transaction_date: '2026-09-11', category: 'Food', account_id: 'gcash', paid_by_user_id: 'user-alice' }),
    tx({ id: 't2', transaction_date: '2026-09-10', category: 'Transportation', account_id: 'bpi', paid_by_user_id: 'user-bob' }),
    tx({ id: 't3', transaction_date: '2026-08-15', category: 'Food', account_id: 'gcash', paid_by_user_id: 'user-alice' }),
    tx({ id: 't4', transaction_date: '2026-09-11', type: 'Income', category: 'Salary' }),
    tx({ id: 't5', transaction_date: '2026-09-11', category: 'Food', is_deleted: 1 }),
  ];

  it('excludes non-Expense and deleted transactions by default', () => {
    const result = filterExpenses(expenses, {});
    expect(result.map((e) => e.id).sort()).toEqual(['t1', 't2', 't3']);
  });

  it('filters by year/month', () => {
    const result = filterExpenses(expenses, { year: 2026, month: 9 });
    expect(result.map((e) => e.id).sort()).toEqual(['t1', 't2']);
  });

  it('filters by category', () => {
    const result = filterExpenses(expenses, { category: 'Food' });
    expect(result.map((e) => e.id).sort()).toEqual(['t1', 't3']);
  });

  it('filters by account', () => {
    const result = filterExpenses(expenses, { accountId: 'bpi' });
    expect(result.map((e) => e.id)).toEqual(['t2']);
  });

  it('filters by paid-by', () => {
    const result = filterExpenses(expenses, { paidByUserId: 'user-bob' });
    expect(result.map((e) => e.id)).toEqual(['t2']);
  });

  it('combines multiple filters', () => {
    const result = filterExpenses(expenses, { year: 2026, month: 9, category: 'Food' });
    expect(result.map((e) => e.id)).toEqual(['t1']);
  });
});
