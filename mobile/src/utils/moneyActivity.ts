import type { Account, Transaction } from '../types/entities';

/**
 * "Recent Activity" needs to show more than just Transactions — an added account is worth
 * surfacing too ("BPI account added, starting balance ₱10,000") — but an account being created is
 * NOT a financial transaction and must never become a fake Income/Expense row (see the Money spec
 * §5). There's already a suitable source for this: `Account.CreatedAt`/`OpeningBalance` are real,
 * already-synced fields — no new activity table, sync entity, or SQLite column is needed. This
 * module just merges the two existing collections into one sorted, renderable list at read time.
 */
export type MoneyActivityItem =
  | { kind: 'transaction'; id: string; sortKey: string; transaction: Transaction }
  | { kind: 'account_created'; id: string; sortKey: string; account: Account };

/**
 * Sorted newest-first by `created_at` (when the thing was actually logged/added on-device) for
 * both kinds — not `transaction_date`, which is the user-editable "this happened on" date used
 * for monthly totals (see moneyCalculations.ts), not for ordering a recency feed.
 */
export function getRecentActivity(accounts: Account[], transactions: Transaction[], limit = 10): MoneyActivityItem[] {
  const items: MoneyActivityItem[] = [
    ...transactions.map((t): MoneyActivityItem => ({ kind: 'transaction', id: t.id, sortKey: t.created_at, transaction: t })),
    ...accounts.map((a): MoneyActivityItem => ({ kind: 'account_created', id: a.id, sortKey: a.created_at, account: a })),
  ];
  return items.sort((a, b) => b.sortKey.localeCompare(a.sortKey)).slice(0, limit);
}

const CATEGORY_ICONS: Record<string, string> = {
  Food: '🍔',
  Groceries: '🛒',
  Transportation: '🚗',
  Shopping: '🛍️',
  Bills: '💡',
  Entertainment: '🎬',
  Health: '💊',
  Personal: '🧴',
  Education: '📚',
  Travel: '✈️',
  Household: '🏠',
  Salary: '💰',
  Freelance: '💼',
  Gift: '🎁',
  Refund: '↩️',
  Other: '💸',
};

/** A category's small display icon (e.g. for BudgetProgressRow's category rows) — the same map `describeTransaction` uses internally, exposed for callers that only have a category string, not a whole Transaction. */
export function getCategoryIcon(category: string | null): string {
  return CATEGORY_ICONS[category ?? 'Other'] ?? '💸';
}

export interface TransactionDescription {
  icon: string;
  title: string;
  subtitle: string;
  amountText: string;
  isNegative: boolean;
}

/**
 * Describes one transaction for display — a single canonical rendering per transaction (never
 * two feed rows for one transfer; see the Money spec §12 "no duplicate transfer rows").
 *
 * `perspectiveAccountId` is only passed from an account's own detail screen: a Transfer then
 * frames as outgoing (↗) or incoming (↙) *relative to that account*, matching whichever side of
 * the single transfer row it actually is. Omitted (as in the couple-wide dashboard feed, which
 * has no single "current account"), a Transfer always frames from its source's perspective.
 */
export function describeTransaction(transaction: Transaction, accounts: Account[], perspectiveAccountId?: string): TransactionDescription {
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? '—';

  if (transaction.type === 'Transfer') {
    const isIncomingHere = perspectiveAccountId != null && transaction.destination_account_id === perspectiveAccountId;
    return isIncomingHere
      ? { icon: '↙', title: `Transfer from ${accountName(transaction.account_id)}`, subtitle: accountName(perspectiveAccountId ?? null), amountText: `+`, isNegative: false }
      : {
          icon: perspectiveAccountId ? '↗' : '↔',
          title: `Transfer to ${accountName(transaction.destination_account_id)}`,
          subtitle: accountName(transaction.account_id),
          amountText: `-`,
          isNegative: true,
        };
  }

  const icon = CATEGORY_ICONS[transaction.category ?? 'Other'] ?? '💸';
  const isExpense = transaction.type === 'Expense';
  return {
    icon,
    title: transaction.description || transaction.category || transaction.type,
    subtitle: `${transaction.category ?? transaction.type} · ${accountName(transaction.account_id)}`,
    amountText: isExpense ? '-' : '+',
    isNegative: isExpense,
  };
}
