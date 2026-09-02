import { getDatabase } from '../database/db';
import type { SyncOperation, SyncQueueRow } from '../types/entities';
import { generateUuid } from '../utils/uuid';

/**
 * Reusable sync_queue repository — every feature enqueues local changes here the same way,
 * regardless of entity type. This is the one piece every future feature (Phase 2+) reuses
 * as-is rather than building its own queue.
 */
export const syncQueueRepository = {
  /**
   * Queues a local change, collapsing it with any not-yet-synced op already queued for the
   * same entity so a burst of offline edits doesn't replay every intermediate state — only
   * the latest payload is ever pushed. See mergeOperation for the collapsing rules.
   */
  async enqueue(entityType: string, entityId: string, operation: SyncOperation, payload: unknown): Promise<void> {
    const db = await getDatabase();
    const existing = await db.getFirstAsync<SyncQueueRow>(
      `SELECT * FROM sync_queue WHERE entity_type = ? AND entity_id = ? AND status IN ('pending', 'failed') LIMIT 1`,
      [entityType, entityId],
    );

    if (!existing) {
      await db.runAsync(
        `INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload, created_at, retry_count, last_error, status)
         VALUES (?, ?, ?, ?, ?, ?, 0, NULL, 'pending')`,
        [generateUuid(), entityType, entityId, operation, JSON.stringify(payload), new Date().toISOString()],
      );
      return;
    }

    const merged = mergeOperation(existing.operation, operation);
    if (merged === null) {
      // A locally-created-then-deleted entity never reached the server — nothing to sync.
      await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, [existing.id]);
      return;
    }

    await db.runAsync(
      `UPDATE sync_queue SET operation = ?, payload = ?, created_at = ?, status = 'pending', last_error = NULL WHERE id = ?`,
      [merged, JSON.stringify(payload), new Date().toISOString(), existing.id],
    );
  },

  async getPending(): Promise<SyncQueueRow[]> {
    const db = await getDatabase();
    return db.getAllAsync<SyncQueueRow>(
      `SELECT * FROM sync_queue WHERE status IN ('pending', 'failed') ORDER BY created_at ASC`,
    );
  },

  async countPending(): Promise<number> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM sync_queue WHERE status IN ('pending', 'failed')`,
    );
    return row?.count ?? 0;
  },

  /** A successfully-synced op is removed outright — Phase 1 keeps no synced-item history. */
  async markSynced(id: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, [id]);
  },

  async markFailed(id: string, error: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE sync_queue SET status = 'failed', retry_count = retry_count + 1, last_error = ? WHERE id = ?`,
      [error, id],
    );
  },

  async clearAll(): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM sync_queue`);
  },
};

/** Returns the operation the collapsed row should carry, or null if the two cancel out entirely. */
function mergeOperation(existing: SyncOperation, incoming: SyncOperation): SyncOperation | null {
  if (existing === 'CREATE' && incoming === 'DELETE') return null;
  if (existing === 'CREATE') return 'CREATE'; // still unsynced-created; an UPDATE just changes its payload
  return incoming; // UPDATE+UPDATE, UPDATE+DELETE, DELETE+anything -> the newer op wins
}
