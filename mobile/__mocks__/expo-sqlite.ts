// Jest manual mock for expo-sqlite (auto-applied by Jest for any `expo-sqlite` import in tests —
// see https://jestjs.io/docs/manual-mocks#mocking-node-modules). Rather than stubbing the SQL
// engine out entirely, this backs it with Node's built-in `node:sqlite`, so repository/sync
// tests run real SQL (our actual schema, real constraints, real query results) instead of
// asserting against a fake that might not behave like SQLite at all.
import { DatabaseSync } from 'node:sqlite';

export class SQLiteDatabase {
  private db: DatabaseSync;

  constructor() {
    this.db = new DatabaseSync(':memory:');
  }

  async execAsync(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async runAsync(sql: string, params: unknown[] = []): Promise<{ changes: number; lastInsertRowId: number }> {
    const result = this.db.prepare(sql).run(...(params as never[]));
    return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
  }

  async getFirstAsync<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    const row = this.db.prepare(sql).get(...(params as never[]));
    return (row as T) ?? null;
  }

  async getAllAsync<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...(params as never[])) as T[];
  }

  async withTransactionAsync(callback: () => Promise<void>): Promise<void> {
    this.db.exec('BEGIN');
    try {
      await callback();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

export async function openDatabaseAsync(_name: string): Promise<SQLiteDatabase> {
  return new SQLiteDatabase();
}
