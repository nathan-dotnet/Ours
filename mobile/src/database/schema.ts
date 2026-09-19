/**
 * Local SQLite schema, versioned via `PRAGMA user_version` (see migrations.ts).
 *
 * Two kinds of tables live here:
 *  - Generic sync plumbing (`sync_queue`, `sync_meta`) that every future feature reuses as-is.
 *  - Feature tables that mirror the server's shape plus sync metadata (updated_at,
 *    updated_by_user_id, version, is_deleted) so the "last valid server write wins" strategy
 *    has what it needs on both ends. `couples`/`couple_members` (Phase 1) and `calendar_events`
 *    (Phase 2) follow this same shape — later phases add one table per new entity the same way.
 */

export const CURRENT_SCHEMA_VERSION = 10;

/** Statements applied when moving from schema version 0 -> 1. */
export const MIGRATION_V1 = `
  PRAGMA journal_mode = 'wal';

  CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('CREATE', 'UPDATE', 'DELETE')),
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'syncing', 'failed', 'synced'))
  );

  CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue (status);

  CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS couples (
    id TEXT PRIMARY KEY NOT NULL,
    invite_code TEXT NOT NULL,
    nickname TEXT,
    anniversary_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by_user_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS couple_members (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    joined_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_couple_members_couple_id ON couple_members (couple_id);
`;

/** Statements applied when moving from schema version 1 -> 2: adds Calendar (Phase 2). */
export const MIGRATION_V2 = `
  CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    reminder_at TEXT,
    created_by_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by_user_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_calendar_events_couple_id ON calendar_events (couple_id);
  CREATE INDEX IF NOT EXISTS idx_calendar_events_start_at ON calendar_events (start_at);
`;

/**
 * Statements applied when moving from schema version 2 -> 3: adds all-day + location to
 * calendar_events, additively (existing rows default to a timed event with no location).
 */
export const MIGRATION_V3 = `
  ALTER TABLE calendar_events ADD COLUMN all_day INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE calendar_events ADD COLUMN location TEXT;
`;

/**
 * Statements applied when moving from schema version 3 -> 4: adds Expenses (Phase 3A).
 * `amount_cents` is an INTEGER, never REAL — see utils/money.ts for why money is never stored
 * or summed as a SQLite REAL/JS float anywhere in this app.
 */
export const MIGRATION_V4 = `
  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    expense_date TEXT NOT NULL,
    notes TEXT,
    paid_by_user_id TEXT,
    created_by_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by_user_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_expenses_couple_id ON expenses (couple_id);
  CREATE INDEX IF NOT EXISTS idx_expenses_couple_id_expense_date ON expenses (couple_id, expense_date);
`;

/**
 * Statements applied when moving from schema version 4 -> 5: replaces the Phase 3A
 * Expenses-only table with the full Money System (Phase 3) — Accounts, Transactions, Budgets.
 * `expenses` is dropped outright (see backend's matching ReplaceExpensesWithMoneySystem
 * migration) rather than kept alongside the new tables — the old design is fully superseded,
 * not extended. All money amounts are INTEGER minor units ("cents"), never REAL — see
 * utils/money.ts and utils/moneyCalculations.ts for why float is never used for money anywhere
 * in this app.
 */
export const MIGRATION_V5 = `
  DROP TABLE IF EXISTS expenses;

  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    icon TEXT NOT NULL,
    opening_balance_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by_user_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_accounts_couple_id ON accounts (couple_id);
  CREATE INDEX IF NOT EXISTS idx_accounts_couple_id_is_active ON accounts (couple_id, is_active);

  CREATE TABLE IF NOT EXISTS money_transactions (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    type TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    account_id TEXT NOT NULL,
    destination_account_id TEXT,
    category TEXT,
    description TEXT,
    transaction_date TEXT NOT NULL,
    notes TEXT,
    paid_by_user_id TEXT,
    created_by_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by_user_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_money_transactions_couple_id ON money_transactions (couple_id);
  CREATE INDEX IF NOT EXISTS idx_money_transactions_couple_id_date ON money_transactions (couple_id, transaction_date);
  CREATE INDEX IF NOT EXISTS idx_money_transactions_account_id ON money_transactions (account_id);
  CREATE INDEX IF NOT EXISTS idx_money_transactions_destination_account_id ON money_transactions (destination_account_id);

  CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    category TEXT NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    created_by_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by_user_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_budgets_couple_id_year_month ON budgets (couple_id, year, month);
`;

/**
 * Statements applied when moving from schema version 5 -> 6: adds the Vault (shared encrypted
 * password items). `encrypted_password`/`nonce`/`auth_tag` are base64 TEXT — SQLite has no
 * dedicated binary column type, and the app never operates on these bytes directly anyway (only
 * the server ever holds the decryption key — see backend/README.md's Vault section). They're
 * nullable because a device that created or edited an item offline has no way to compute them
 * itself; they're only ever populated once by applyRemoteChange, from the server's own encrypted
 * representation on the next successful pull — see vaultRepository.ts. This table NEVER has a
 * plaintext password column, on this device or any other.
 */
