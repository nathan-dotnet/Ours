import { getDatabase } from '../database/db';
import { syncQueueRepository } from '../sync/syncQueue';
import type { SavingsGoalPayload } from '../types/api';
import type { SavingsGoal } from '../types/entities';
import { apiAmountToCents, centsToApiAmount } from '../utils/money';
import { generateUuid } from '../utils/uuid';

export const SAVINGS_GOAL_ENTITY_TYPE = 'savings_goal';

export interface SavingsGoalInput {
  name: string;
  targetAmountCents: number;
  currency: string;
  /** This goal's share (0-100) of the monthly Savings allocation during "Distribute Money" — null/0 means manual-only. */
  allocationPercent?: number | null;
  isActive: boolean;
}

function toPayload(input: SavingsGoalInput): SavingsGoalPayload {
  return {
    name: input.name,
    targetAmount: centsToApiAmount(input.targetAmountCents),
    currency: input.currency,
    allocationPercent: input.allocationPercent ?? null,
    isActive: input.isActive,
  };
}

/** Repository for savings goals — follows budgetRepository.ts's established shape exactly. */
export const savingsGoalRepository = {
  async getAllForCouple(coupleId: string): Promise<SavingsGoal[]> {
    const db = await getDatabase();
    return db.getAllAsync<SavingsGoal>(
      `SELECT * FROM savings_goals WHERE couple_id = ? AND is_deleted = 0 ORDER BY created_at ASC`,
      [coupleId],
    );
  },

  async getById(id: string): Promise<SavingsGoal | null> {
    const db = await getDatabase();
    return db.getFirstAsync<SavingsGoal>(`SELECT * FROM savings_goals WHERE id = ? AND is_deleted = 0`, [id]);
  },

  /** Offline-first create: writes SQLite immediately (device-generated id), then queues the sync op. */
  async createLocally(coupleId: string, input: SavingsGoalInput, createdByUserId: string): Promise<SavingsGoal> {
    const db = await getDatabase();
    const id = generateUuid();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO savings_goals
         (id, couple_id, name, target_amount_cents, currency, allocation_percent, is_active, created_by_user_id, created_at, updated_at, updated_by_user_id, version, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        id,
        coupleId,
        input.name,
        input.targetAmountCents,
        input.currency,
        input.allocationPercent ?? null,
        input.isActive ? 1 : 0,
        createdByUserId,
        now,
        now,
        createdByUserId,
      ],
    );

    await syncQueueRepository.enqueue(SAVINGS_GOAL_ENTITY_TYPE, id, 'CREATE', toPayload(input));

    return {
      id,
      couple_id: coupleId,
      name: input.name,
      target_amount_cents: input.targetAmountCents,
      currency: input.currency,
      allocation_percent: input.allocationPercent ?? null,
      is_active: input.isActive ? 1 : 0,
      created_by_user_id: createdByUserId,
      created_at: now,
      updated_at: now,
      updated_by_user_id: createdByUserId,
      version: 1,
      is_deleted: 0,
    };
  },

  /** Offline-first edit: writes SQLite immediately, then queues the sync op. */
  async updateLocally(goal: SavingsGoal, input: SavingsGoalInput, updatedByUserId: string): Promise<void> {
    const db = await getDatabase();
    const updatedAt = new Date().toISOString();

    await db.runAsync(
      `UPDATE savings_goals SET name = ?, target_amount_cents = ?, currency = ?, allocation_percent = ?, is_active = ?, updated_at = ?, updated_by_user_id = ? WHERE id = ?`,
      [input.name, input.targetAmountCents, input.currency, input.allocationPercent ?? null, input.isActive ? 1 : 0, updatedAt, updatedByUserId, goal.id],
    );

    await syncQueueRepository.enqueue(SAVINGS_GOAL_ENTITY_TYPE, goal.id, 'UPDATE', toPayload(input));
  },

  /** Offline-first delete: removes the local row immediately, freeing this device's view for a re-create if the user changes their mind. */
  async deleteLocally(goal: SavingsGoal): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM savings_goals WHERE id = ?`, [goal.id]);

    await syncQueueRepository.enqueue(SAVINGS_GOAL_ENTITY_TYPE, goal.id, 'DELETE', null);
  },

  /** Applies a "savings_goal" change pulled from /api/sync/pull. May be entirely new to this device; a null payload means the server told us it was deleted. */
  async applyRemoteChange(
    coupleId: string,
    entityId: string,
    payload: SavingsGoalPayload | null,
    updatedAt: string,
    updatedByUserId: string,
    version: number,
  ): Promise<void> {
    const db = await getDatabase();

    if (payload === null) {
      await db.runAsync(`DELETE FROM savings_goals WHERE id = ?`, [entityId]);
      return;
    }

    await db.runAsync(
      `INSERT INTO savings_goals
         (id, couple_id, name, target_amount_cents, currency, allocation_percent, is_active, created_by_user_id, created_at, updated_at, updated_by_user_id, version, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         target_amount_cents = excluded.target_amount_cents,
         currency = excluded.currency,
         allocation_percent = excluded.allocation_percent,
         is_active = excluded.is_active,
         updated_at = excluded.updated_at,
         updated_by_user_id = excluded.updated_by_user_id,
         version = excluded.version,
         is_deleted = 0`,
      [
        entityId,
        coupleId,
        payload.name,
        apiAmountToCents(payload.targetAmount),
        payload.currency,
        payload.allocationPercent ?? null,
        payload.isActive ? 1 : 0,
        updatedByUserId,
        updatedAt,
        updatedAt,
        updatedByUserId,
        version,
      ],
    );
  },
};
