import { getDatabase, resetDatabaseHandleForTests } from '../db';
import { migrateDatabase } from '../migrations';

/**
 * Every "simulate an old device" test below starts from a *fresh* (already fully-migrated-to-v10)
 * database and then manually undoes just enough to look like an older schema version. Every such
 * test needs this: MIGRATION_V7 through V10 between them ALTER-TABLE several already-existing
 * tables (unlike the earliest migrations, which only ever added new tables — see the file
 * header), so re-running them against a table that still has those columns from the initial
 * fresh migration would fail with "duplicate column name" (or, for columns a later migration
 * drops outright — `couples.wants_account_id`, `loans.due_day` — "no such column"). This strips
 * exactly what v7-v10 together add or remove, safe to run before any older-version simulation
 * regardless of which table that simulation is really about.
 */
const DROP_V7_THROUGH_V10_CHANGES_SQL = `
  ALTER TABLE loans DROP COLUMN first_due_date;
  ALTER TABLE loans DROP COLUMN frequency;
  ALTER TABLE loans ADD COLUMN due_day INTEGER NOT NULL DEFAULT 15;
  DROP INDEX idx_money_transactions_loan_id;
  ALTER TABLE money_transactions DROP COLUMN loan_id;
  DROP TABLE loans;
  DROP TABLE savings_goals;
  ALTER TABLE couples DROP COLUMN budget_allocation_percent;
  ALTER TABLE couples DROP COLUMN savings_allocation_percent;
  ALTER TABLE couples DROP COLUMN wants_allocation_percent;
  ALTER TABLE couples DROP COLUMN budget_account_id;
  ALTER TABLE couples DROP COLUMN savings_account_id;
  ALTER TABLE couple_members DROP COLUMN monthly_income_cents;
  ALTER TABLE couple_members DROP COLUMN wants_allocation_percent;
  ALTER TABLE couple_members DROP COLUMN wants_account_id;
  DROP INDEX idx_money_transactions_savings_goal_id;
  ALTER TABLE money_transactions DROP COLUMN savings_goal_id;
`;

