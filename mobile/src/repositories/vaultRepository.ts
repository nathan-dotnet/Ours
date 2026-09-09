import { getDatabase } from '../database/db';
import { syncQueueRepository } from '../sync/syncQueue';
import type { VaultItemPayload } from '../types/api';
import type { VaultItem } from '../types/entities';
import { generateUuid } from '../utils/uuid';

export const VAULT_ITEM_ENTITY_TYPE = 'vault_item';

export interface VaultItemInput {
  title: string;
  username: string | null;
  /** The new plaintext password — omit (or pass null) on an edit that isn't changing it, so the sync payload never re-sends/re-encrypts an unchanged password. Required when creating. */
  password?: string | null;
  websiteUrl: string | null;
  category: string;
  notes: string | null;
}

function toPayload(input: VaultItemInput): VaultItemPayload {
  return {
    title: input.title,
    username: input.username,
    password: input.password ?? null,
    websiteUrl: input.websiteUrl,
    category: input.category,
    notes: input.notes,
  };
}

/**
 * Repository for vault items — follows calendarEventRepository.ts's established shape, with one
 * deliberate difference: `createLocally`/`updateLocally` never write anything into
 * `encrypted_password`/`nonce`/`auth_tag`/`key_version` — this device has no way to compute them
 * (only the server holds the encryption key), so those columns stay NULL until the next
 * successful pull round-trips the server's own encrypted representation back down via
 * `applyRemoteChange`. Until then, the item is still fully visible/editable locally (title,
 * username, website, category, notes) — only its *password* isn't revealable yet, which is
 * consistent with reveal always requiring a round trip to the server anyway (see
 * services/api.ts's revealVaultPassword) — an item that hasn't synced yet simply doesn't exist
 * server-side for reveal to decrypt from regardless.
 */
export const vaultRepository = {
  async getAllForCouple(coupleId: string): Promise<VaultItem[]> {
    const db = await getDatabase();
    return db.getAllAsync<VaultItem>(`SELECT * FROM vault_items WHERE couple_id = ? AND is_deleted = 0 ORDER BY title COLLATE NOCASE ASC`, [
      coupleId,
    ]);
  },

  async getById(id: string): Promise<VaultItem | null> {
    const db = await getDatabase();
    return db.getFirstAsync<VaultItem>(`SELECT * FROM vault_items WHERE id = ? AND is_deleted = 0`, [id]);
  },

  /** Offline-first create: writes SQLite immediately (device-generated id), then queues the sync op. The plaintext password only ever exists in the payload passed to enqueue — never in this table. */
  async createLocally(coupleId: string, input: VaultItemInput, createdByUserId: string): Promise<VaultItem> {
    const db = await getDatabase();
    const id = generateUuid();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO vault_items
         (id, couple_id, title, username, encrypted_password, nonce, auth_tag, key_version, website_url, category, notes, created_by_user_id, created_at, updated_at, updated_by_user_id, version, is_deleted)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [id, coupleId, input.title, input.username, input.websiteUrl, input.category, input.notes, createdByUserId, now, now, createdByUserId],
    );

    await syncQueueRepository.enqueue(VAULT_ITEM_ENTITY_TYPE, id, 'CREATE', toPayload(input));

    return {
      id,
      couple_id: coupleId,
      title: input.title,
      username: input.username,
      encrypted_password: null,
      nonce: null,
      auth_tag: null,
      key_version: null,
      website_url: input.websiteUrl,
      category: input.category,
      notes: input.notes,
      created_by_user_id: createdByUserId,
      created_at: now,
      updated_at: now,
      updated_by_user_id: createdByUserId,
      version: 1,
      is_deleted: 0,
    };
  },

  /** Offline-first edit: writes SQLite immediately, then queues the sync op. Never touches the encrypted_password/nonce/auth_tag columns — those only ever change via applyRemoteChange. */
  async updateLocally(item: VaultItem, input: VaultItemInput, updatedByUserId: string): Promise<void> {
    const db = await getDatabase();
    const updatedAt = new Date().toISOString();

    await db.runAsync(
      `UPDATE vault_items SET title = ?, username = ?, website_url = ?, category = ?, notes = ?, updated_at = ?, updated_by_user_id = ? WHERE id = ?`,
      [input.title, input.username, input.websiteUrl, input.category, input.notes, updatedAt, updatedByUserId, item.id],
    );

    await syncQueueRepository.enqueue(VAULT_ITEM_ENTITY_TYPE, item.id, 'UPDATE', toPayload(input));
  },

  /** Offline-first delete: removes the local row immediately (SQLite is just this device's mirror; the sync_queue row remembers the deletion needs pushing). */
  async deleteLocally(item: VaultItem): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM vault_items WHERE id = ?`, [item.id]);

    await syncQueueRepository.enqueue(VAULT_ITEM_ENTITY_TYPE, item.id, 'DELETE', null);
  },

  /**
   * Applies a "vault_item" change pulled from /api/sync/pull. May be entirely new to this device
   * (the partner created it); a null payload means the server told us it was deleted. This is
   * the *only* place encrypted_password/nonce/auth_tag/key_version are ever written locally.
   */
  async applyRemoteChange(
    coupleId: string,
    entityId: string,
    payload: VaultItemPayload | null,
    updatedAt: string,
    updatedByUserId: string,
    version: number,
  ): Promise<void> {
    const db = await getDatabase();

    if (payload === null) {
      await db.runAsync(`DELETE FROM vault_items WHERE id = ?`, [entityId]);
      return;
    }

    await db.runAsync(
      `INSERT INTO vault_items
         (id, couple_id, title, username, encrypted_password, nonce, auth_tag, key_version, website_url, category, notes, created_by_user_id, created_at, updated_at, updated_by_user_id, version, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         username = excluded.username,
         encrypted_password = excluded.encrypted_password,
         nonce = excluded.nonce,
         auth_tag = excluded.auth_tag,
         key_version = excluded.key_version,
         website_url = excluded.website_url,
         category = excluded.category,
         notes = excluded.notes,
         updated_at = excluded.updated_at,
         updated_by_user_id = excluded.updated_by_user_id,
         version = excluded.version,
         is_deleted = 0`,
      [
        entityId,
        coupleId,
        payload.title,
        payload.username,
        payload.encryptedPassword ?? null,
        payload.nonce ?? null,
        payload.authTag ?? null,
        payload.keyVersion ?? null,
        payload.websiteUrl,
        payload.category,
        payload.notes,
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
