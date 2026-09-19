import type { Transaction } from '../types/entities';
import { fromLocalDateString, toLocalDateString } from './date';
import { matchesMonth } from './moneyCalculations';

/**
 * Pure helpers for Budget's spending list (day-grouping, last-used Quick Log defaults, filtering)
 * — originally written for a standalone "Spend Log" tab, now merged into Budget itself (see
 * BudgetTab.tsx; Money is exactly Budget/Savings/Calculator/Loans, see MoneyTabs.tsx). Nothing
 * here reads or writes SQLite directly; it all works on the same `Transaction[]` every other
 * Money screen already fetches via useTransactionsForCouple. An "expense" is simply a Transaction
 * with `type === 'Expense'` — no separate entity, no separate balance/spending calculation (see
 * moneyCalculations.ts's calculateMonthlySpending/calculateCategorySpending, which Budget already
 * uses and which a Quick-Log-created expense flows into automatically).
 */

export interface ExpenseDayGroup {
  /** "Today" / "Yesterday" / a full date — see calendarGrouping.ts's groupEventsByDay, the same pattern applied to transaction_date instead of a calendar event's start_at. */
  label: string;
  /** ISO "YYYY-MM-DD" — stable identity for list keys, independent of the display label. */
  dateKey: string;
  expenses: Transaction[];
  totalCents: number;
}

function formatDayLabel(dateKey: string, todayKey: string, yesterdayKey: string): string {
  if (dateKey === todayKey) return 'Today';
  if (dateKey === yesterdayKey) return 'Yesterday';
  return fromLocalDateString(dateKey).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** Groups already-filtered Expense transactions into day buckets, newest first, each with its own running total — see the Spend Log spec's "Today / ₱1,620" per-day summary. */
export function groupExpensesByDay(expenses: Transaction[], now: Date = new Date()): ExpenseDayGroup[] {
  const groups = new Map<string, Transaction[]>();
  for (const expense of expenses) {
    const existing = groups.get(expense.transaction_date);
    if (existing) {
      existing.push(expense);
    } else {
      groups.set(expense.transaction_date, [expense]);
    }
  }

  const todayKey = toLocalDateString(now);
  const yesterdayKey = toLocalDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));

  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a)) // newest day first
    .map(([dateKey, dayExpenses]) => ({
      label: formatDayLabel(dateKey, todayKey, yesterdayKey),
      dateKey,
      expenses: dayExpenses.sort((a, b) => b.created_at.localeCompare(a.created_at)),
      totalCents: dayExpenses.reduce((sum, e) => sum + e.amount_cents, 0),
    }));
}

export interface LastUsedExpenseDefaults {
  accountId: string;
  category: string;
}

/**
 * Quick Log's smart defaults — derived from the most recently logged Expense transaction
 * (by created_at), never a separately stored "last used" preference (see the Spend Log spec's
 * own "don't add unnecessary persistent infrastructure just for this"). Null when there's no
 * expense history yet, or the most recent one has no category (shouldn't normally happen, but
 * Quick Log/Detailed Expense both always set one).
 */
export function getLastUsedExpenseDefaults(transactions: Transaction[]): LastUsedExpenseDefaults | null {
  let mostRecent: Transaction | null = null;
  for (const t of transactions) {
    if (t.is_deleted || t.type !== 'Expense') continue;
    if (!mostRecent || t.created_at > mostRecent.created_at) {
      mostRecent = t;
    }
  }
  if (!mostRecent?.category) return null;
  return { accountId: mostRecent.account_id, category: mostRecent.category };
}

export interface ExpenseFilter {
  year?: number;
  /** 1-12. */
  month?: number;
  /** Falsy (undefined/null/'') means "all categories". */
  category?: string | null;
  /** Falsy means "all accounts". */
  accountId?: string | null;
  /** Falsy means "everyone" — see the Spend Log spec's "Paid By" filter. */
  paidByUserId?: string | null;
}

/** Every non-deleted Expense transaction matching the given filter — keeps the repository/UI layer extensible for future search without needing its own query. */
export function filterExpenses(transactions: Transaction[], filter: ExpenseFilter): Transaction[] {
  return transactions.filter((t) => {
    if (t.is_deleted || t.type !== 'Expense') return false;
    if (filter.year != null && filter.month != null && !matchesMonth(t.transaction_date, filter.year, filter.month)) return false;
    if (filter.category && t.category !== filter.category) return false;
    if (filter.accountId && t.account_id !== filter.accountId) return false;
    if (filter.paidByUserId && t.paid_by_user_id !== filter.paidByUserId) return false;
    return true;
  });
}
