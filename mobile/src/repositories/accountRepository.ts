import { getDatabase } from '../database/db';
import { syncQueueRepository } from '../sync/syncQueue';
import type { AccountPayload } from '../types/api';
import type { Account } from '../types/entities';
import { apiAmountToCents, centsToApiAmount } from '../utils/money';
import { generateUuid } from '../utils/uuid';

export const ACCOUNT_ENTITY_TYPE = 'account';

export interface AccountInput {
  name: string;
  type: string;
  icon: string;
  currency: string;
  isActive: boolean;
}

/**
 * Repository for accounts — follows calendarEventRepository.ts's established shape, with two
 * differences that follow directly from the Money System's design (see the Phase 3 spec):
 *  - openingBalanceCents is accepted only by createLocally, never updateLocally — an account's
 *    opening balance is fixed forever once created (see MoneyCalculator); "editing" an account
 *    can only ever change Name/Type/Icon/Currency/IsActive.
 *  - there is no deleteLocally — deactivate (isActive: false, via updateLocally) is the only way
 *    to retire an account, since a partner's historical transactions may still reference it.
 */
export const accountRepository = {
  async getAllForCouple(coupleId: string): Promise<Account[]> {
    const db = await getDatabase();
    return db.getAllAsync<Account>(`SELECT * FROM accounts WHERE couple_id = ? AND is_deleted = 0 ORDER BY created_at ASC`, [coupleId]);
  },

  async getActiveForCouple(coupleId: string): Promise<Account[]> {
    const db = await getDatabase();
    return db.getAllAsync<Account>(
      `SELECT * FROM accounts WHERE couple_id = ? AND is_deleted = 0 AND is_active = 1 ORDER BY created_at ASC`,
      [coupleId],
    );
  },

  async getById(id: string): Promise<Account | null> {
    const db = await getDatabase();
    return db.getFirstAsync<Account>(`SELECT * FROM accounts WHERE id = ? AND is_deleted = 0`, [id]);
  },

  /** Offline-first create: writes SQLite immediately (device-generated id), then queues the sync op. The opening balance is set here and nowhere else, ever. */
  async createLocally(coupleId: string, input: AccountInput, openingBalanceCents: number, createdByUserId: string): Promise<Account> {
    const db = await getDatabase();
    const id = generateUuid();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO accounts
         (id, couple_id, name, type, icon, opening_balance_cents, currency, is_active, created_by_user_id, created_at, updated_at, updated_by_user_id, version, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [id, coupleId, input.name, input.type, input.icon, openingBalanceCents, input.currency, input.isActive ? 1 : 0, createdByUserId, now, now, createdByUserId],
    );

    await syncQueueRepository.enqueue(ACCOUNT_ENTITY_TYPE, id, 'CREATE', {
      name: input.name,
      type: input.type,
      icon: input.icon,
      openingBalance: centsToApiAmount(openingBalanceCents),
      currency: input.currency,
      isActive: input.isActive,
    } satisfies AccountPayload);

    return {
      id,
      couple_id: coupleId,
      name: input.name,
      type: input.type,
      icon: input.icon,
      opening_balance_cents: openingBalanceCents,
      currency: input.currency,
      is_active: input.isActive ? 1 : 0,
      created_by_user_id: createdByUserId,
      created_at: now,
      updated_at: now,
      updated_by_user_id: createdByUserId,
      version: 1,
      is_deleted: 0,
    };
  },

  /** Offline-first edit: writes SQLite immediately, then queues the sync op. Never touches opening_balance_cents. */
  async updateLocally(account: Account, input: AccountInput, updatedByUserId: string): Promise<void> {
    const db = await getDatabase();
    const updatedAt = new Date().toISOString();

    await db.runAsync(
      `UPDATE accounts SET name = ?, type = ?, icon = ?, currency = ?, is_active = ?, updated_at = ?, updated_by_user_id = ? WHERE id = ?`,
      [input.name, input.type, input.icon, input.currency, input.isActive ? 1 : 0, updatedAt, updatedByUserId, account.id],
    );

    await syncQueueRepository.enqueue(ACCOUNT_ENTITY_TYPE, account.id, 'UPDATE', {
      name: input.name,
      type: input.type,
      icon: input.icon,
      openingBalance: centsToApiAmount(account.opening_balance_cents), // carried along, but never applied server-side after creation
      currency: input.currency,
      isActive: input.isActive,
    } satisfies AccountPayload);
  },

  /** Applies an "account" change pulled from /api/sync/pull. Always an upsert — the server never sends a delete for an account (see SyncService.ApplyAccountChangeAsync). */
  async applyRemoteChange(
    coupleId: string,
    entityId: string,
    payload: AccountPayload,
    updatedAt: string,
    updatedByUserId: string,
    version: number,
  ): Promise<void> {
    const db = await getDatabase();
    const existing = await db.getFirstAsync<{ id: string }>(`SELECT id FROM accounts WHERE id = ?`, [entityId]);

    if (existing) {
      await db.runAsync(
        `UPDATE accounts SET name = ?, type = ?, icon = ?, currency = ?, is_active = ?, updated_at = ?, updated_by_user_id = ?, version = ? WHERE id = ?`,
        [payload.name, payload.type, payload.icon, payload.currency, payload.isActive ? 1 : 0, updatedAt, updatedByUserId, version, entityId],
      );
      return;
    }

    // New to this device (the partner created it) — openingBalance only ever gets set here, on
    // first insert, exactly like createLocally.
    await db.runAsync(
      `INSERT INTO accounts
         (id, couple_id, name, type, icon, opening_balance_cents, currency, is_active, created_by_user_id, created_at, updated_at, updated_by_user_id, version, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        entityId,
        coupleId,
        payload.name,
        payload.type,
        payload.icon,
        apiAmountToCents(payload.openingBalance),
        payload.currency,
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
