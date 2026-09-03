import type { Expense } from '../../types/entities';
import { groupExpensesByDay } from '../expenseGrouping';

function makeExpense(id: string, expenseDate: string, overrides: Partial<Expense> = {}): Expense {
  return {
    id,
    couple_id: 'couple-1',
    amount_cents: 1000,
    currency: 'PHP',
    description: id,
    category: 'Food',
    expense_date: expenseDate,
    notes: null,
    paid_by_user_id: null,
    created_by_user_id: 'user-1',
    created_at: `${expenseDate}T00:00:00.000Z`,
    updated_at: `${expenseDate}T00:00:00.000Z`,
    updated_by_user_id: 'user-1',
    version: 1,
    is_deleted: 0,
    ...overrides,
  };
}

describe('groupExpensesByDay', () => {
  const today = new Date(2026, 8, 15); // September 15, 2026

  it('labels today and yesterday distinctly from other days', () => {
    const expenses = [makeExpense('today', '2026-09-15'), makeExpense('yesterday', '2026-09-14'), makeExpense('older', '2026-09-10')];

    const groups = groupExpensesByDay(expenses, today);

    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', expect.stringContaining('September 10')]);
  });

  it('groups multiple same-day expenses together, preserving input order within the group', () => {
    const expenses = [makeExpense('a', '2026-09-15'), makeExpense('b', '2026-09-15')];

    const groups = groupExpensesByDay(expenses, today);

    expect(groups).toHaveLength(1);
    expect(groups[0].expenses.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('returns an empty array for no expenses', () => {
    expect(groupExpensesByDay([], today)).toEqual([]);
  });

  it('never shifts the day due to timezone conversion — expense_date is used as-is', () => {
    const groups = groupExpensesByDay([makeExpense('a', '2026-09-15')], today);
    expect(groups[0].label).toBe('Today');
  });
});
