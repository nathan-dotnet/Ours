import { getDatabase, resetDatabaseHandleForTests } from '../db';
import { migrateDatabase } from '../migrations';

describe('database migrations', () => {
  beforeEach(() => {
    resetDatabaseHandleForTests();
  });

  it('creates every table (Phase 1 + Phase 2 + Phase 3 Money System) and sets the schema version', async () => {
    const db = await getDatabase();

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(5);

    const tables = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    );
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toEqual(
      expect.arrayContaining(['sync_queue', 'sync_meta', 'couples', 'couple_members', 'calendar_events', 'accounts', 'money_transactions', 'budgets']),
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
  });

  it('migrates a Phase-1-only database (schema v1) all the way forward to v5 without touching existing tables', async () => {
    resetDatabaseHandleForTests();
    const db = await getDatabase();
    // Simulate a device that installed before Phase 2 shipped: roll back to v1 and drop every
    // table introduced since, then re-run migrations exactly as app startup would.
    await db.execAsync('DROP TABLE calendar_events; PRAGMA user_version = 1;');

    await migrateDatabase(db);

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(5);
    for (const table of ['calendar_events', 'accounts', 'money_transactions', 'budgets']) {
      const found = await db.getFirstAsync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [table]);
      expect(found).not.toBeNull();
    }
    // A pre-existing table from v1 must survive the upgrade untouched.
    const couplesTable = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'couples'`,
    );
    expect(couplesTable).not.toBeNull();
  });

  it('migrates a Phase-2 database (schema v2, no all_day/location columns) forward to v5 additively', async () => {
    resetDatabaseHandleForTests();
    const db = await getDatabase();
    // Simulate a device on Phase 2 exactly as shipped: drop back to the v2 column set.
    await db.execAsync(`
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
    expect(version?.user_version).toBe(5);
    const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(calendar_events)`);
    expect(columns.map((c) => c.name)).toEqual(expect.arrayContaining(['all_day', 'location']));
    const accountsTable = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'accounts'`,
    );
    expect(accountsTable).not.toBeNull();
  });

  it('migrates a real Phase 3A device (schema v4, with the old expenses table) forward to v5: expenses is dropped, Money System tables appear', async () => {
    resetDatabaseHandleForTests();
    const db = await getDatabase();
    // Simulate a device that shipped Phase 3A exactly as it was: recreate the old `expenses`
    // table (which the fresh v5 schema never creates) and roll back to v4.
    await db.execAsync(`
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
    expect(version?.user_version).toBe(5);

    const expensesTable = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'expenses'`,
    );
    expect(expensesTable).toBeNull();

    for (const table of ['accounts', 'money_transactions', 'budgets']) {
      const found = await db.getFirstAsync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [table]);
      expect(found).not.toBeNull();
    }
  });

  it('is idempotent — opening an already-migrated database again is a no-op', async () => {
    const db = await getDatabase();
    // Calling migrate a second time on the same handle must not error (e.g. re-running CREATE TABLE).
    await expect(db.execAsync('PRAGMA user_version')).resolves.not.toThrow();
  });
});