export const MIGRATION_V6 = `
  CREATE TABLE IF NOT EXISTS vault_items (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    title TEXT NOT NULL,
    username TEXT,
    encrypted_password TEXT,
    nonce TEXT,
    auth_tag TEXT,
    key_version INTEGER,
    website_url TEXT,
    category TEXT NOT NULL,
    notes TEXT,
    created_by_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by_user_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_vault_items_couple_id ON vault_items (couple_id);
`;

/**
 * Statements applied when moving from schema version 6 -> 7: adds the Money Calculator (Savings
 * goals + the couple's saved income-allocation plan + each partner's own income).
 *
 * Percent columns are REAL (SQLite has no dedicated decimal type) — fine for a config/display
 * value like this; the actual peso math always goes through utils/money.ts's integer-cents
 * helpers, and the server re-derives every distributed amount itself rather than trusting a
 * client-computed one (see DistributionService on the backend).
 */
export const MIGRATION_V7 = `
  ALTER TABLE couples ADD COLUMN budget_allocation_percent REAL;
  ALTER TABLE couples ADD COLUMN savings_allocation_percent REAL;
  ALTER TABLE couples ADD COLUMN wants_allocation_percent REAL;
  ALTER TABLE couples ADD COLUMN budget_account_id TEXT;
  ALTER TABLE couples ADD COLUMN savings_account_id TEXT;
  ALTER TABLE couples ADD COLUMN wants_account_id TEXT;

  ALTER TABLE couple_members ADD COLUMN monthly_income_cents INTEGER;

  ALTER TABLE money_transactions ADD COLUMN savings_goal_id TEXT;
  CREATE INDEX IF NOT EXISTS idx_money_transactions_savings_goal_id ON money_transactions (savings_goal_id);

  CREATE TABLE IF NOT EXISTS savings_goals (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    name TEXT NOT NULL,
    target_amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    allocation_percent REAL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by_user_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_savings_goals_couple_id ON savings_goals (couple_id);
`;

/**
 * Statements applied when moving from schema version 7 -> 8: splits the Wants allocation between
 * the couple's members (Mine/Hers — see the Money Calculator). Wants never had a *pooled* Ours
 * account of its own to begin with (unlike Budget/Savings), so `couples.wants_account_id` is
 * dropped outright rather than migrated — each member gets their own share/account instead,
 * mirroring `couple_members.monthly_income_cents`'s self-scoped shape from MIGRATION_V7.
 */
export const MIGRATION_V8 = `
  ALTER TABLE couples DROP COLUMN wants_account_id;

  ALTER TABLE couple_members ADD COLUMN wants_allocation_percent REAL;
  ALTER TABLE couple_members ADD COLUMN wants_account_id TEXT;
`;

/**
 * Statements applied when moving from schema version 8 -> 9: adds Loans / Pay-Later tracking
 * (Shopee PayLater, TikTok PayLater, credit card installments, personal loans, etc.).
 *
 * Like `savings_goals`, `loans` deliberately has no remaining-balance/installments-paid/status
 * columns — those are always derived from `original_amount_cents` minus the sum of every
 * non-deleted LoanPayment transaction linked to it via the new `money_transactions.loan_id`
 * column (see utils/moneyCalculations.ts's calculateLoanPaidAmount), the same "derive, don't
 * store" philosophy as every other balance in this schema.
 */
export const MIGRATION_V9 = `
  ALTER TABLE money_transactions ADD COLUMN loan_id TEXT;
  CREATE INDEX IF NOT EXISTS idx_money_transactions_loan_id ON money_transactions (loan_id);

  CREATE TABLE IF NOT EXISTS loans (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    name TEXT NOT NULL,
    provider TEXT,
    original_amount_cents INTEGER NOT NULL,
    monthly_payment_cents INTEGER NOT NULL,
    total_installments INTEGER NOT NULL,
    due_day INTEGER NOT NULL,
    fees_amount_cents INTEGER,
    currency TEXT NOT NULL,
    payment_account_id TEXT NOT NULL,
    owner_user_id TEXT,
    created_by_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by_user_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_loans_couple_id ON loans (couple_id);
`;

/**
 * Statements applied when moving from schema version 9 -> 10: replaces `loans.due_day` (a bare
 * recurring day-of-month, with no way to say *which* month installment 1 was due) with a real
 * `first_due_date`, plus a `frequency` column (only "Monthly" exists today) — see
 * utils/loanSchedule.ts's generateLoanSchedule, which needs an anchor date to build the fixed
 * per-installment schedule at all. Unlike every earlier migration here, this one needs a JS-side
 * backfill step (SQLite has no server-side date-arithmetic function to lean on the way the
 * backend's migration used Postgres' date_trunc) — see migrateDatabase's own `version < 10`
 * block, which runs `MIGRATION_V10_ADD_COLUMNS`, then the backfill loop, then
 * `MIGRATION_V10_DROP_DUE_DAY`, in that order.
 */
export const MIGRATION_V10_ADD_COLUMNS = `
  ALTER TABLE loans ADD COLUMN first_due_date TEXT;
  ALTER TABLE loans ADD COLUMN frequency TEXT NOT NULL DEFAULT 'Monthly';
`;

export const MIGRATION_V10_DROP_DUE_DAY = `
  ALTER TABLE loans DROP COLUMN due_day;
`;
