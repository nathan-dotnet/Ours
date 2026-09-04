/** Local (SQLite-shaped) domain types. Field names are snake_case to match the columns directly. */

export interface Couple {
  id: string;
  invite_code: string;
  nickname: string | null;
  anniversary_date: string | null; // ISO date (YYYY-MM-DD)
  created_at: string;
  updated_at: string;
  updated_by_user_id: string;
  version: number;
  is_deleted: number; // SQLite has no boolean type; 0/1
}

export interface CoupleMember {
  id: string;
  couple_id: string;
  user_id: string;
  display_name: string;
  joined_at: string;
}

export interface CalendarEvent {
  id: string;
  couple_id: string;
  title: string;
  description: string | null;
  start_at: string; // ISO datetime
  end_at: string; // ISO datetime
  all_day: number; // 0 | 1
  location: string | null;
  reminder_at: string | null; // ISO datetime
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  updated_by_user_id: string;
  version: number;
  is_deleted: number;
}

/** Where a couple's money is stored. Has no stored "current balance" — see utils/moneyCalculations.ts. */
export interface Account {
  id: string;
  couple_id: string;
  name: string;
  type: string; // 'Bank' | 'EWallet' | 'Cash' | 'Other'
  icon: string; // brand identifier mapped to a local asset/emoji — see utils/accountBrand.ts
  opening_balance_cents: number; // integer minor units — never a float; see utils/money.ts. Set once, never edited.
  currency: string; // ISO 4217, e.g. "PHP"
  is_active: number; // 0 | 1 — a deactivated account keeps its history but leaves the active dashboard/totals
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  updated_by_user_id: string;
  version: number;
  is_deleted: number;
}

/** One movement of money — Expense, Income, or Transfer. amount_cents is always positive; direction is implied by type + account_id/destination_account_id. */
export interface Transaction {
  id: string;
  couple_id: string;
  type: string; // 'Expense' | 'Income' | 'Transfer'
  amount_cents: number; // integer minor units — never a float; see utils/money.ts
  currency: string;
  account_id: string; // the affected account (Expense/Income) or source account (Transfer)
  destination_account_id: string | null; // only for Transfer
  category: string | null; // null for Transfer
  description: string | null;
  transaction_date: string; // ISO date (YYYY-MM-DD) — date-only, separate from created_at
  notes: string | null;
  paid_by_user_id: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  updated_by_user_id: string;
  version: number;
  is_deleted: number;
}

/** A planned monthly spending limit for one expense category — informational, never enforced. */
export interface Budget {
  id: string;
  couple_id: string;
  category: string;
  year: number;
  month: number; // 1-12
  amount_cents: number;
  currency: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  updated_by_user_id: string;
  version: number;
  is_deleted: number;
}

export type SyncOperation = 'CREATE' | 'UPDATE' | 'DELETE';
export type SyncQueueStatus = 'pending' | 'syncing' | 'failed' | 'synced';

export interface SyncQueueRow {
  id: string;
  entity_type: string;
  entity_id: string;
  operation: SyncOperation;
  payload: string; // JSON-encoded
  created_at: string;
  retry_count: number;
  last_error: string | null;
  status: SyncQueueStatus;
}
