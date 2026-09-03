import { getDatabase } from '../database/db';
import { syncQueueRepository } from '../sync/syncQueue';
import type { ExpensePayload } from '../types/api';
import type { Expense } from '../types/entities';
import { apiAmountToCents, centsToApiAmount } from '../utils/money';
import { generateUuid } from '../utils/uuid';

export const EXPENSE_ENTITY_TYPE = 'expense';

export interface ExpenseInput {
  amountCents: number;
  currency: string;
  description: string | null;
  category: string;
  expenseDate: string; // ISO date (YYYY-MM-DD)
  notes: string | null;
  paidByUserId?: string | null;
}

function toPayload(input: ExpenseInput): ExpensePayload {
  return {
    amount: centsToApiAmount(input.amountCents),
    currency: input.currency,
    description: input.description,
    category: input.category,
    expenseDate: input.expenseDate,
    notes: input.notes,
    paidByUserId: input.paidByUserId ?? null,
  };
}

/**
 * Repository for expenses — follows calendarEventRepository.ts's shape exactly (see that file's
 * doc comment for the pattern this and every synced-feature repository share). The one field
 * needing special handling is money: SQLite has no exact decimal type, so `amount_cents` is
 * stored as a plain INTEGER and only ever converted to/from the wire's decimal representation at
 * the repository boundary (see utils/money.ts) — nothing in between (queries, totals, the UI
 * list) ever does floating-point arithmetic on it.
 */
export const expenseRepository = {
  async getAllForCouple(coupleId: string): Promise<Expense[]> {
    const db = await getDatabase();
    return db.getAllAsync<Expense>(
      `SELECT * FROM expenses WHERE couple_id = ? AND is_deleted = 0 ORDER BY expense_date DESC, created_at DESC`,
      [coupleId],
    );
  },

  /** Expenses for one calendar month (year/month are both 0-indexed-free — month is 1-12), scoped to the active couple. */
  async getForMonth(coupleId: string, year: number, month: number): Promise<Expense[]> {
    const db = await getDatabase();
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return db.getAllAsync<Expense>(
      `SELECT * FROM expenses WHERE couple_id = ? AND is_deleted = 0 AND expense_date LIKE ? ORDER BY expense_date DESC, created_at DESC`,
      [coupleId, `${prefix}-%`],
    );
  },

  async getById(id: string): Promise<Expense | null> {
    const db = await getDatabase();
    return db.getFirstAsync<Expense>(`SELECT * FROM expenses WHERE id = ? AND is_deleted = 0`, [id]);
  },

  /** Offline-first create: writes SQLite immediately (device-generated id), then queues the sync op. */
  async createLocally(coupleId: string, input: ExpenseInput, createdByUserId: string): Promise<Expense> {
    const db = await getDatabase();
    const id = generateUuid();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO expenses
         (id, couple_id, amount_cents, currency, description, category, expense_date, notes, paid_by_user_id, created_by_user_id, created_at, updated_at, updated_by_user_id, version, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        id,
        coupleId,
        input.amountCents,
        input.currency,
        input.description,
        input.category,
        input.expenseDate,
        input.notes,
        input.paidByUserId ?? null,
        createdByUserId,
        now,
        now,
        createdByUserId,
      ],
    );

    await syncQueueRepository.enqueue(EXPENSE_ENTITY_TYPE, id, 'CREATE', toPayload(input));

    return {
      id,
      couple_id: coupleId,
      amount_cents: input.amountCents,
      currency: input.currency,
      description: input.description,
      category: input.category,
      expense_date: input.expenseDate,
      notes: input.notes,
      paid_by_user_id: input.paidByUserId ?? null,
      created_by_user_id: createdByUserId,
      created_at: now,
      updated_at: now,
      updated_by_user_id: createdByUserId,
      version: 1,
      is_deleted: 0,
    };
  },

  /** Offline-first edit: writes SQLite immediately, then queues the sync op. */
  async updateLocally(expense: Expense, input: ExpenseInput, updatedByUserId: string): Promise<void> {
    const db = await getDatabase();
    const updatedAt = new Date().toISOString();

    await db.runAsync(
      `UPDATE expenses
       SET amount_cents = ?, currency = ?, description = ?, category = ?, expense_date = ?, notes = ?, paid_by_user_id = ?, updated_at = ?, updated_by_user_id = ?
       WHERE id = ?`,
      [
        input.amountCents,
        input.currency,
        input.description,
        input.category,
        input.expenseDate,
        input.notes,
        input.paidByUserId ?? null,
        updatedAt,
        updatedByUserId,
        expense.id,
      ],
    );

    await syncQueueRepository.enqueue(EXPENSE_ENTITY_TYPE, expense.id, 'UPDATE', toPayload(input));
  },

  /**
   * Offline-first delete: removes the local row immediately (SQLite is just this device's
   * mirror — the sync_queue row, not this table, is what remembers the deletion needs pushing).
   */
  async deleteLocally(expense: Expense): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM expenses WHERE id = ?`, [expense.id]);

    await syncQueueRepository.enqueue(EXPENSE_ENTITY_TYPE, expense.id, 'DELETE', null);
  },

  /**
   * Applies an "expense" change pulled from /api/sync/pull. May be entirely new to this device
   * (the partner created it), so this upserts rather than assuming a row already exists; a null
   * payload means the server told us it was deleted.
   */
  async applyRemoteChange(
    coupleId: string,
    entityId: string,
    payload: ExpensePayload | null,
    updatedAt: string,
    updatedByUserId: string,
    version: number,
  ): Promise<void> {
    const db = await getDatabase();

    if (payload === null) {
      await db.runAsync(`DELETE FROM expenses WHERE id = ?`, [entityId]);
      return;
    }

    await db.runAsync(
      `INSERT INTO expenses
         (id, couple_id, amount_cents, currency, description, category, expense_date, notes, paid_by_user_id, created_by_user_id, created_at, updated_at, updated_by_user_id, version, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET
         amount_cents = excluded.amount_cents,
         currency = excluded.currency,
         description = excluded.description,
         category = excluded.category,
         expense_date = excluded.expense_date,
         notes = excluded.notes,
         paid_by_user_id = excluded.paid_by_user_id,
         updated_at = excluded.updated_at,
         updated_by_user_id = excluded.updated_by_user_id,
         version = excluded.version,
         is_deleted = 0`,
      [
        entityId,
        coupleId,
        apiAmountToCents(payload.amount),
        payload.currency,
        payload.description,
        payload.category,
        payload.expenseDate,
        payload.notes,
        payload.paidByUserId ?? null,
        // The server always sets this on a pulled change; falling back to updatedByUserId would
        // only ever matter if that contract were ever violated.
        payload.createdByUserId ?? updatedByUserId,
        updatedAt,
        updatedAt,
        updatedByUserId,
        version,
      ],
    );
  },
};
