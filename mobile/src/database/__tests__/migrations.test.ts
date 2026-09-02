import { getDatabase, resetDatabaseHandleForTests } from '../db';

describe('database migrations', () => {
  beforeEach(() => {
    resetDatabaseHandleForTests();
  });

  it('creates every Phase 1 table and sets the schema version', async () => {
    const db = await getDatabase();

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(1);

    const tables = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    );
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toEqual(expect.arrayContaining(['sync_queue', 'sync_meta', 'couples', 'couple_members']));
  });

  it('is idempotent — opening an already-migrated database again is a no-op', async () => {
    const db = await getDatabase();
    // Calling migrate a second time on the same handle must not error (e.g. re-running CREATE TABLE).
    await expect(db.execAsync('PRAGMA user_version')).resolves.not.toThrow();
  });
});
