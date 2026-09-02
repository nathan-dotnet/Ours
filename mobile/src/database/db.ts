import * as SQLite from 'expo-sqlite';
import { migrateDatabase } from './migrations';

const DATABASE_NAME = 'ours.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Lazily opens (and migrates) the single shared SQLite connection, caching the in-flight
 * promise so concurrent callers all await the same initialization instead of racing to open
 * the file. Plain module-level singleton rather than a React context, so repositories and the
 * sync engine can use it identically whether or not a component tree is involved.
 */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (db) => {
      await migrateDatabase(db);
      return db;
    });
  }
  return dbPromise;
}

/** Test/dev-only escape hatch to force a fresh connection (e.g. between test cases). */
export function resetDatabaseHandleForTests(): void {
  dbPromise = null;
}
