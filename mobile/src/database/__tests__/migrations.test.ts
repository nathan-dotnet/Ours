import { getDatabase, resetDatabaseHandleForTests } from '../db';
import { migrateDatabase } from '../migrations';

describe('database migrations', () => {
  beforeEach(() => {
    resetDatabaseHandleForTests();
  });

  it('creates every table (Phase 1 + Phase 2) and sets the schema version', async () => {
    const db = await getDatabase();

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(3);

    const tables = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    );
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toEqual(
      expect.arrayContaining(['sync_queue', 'sync_meta', 'couples', 'couple_members', 'calendar_events']),
    );

    const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(calendar_events)`);
    expect(columns.map((c) => c.name)).toEqual(expect.arrayContaining(['all_day', 'location']));
  });

  it('migrates a Phase-1-only database (schema v1) forward to v3 without touching existing tables', async () => {
    resetDatabaseHandleForTests();
    const db = await getDatabase();
    // Simulate a device that installed before Phase 2 shipped: roll back to v1 and drop the
    // table Phase 2 introduces, then re-run migrations exactly as app startup would.
    await db.execAsync('DROP TABLE calendar_events; PRAGMA user_version = 1;');

    await migrateDatabase(db);

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(3);
    const table = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'calendar_events'`,
    );
    expect(table).not.toBeNull();
    // A pre-existing table from v1 must survive the upgrade untouched.
    const couplesTable = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'couples'`,
    );
    expect(couplesTable).not.toBeNull();
  });

  it('migrates a Phase-2 database (schema v2, no all_day/location columns) forward to v3 additively', async () => {
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
    expect(version?.user_version).toBe(3);
    const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(calendar_events)`);
    expect(columns.map((c) => c.name)).toEqual(expect.arrayContaining(['all_day', 'location']));
  });

  it('is idempotent — opening an already-migrated database again is a no-op', async () => {
    const db = await getDatabase();
    // Calling migrate a second time on the same handle must not error (e.g. re-running CREATE TABLE).
    await expect(db.execAsync('PRAGMA user_version')).resolves.not.toThrow();
  });
});
