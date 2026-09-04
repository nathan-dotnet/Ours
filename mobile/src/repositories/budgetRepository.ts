import { getDatabase } from '../database/db';
import { syncQueueRepository } from '../sync/syncQueue';
import type { BudgetPayload } from '../types/api';
import type { Budget } from '../types/entities';
import { apiAmountToCents, centsToApiAmount } from '../utils/money';
import { generateUuid } from '../utils/uuid';

export const BUDGET_ENTITY_TYPE = 'budget';

export interface BudgetInput {
  category: string;
  year: number;
  month: number;
  amountCents: number;
  currency: string;
}

function toPayload(input: BudgetInput): BudgetPayload {
  return { category: input.category, year: input.year, month: input.month, amount: centsToApiAmount(input.amountCents), currency: input.currency };
}

/** Repository for monthly category budgets — follows calendarEventRepository.ts's established shape. */
export const budgetRepository = {
  async getForMonth(coupleId: string, year: number, month: number): Promise<Budget[]> {
    const db = await getDatabase();
    return db.getAllAsync<Budget>(
      `SELECT * FROM budgets WHERE couple_id = ? AND year = ? AND month = ? AND is_deleted = 0 ORDER BY category ASC`,
      [coupleId, year, month],
    );
  },

  async getById(id: string): Promise<Budget | null> {
    const db = await getDatabase();
    return db.getFirstAsync<Budget>(`SELECT * FROM budgets WHERE id = ? AND is_deleted = 0`, [id]);
  },

  /** Offline-first create: writes SQLite immediately (device-generated id), then queues the sync op. */
  async createLocally(coupleId: string, input: BudgetInput, createdByUserId: string): Promise<Budget> {
    const db = await getDatabase();
    const id = generateUuid();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO budgets
         (id, couple_id, category, year, month, amount_cents, currency, created_by_user_id, created_at, updated_at, updated_by_user_id, version, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [id, coupleId, input.category, input.year, input.month, input.amountCents, input.currency, createdByUserId, now, now, createdByUserId],
    );

    await syncQueueRepository.enqueue(BUDGET_ENTITY_TYPE, id, 'CREATE', toPayload(input));

    return {
      id,
      couple_id: coupleId,
      category: input.category,
      year: input.year,
      month: input.month,
      amount_cents: input.amountCents,
      currency: input.currency,
      created_by_user_id: createdByUserId,
      created_at: now,
      updated_at: now,
      updated_by_user_id: createdByUserId,
      version: 1,
      is_deleted: 0,
    };
  },

  /** Offline-first edit: writes SQLite immediately, then queues the sync op. */
  async updateLocally(budget: Budget, input: BudgetInput, updatedByUserId: string): Promise<void> {
    const db = await getDatabase();
    const updatedAt = new Date().toISOString();

    await db.runAsync(
      `UPDATE budgets SET category = ?, year = ?, month = ?, amount_cents = ?, currency = ?, updated_at = ?, updated_by_user_id = ? WHERE id = ?`,
      [input.category, input.year, input.month, input.amountCents, input.currency, updatedAt, updatedByUserId, budget.id],
    );

    await syncQueueRepository.enqueue(BUDGET_ENTITY_TYPE, budget.id, 'UPDATE', toPayload(input));
  },

  /** Offline-first delete: removes the local row immediately, freeing up its category/month slot for a new budget. */
  async deleteLocally(budget: Budget): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM budgets WHERE id = ?`, [budget.id]);

    await syncQueueRepository.enqueue(BUDGET_ENTITY_TYPE, budget.id, 'DELETE', null);
  },

  /** Applies a "budget" change pulled from /api/sync/pull. May be entirely new to this device; a null payload means the server told us it was deleted. */
  async applyRemoteChange(
    coupleId: string,
    entityId: string,
    payload: BudgetPayload | null,
    updatedAt: string,
    updatedByUserId: string,
    version: number,
  ): Promise<void> {
    const db = await getDatabase();

    if (payload === null) {
      await db.runAsync(`DELETE FROM budgets WHERE id = ?`, [entityId]);
      return;
    }

    await db.runAsync(
      `INSERT INTO budgets
         (id, couple_id, category, year, month, amount_cents, currency, created_by_user_id, created_at, updated_at, updated_by_user_id, version, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET
         category = excluded.category,
         year = excluded.year,
         month = excluded.month,
         amount_cents = excluded.amount_cents,
         currency = excluded.currency,
         updated_at = excluded.updated_at,
         updated_by_user_id = excluded.updated_by_user_id,
         version = excluded.version,
         is_deleted = 0`,
      [
        entityId,
        coupleId,
        payload.category,
        payload.year,
        payload.month,
        apiAmountToCents(payload.amount),
        payload.currency,
        updatedByUserId,
        updatedAt,
        updatedAt,
        updatedByUserId,
        version,
      ],
    );
  },
};
