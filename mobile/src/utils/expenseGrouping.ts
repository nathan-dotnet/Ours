import type { Expense } from '../types/entities';
import { toLocalDateString } from './date';

export interface ExpenseGroup {
  label: string;
  expenses: Expense[];
}

function formatDayLabel(dateString: string, today: Date): string {
  const todayString = toLocalDateString(today);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (dateString === todayString) return 'Today';
  if (dateString === toLocalDateString(yesterday)) return 'Yesterday';

  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

/**
 * Groups expenses into day buckets ("Today", "Yesterday", "Friday, June 5", ...) — mirrors
 * calendarGrouping.groupEventsByDay's labeling, but keyed directly off `expense_date` (already a
 * bare YYYY-MM-DD, not a datetime), so there's no timezone conversion involved at all here.
 * Expects `expenses` already sorted newest-first (see expenseRepository.getForMonth).
 */
export function groupExpensesByDay(expenses: Expense[], today: Date = new Date()): ExpenseGroup[] {
  const groups: ExpenseGroup[] = [];
  const indexByDate = new Map<string, number>();

  for (const expense of expenses) {
    let index = indexByDate.get(expense.expense_date);
    if (index === undefined) {
      index = groups.length;
      indexByDate.set(expense.expense_date, index);
      groups.push({ label: formatDayLabel(expense.expense_date, today), expenses: [] });
    }
    groups[index].expenses.push(expense);
  }

  return groups;
}
