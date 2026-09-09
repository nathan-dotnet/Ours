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

export const CURRENT_SCHEMA_VERSION = 6;

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
