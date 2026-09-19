/** Local (SQLite-shaped) domain types. Field names are snake_case to match the columns directly. */

export interface Couple {
  id: string;
  invite_code: string;
  nickname: string | null;
  anniversary_date: string | null; // ISO date (YYYY-MM-DD)
  // The couple's saved default income-allocation plan (see the Money Calculator) — all four
  // null until they've saved one. Percentages are 0-100; amount_cents are always derived from
  // combined income at read time, never stored — see utils/allocationCalculations.ts. Wants has
  // no couple-level account of its own — it's split between the couple's members instead, each
  // with their own share and destination account (see CoupleMember below).
  budget_allocation_percent: number | null;
  savings_allocation_percent: number | null;
  wants_allocation_percent: number | null;
  budget_account_id: string | null;
  savings_account_id: string | null;
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
  /** This member's own self-reported monthly income (Calculator's "Your/Partner Income") — null until entered. Integer cents. */
  monthly_income_cents: number | null;
  /**
   * This member's own share (0-100) of the couple's Wants allocation — e.g. "Mine 12%, hers 8%"
   * of a 20% Wants bucket. Unlike monthly_income_cents, planning the whole split is one joint
   * action, so either partner's device can set both members' share/account at once (see
   * coupleRepository's updateProfileLocally). Null until configured. Must sum to exactly the
   * couple's wants_allocation_percent — enforced at Distribute Money time, not here.
   */
  wants_allocation_percent: number | null;
  wants_account_id: string | null;
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

/** One movement of money — Expense, Income, Transfer, SavingsContribution, SavingsWithdrawal, IncomeAllocation, or LoanPayment. amount_cents is always positive; direction is implied by type + account_id/destination_account_id. */
export interface Transaction {
  id: string;
  couple_id: string;
  type: string; // 'Expense' | 'Income' | 'Transfer' | 'SavingsContribution' | 'SavingsWithdrawal' | 'IncomeAllocation' | 'LoanPayment'
  amount_cents: number; // integer minor units — never a float; see utils/money.ts
  currency: string;
  account_id: string; // the affected account (Expense/Income) or source account (Transfer)
  destination_account_id: string | null; // only for Transfer
  category: string | null; // null for Transfer, SavingsContribution, or SavingsWithdrawal
  /** Only for SavingsContribution/SavingsWithdrawal — which goal this movement is credited to (contribution) or debited from (withdrawal). */
  savings_goal_id: string | null;
  /** Only for LoanPayment — which loan this payment reduces. */
  loan_id: string | null;
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

/**
 * A couple's own named savings goal (Emergency Fund, MP2, Travel, or anything they type).
 * Has no stored "current amount" — same reasoning as Account's balance: it's always the sum of
 * every non-deleted SavingsContribution (+)/SavingsWithdrawal (-) Transaction linked to it via
 * savings_goal_id — see utils/moneyCalculations.ts's calculateSavingsGoalBalance.
 */
export interface SavingsGoal {
  id: string;
  couple_id: string;
  name: string;
  target_amount_cents: number;
  currency: string;
  /** This goal's share (0-100) of the monthly Savings allocation during "Distribute Money" — null/0 means manual-only. */
  allocation_percent: number | null;
  is_active: number; // 0 | 1
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  updated_by_user_id: string;
  version: number;
  is_deleted: number;
}

/**
 * A couple's own liability/obligation — Shopee PayLater, TikTok PayLater, a credit card
 * installment, a personal loan, or anything else they type. Has no stored remaining balance,
 * installments-paid, status, or per-installment schedule row — same "derive, don't store"
 * reasoning as Account's balance and SavingsGoal's progress: first_due_date + total_installments +
 * monthly_payment_cents + original_amount_cents is enough to *generate* the fixed schedule, and
 * matching it against every non-deleted LoanPayment Transaction linked via loan_id (a waterfall
 * allocation) derives each installment's progress — see utils/loanSchedule.ts.
 */
export interface Loan {
  id: string;
  couple_id: string;
  name: string;
  provider: string | null;
  original_amount_cents: number;
  monthly_payment_cents: number;
  total_installments: number;
  /** The date installment 1 is due (ISO "YYYY-MM-DD") — anchors the whole schedule; see utils/loanSchedule.ts's generateLoanSchedule. */
  first_due_date: string;
  /** Only "Monthly" is supported today — see utils/loanSchedule.ts. */
  frequency: string;
  fees_amount_cents: number | null;
  currency: string;
  payment_account_id: string;
  /** Which couple member this loan belongs to — null means Joint (shared), same "null = unspecified/shared" convention as Transaction.paid_by_user_id. */
  owner_user_id: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  updated_by_user_id: string;
  version: number;
  is_deleted: number;
}

/**
 * A shared credential in the couple's vault. Never a plaintext password column — only the
 * server-encrypted representation (base64 TEXT, since SQLite has no binary type), populated
 * exclusively by applyRemoteChange from a pull. See utils/vaultAuth.ts + api.ts's
 * revealVaultPassword for the only way plaintext is ever obtained (a decrypt-on-demand server
 * call, never a local decrypt — this device never holds the key).
 */
export interface VaultItem {
  id: string;
  couple_id: string;
  title: string;
  username: string | null;
  encrypted_password: string | null; // base64
  nonce: string | null; // base64
  auth_tag: string | null; // base64
  key_version: number | null;
  website_url: string | null;
  category: string;
  notes: string | null;
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
