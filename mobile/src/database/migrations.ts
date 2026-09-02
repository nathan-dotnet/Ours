import type { SQLiteDatabase } from 'expo-sqlite';
import { CURRENT_SCHEMA_VERSION, MIGRATION_V1, MIGRATION_V2 } from './schema';

/**
 * Applies pending schema migrations in order, tracked via SQLite's built-in `user_version`
 * pragma. Add a new `if (version < N)` block (and bump CURRENT_SCHEMA_VERSION) for every future
 * schema change instead of editing an already-shipped migration.
 */
export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  if (version >= CURRENT_SCHEMA_VERSION) {
    return;
  }

  if (version < 1) {
    await db.execAsync(MIGRATION_V1);
    version = 1;
  }

  if (version < 2) {
    await db.execAsync(MIGRATION_V2);
    version = 2;
  }

  await db.execAsync(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
}
