import type { SQLiteDatabase } from 'expo-sqlite';
import {
  CURRENT_SCHEMA_VERSION,
  MIGRATION_V1,
  MIGRATION_V2,
  MIGRATION_V3,
  MIGRATION_V4,
  MIGRATION_V5,
  MIGRATION_V6,
  MIGRATION_V7,
  MIGRATION_V8,
  MIGRATION_V9,
  MIGRATION_V10_ADD_COLUMNS,
  MIGRATION_V10_DROP_DUE_DAY,
} from './schema';

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

  if (version < 3) {
    await db.execAsync(MIGRATION_V3);
    version = 3;
  }

  if (version < 4) {
    await db.execAsync(MIGRATION_V4);
    version = 4;
  }

  if (version < 5) {
    await db.execAsync(MIGRATION_V5);
    version = 5;
  }

  if (version < 6) {
    await db.execAsync(MIGRATION_V6);
    version = 6;
  }

  if (version < 7) {
    await db.execAsync(MIGRATION_V7);
    version = 7;
  }

  if (version < 8) {
    await db.execAsync(MIGRATION_V8);
    version = 8;
  }

  if (version < 9) {
    await db.execAsync(MIGRATION_V9);
    version = 9;
  }

  if (version < 10) {
    // Unlike every migration above, this one needs a JS-side backfill step (SQLite has no
    // server-side date-arithmetic function to lean on) — see MIGRATION_V10_ADD_COLUMNS's own
    // doc comment. Best-effort, same as the backend's matching migration: due_day never recorded
    // which month installment 1 was due, so this anchors it to *this* month's occurrence of that
    // day (clamped to the 28th, always valid in every month).
    await db.execAsync(MIGRATION_V10_ADD_COLUMNS);
    const rows = await db.getAllAsync<{ id: string; due_day: number }>('SELECT id, due_day FROM loans');
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    for (const row of rows) {
      const day = String(Math.min(row.due_day, 28)).padStart(2, '0');
      await db.runAsync('UPDATE loans SET first_due_date = ? WHERE id = ?', [`${yearMonth}-${day}`, row.id]);
    }
    await db.execAsync(MIGRATION_V10_DROP_DUE_DAY);
    version = 10;
  }

  await db.execAsync(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
}