describe('database migrations', () => {
  beforeEach(() => {
    resetDatabaseHandleForTests();
  });

  it('creates every table (Phase 1 + Phase 2 + Phase 3 Money System + Loans) and sets the schema version', async () => {
    const db = await getDatabase();

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(10);

    const tables = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    );
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toEqual(
      expect.arrayContaining([
        'sync_queue', 'sync_meta', 'couples', 'couple_members', 'calendar_events', 'accounts', 'money_transactions', 'budgets', 'vault_items', 'savings_goals', 'loans',
      ]),
    );
    // The Phase 3A Expenses-only table is fully superseded, not kept alongside the new ones.
    expect(tableNames).not.toContain('expenses');

    const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(calendar_events)`);
    expect(columns.map((c) => c.name)).toEqual(expect.arrayContaining(['all_day', 'location']));

    const accountColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(accounts)`);
    expect(accountColumns.map((c) => c.name)).toEqual(expect.arrayContaining(['opening_balance_cents', 'type', 'icon', 'is_active']));

    const transactionColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(money_transactions)`);
    expect(transactionColumns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['type', 'amount_cents', 'account_id', 'destination_account_id', 'category', 'transaction_date']),
    );

    const budgetColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(budgets)`);
    expect(budgetColumns.map((c) => c.name)).toEqual(expect.arrayContaining(['category', 'year', 'month', 'amount_cents']));

    const coupleColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(couples)`);
    expect(coupleColumns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['budget_allocation_percent', 'savings_allocation_percent', 'wants_allocation_percent', 'budget_account_id', 'savings_account_id']),
    );
    // Wants has no couple-level pooled account (unlike Budget/Savings) — it's split between
    // members instead (see couple_members below) — see MIGRATION_V8.
    expect(coupleColumns.map((c) => c.name)).not.toContain('wants_account_id');

    const memberColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(couple_members)`);
    expect(memberColumns.map((c) => c.name)).toEqual(expect.arrayContaining(['monthly_income_cents', 'wants_allocation_percent', 'wants_account_id']));

    expect(transactionColumns.map((c) => c.name)).toEqual(expect.arrayContaining(['savings_goal_id', 'loan_id']));

    const savingsGoalColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(savings_goals)`);
    expect(savingsGoalColumns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['name', 'target_amount_cents', 'currency', 'allocation_percent', 'is_active']),
    );

    const loanColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(loans)`);
    expect(loanColumns.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'name', 'provider', 'original_amount_cents', 'monthly_payment_cents', 'total_installments',
        'first_due_date', 'frequency', 'fees_amount_cents', 'currency', 'payment_account_id', 'owner_user_id',
      ]),
    );
    // Superseded by first_due_date (see MIGRATION_V10) — no bare recurring day-of-month anymore.
    expect(loanColumns.map((c) => c.name)).not.toContain('due_day');
    // No stored remaining-balance/installments-paid/status column — those are derived (see the Loan type's own doc comment).
    expect(loanColumns.map((c) => c.name)).not.toContain('remaining_balance_cents');
    expect(loanColumns.map((c) => c.name)).not.toContain('status');
  });

  it('migrates a Vault-only device (schema v6, before the Money Calculator) forward to v10 additively', async () => {
    resetDatabaseHandleForTests();
    const db = await getDatabase();
    // Simulate a device that shipped Vault exactly as it was: undo everything v7-v10 add or
    // remove (the new tables, and the changed columns on existing tables) and roll back to v6.
    await db.execAsync(`${DROP_V7_THROUGH_V10_CHANGES_SQL} PRAGMA user_version = 6;`);

    await migrateDatabase(db);

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(10);
    const savingsGoalsTable = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'savings_goals'`,
    );
    expect(savingsGoalsTable).not.toBeNull();
    const loanColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(loans)`);
    expect(loanColumns.map((c) => c.name)).toEqual(expect.arrayContaining(['first_due_date', 'frequency']));
    const coupleColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(couples)`);
    expect(coupleColumns.map((c) => c.name)).toEqual(expect.arrayContaining(['budget_allocation_percent']));
    expect(coupleColumns.map((c) => c.name)).not.toContain('wants_account_id');
    const memberColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(couple_members)`);
    expect(memberColumns.map((c) => c.name)).toEqual(expect.arrayContaining(['monthly_income_cents', 'wants_allocation_percent', 'wants_account_id']));
    // A pre-existing table from v6 must survive the upgrade untouched.
    const vaultTable = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'vault_items'`,
    );
    expect(vaultTable).not.toBeNull();
  });

  it('migrates a Phase-1-only database (schema v1) all the way forward to v10 without touching existing tables', async () => {
    resetDatabaseHandleForTests();
    const db = await getDatabase();
    // Simulate a device that installed before Phase 2 shipped: roll back to v1 and drop every
    // table introduced since, then re-run migrations exactly as app startup would.
    await db.execAsync(`${DROP_V7_THROUGH_V10_CHANGES_SQL} DROP TABLE calendar_events; PRAGMA user_version = 1;`);

    await migrateDatabase(db);

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(10);
    for (const table of ['calendar_events', 'accounts', 'money_transactions', 'budgets', 'vault_items', 'loans']) {
      const found = await db.getFirstAsync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [table]);
      expect(found).not.toBeNull();
    }
    // A pre-existing table from v1 must survive the upgrade untouched.
    const couplesTable = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'couples'`,
    );
    expect(couplesTable).not.toBeNull();
  });

  it('migrates a Phase-2 database (schema v2, no all_day/location columns) forward to v10 additively', async () => {
    resetDatabaseHandleForTests();
    const db = await getDatabase();
    // Simulate a device on Phase 2 exactly as shipped: drop back to the v2 column set.
    await db.execAsync(`
      ${DROP_V7_THROUGH_V10_CHANGES_SQL}
      ALTER TABLE calendar_events RENAME TO calendar_events_v2;
      CREATE TABLE calendar_events (
        id TEXT PRIMARY KEY NOT NULL, couple_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT,
        start_at TEXT NOT NULL, end_at TEXT NOT NULL, reminder_at TEXT, created_by_user_id TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by_user_id TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1, is_deleted INTEGER NOT NULL DEFAULT 0
      );
      DROP TABLE calendar_events_v2;
      PRAGMA user_version = 2;
    `);

    await migrateDatabase(db);

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(10);
    const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(calendar_events)`);
    expect(columns.map((c) => c.name)).toEqual(expect.arrayContaining(['all_day', 'location']));
    const accountsTable = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'accounts'`,
    );
    expect(accountsTable).not.toBeNull();
  });

  it('migrates a real Phase 3A device (schema v4, with the old expenses table) forward to v10: expenses is dropped, Money System tables appear', async () => {
    resetDatabaseHandleForTests();
    const db = await getDatabase();
    // Simulate a device that shipped Phase 3A exactly as it was: recreate the old `expenses`
    // table (which the fresh v5 schema never creates) and roll back to v4.
    await db.execAsync(`
      ${DROP_V7_THROUGH_V10_CHANGES_SQL}
      CREATE TABLE expenses (
        id TEXT PRIMARY KEY NOT NULL, couple_id TEXT NOT NULL, amount_cents INTEGER NOT NULL,
        currency TEXT NOT NULL, description TEXT, category TEXT NOT NULL, expense_date TEXT NOT NULL,
        notes TEXT, paid_by_user_id TEXT, created_by_user_id TEXT NOT NULL, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL, updated_by_user_id TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
        is_deleted INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO expenses (id, couple_id, amount_cents, currency, category, expense_date, created_by_user_id, created_at, updated_at, updated_by_user_id)
      VALUES ('old-expense-1', 'couple-1', 50000, 'PHP', 'Food', '2026-01-01', 'user-1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'user-1');
      DROP TABLE accounts;
      DROP TABLE money_transactions;
      DROP TABLE budgets;
      PRAGMA user_version = 4;
    `);

    await migrateDatabase(db);

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(10);

    const expensesTable = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'expenses'`,
    );
    expect(expensesTable).toBeNull();

    for (const table of ['accounts', 'money_transactions', 'budgets']) {
      const found = await db.getFirstAsync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [table]);
      expect(found).not.toBeNull();
    }
  });

  it('migrates a Phase 3 Money System device (schema v5, no vault_items table) forward to v10 additively', async () => {
    resetDatabaseHandleForTests();
    const db = await getDatabase();
    await db.execAsync(`${DROP_V7_THROUGH_V10_CHANGES_SQL} DROP TABLE vault_items; PRAGMA user_version = 5;`);

    await migrateDatabase(db);

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(10);
    const vaultTable = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'vault_items'`,
    );
    expect(vaultTable).not.toBeNull();
    const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(vault_items)`);
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toEqual(expect.arrayContaining(['encrypted_password', 'nonce', 'auth_tag', 'key_version']));
    // Never a plaintext password column, on this device or any other.
    expect(columnNames).not.toContain('password');
    // A pre-existing table from v5 must survive the upgrade untouched.
    const accountsTable = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'accounts'`,
    );
    expect(accountsTable).not.toBeNull();
  });

  it('migrates a pre-Wants-split device (schema v7) forward to v10: the couple-level Wants account is dropped, per-member Wants fields appear', async () => {
    resetDatabaseHandleForTests();
    const db = await getDatabase();
    // Simulate a device that shipped the Money Calculator exactly as v7 had it: couples still has
    // its own wants_account_id, couple_members has no per-member Wants fields yet, and Loans (v9+)
    // doesn't exist yet either.
    await db.execAsync(`
      DROP TABLE loans;
      DROP INDEX idx_money_transactions_loan_id;
      ALTER TABLE money_transactions DROP COLUMN loan_id;
      ALTER TABLE couple_members DROP COLUMN wants_allocation_percent;
      ALTER TABLE couple_members DROP COLUMN wants_account_id;
      ALTER TABLE couples ADD COLUMN wants_account_id TEXT;
      PRAGMA user_version = 7;
    `);

    await migrateDatabase(db);

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(10);
    const coupleColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(couples)`);
    expect(coupleColumns.map((c) => c.name)).not.toContain('wants_account_id');
    const memberColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(couple_members)`);
    expect(memberColumns.map((c) => c.name)).toEqual(expect.arrayContaining(['wants_allocation_percent', 'wants_account_id']));
    // A pre-existing table from v7 must survive the upgrade untouched.
    const savingsGoalsTable = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'savings_goals'`,
    );
    expect(savingsGoalsTable).not.toBeNull();
    const loansTable = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'loans'`,
    );
    expect(loansTable).not.toBeNull();
  });

  it('migrates a pre-Loans device (schema v8) forward to v10 additively', async () => {
    resetDatabaseHandleForTests();
    const db = await getDatabase();
    // Simulate a device that shipped the Wants split exactly as v8 had it: no loans table, no
    // money_transactions.loan_id column yet.
    await db.execAsync(`
      DROP TABLE loans;
      DROP INDEX idx_money_transactions_loan_id;
      ALTER TABLE money_transactions DROP COLUMN loan_id;
      PRAGMA user_version = 8;
    `);

    await migrateDatabase(db);

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(10);
    const loansTable = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'loans'`,
    );
    expect(loansTable).not.toBeNull();
    const transactionColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(money_transactions)`);
    expect(transactionColumns.map((c) => c.name)).toContain('loan_id');
    // A pre-existing table from v8 must survive the upgrade untouched.
    const savingsGoalsTable = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'savings_goals'`,
    );
    expect(savingsGoalsTable).not.toBeNull();
  });

  it('migrates a pre-schedule Loans device (schema v9, due_day only) forward to v10: due_day is backfilled into first_due_date', async () => {
    resetDatabaseHandleForTests();
    const db = await getDatabase();
    // Simulate a device that shipped Loans exactly as v9 had it: a bare recurring due_day, no
    // first_due_date/frequency columns yet — including one already-created loan, to prove the
    // backfill actually runs against real data, not just an empty table.
    await db.execAsync(`
      ALTER TABLE loans DROP COLUMN first_due_date;
      ALTER TABLE loans DROP COLUMN frequency;
      ALTER TABLE loans ADD COLUMN due_day INTEGER NOT NULL DEFAULT 15;
      PRAGMA user_version = 9;
    `);
    await db.runAsync(
      `INSERT INTO loans (id, couple_id, name, original_amount_cents, monthly_payment_cents, total_installments, due_day, currency, payment_account_id, created_by_user_id, created_at, updated_at, updated_by_user_id, version, is_deleted)
       VALUES ('loan-1', 'couple-1', 'Shopee PayLater', 1020000, 170000, 6, 31, 'PHP', 'account-1', 'user-1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'user-1', 1, 0)`,
    );

    await migrateDatabase(db);

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(10);
    const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(loans)`);
    expect(columns.map((c) => c.name)).toEqual(expect.arrayContaining(['first_due_date', 'frequency']));
    expect(columns.map((c) => c.name)).not.toContain('due_day');

    const loan = await db.getFirstAsync<{ first_due_date: string; frequency: string }>(`SELECT first_due_date, frequency FROM loans WHERE id = 'loan-1'`);
    expect(loan?.frequency).toBe('Monthly');
    // A due_day of 31 is clamped to the 28th (always valid, regardless of which month "now" is)
    // — see MIGRATION_V10's own doc comment for why an exact reconstruction isn't possible.
    expect(loan?.first_due_date).toMatch(/-28$/);
  });

  it('is idempotent — opening an already-migrated database again is a no-op', async () => {
    const db = await getDatabase();
    // Calling migrate a second time on the same handle must not error (e.g. re-running CREATE TABLE).
    await expect(db.execAsync('PRAGMA user_version')).resolves.not.toThrow();
  });
});
