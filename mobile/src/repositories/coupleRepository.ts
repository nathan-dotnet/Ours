import { getDatabase } from '../database/db';
import { syncQueueRepository } from '../sync/syncQueue';
import type { CoupleDto, CoupleMemberDto } from '../types/api';
import type { Couple, CoupleMember } from '../types/entities';

export interface CoupleProfileEdit {
  nickname: string | null;
  anniversaryDate: string | null;
}

const COUPLE_PROFILE_ENTITY_TYPE = 'couple_profile';

/** Shared by upsertFromServer and applyRemoteProfileChange — both fully replace local membership from an authoritative server list. */
async function replaceLocalMembers(db: Awaited<ReturnType<typeof getDatabase>>, coupleId: string, members: CoupleMemberDto[]): Promise<void> {
  await db.runAsync(`DELETE FROM couple_members WHERE couple_id = ?`, [coupleId]);
  for (const member of members) {
    await db.runAsync(
      `INSERT INTO couple_members (id, couple_id, user_id, display_name, joined_at) VALUES (?, ?, ?, ?, ?)`,
      [`${coupleId}:${member.userId}`, coupleId, member.userId, member.displayName, member.joinedAt],
    );
  }
}

/**
 * Repository for the one Phase-1 feature table pair (couples/couple_members). The pattern
 * here — read/write SQLite directly, enqueue a sync_queue row for local writes, and expose a
 * separate "apply what the server just told us" path for pulled changes — is what every future
 * feature repository follows (see PHASE 2+ in the project README).
 */
export const coupleRepository = {
  async getLocalCouple(): Promise<Couple | null> {
    const db = await getDatabase();
    return db.getFirstAsync<Couple>(`SELECT * FROM couples WHERE is_deleted = 0 LIMIT 1`);
  },

  async getLocalMembers(coupleId: string): Promise<CoupleMember[]> {
    const db = await getDatabase();
    return db.getAllAsync<CoupleMember>(`SELECT * FROM couple_members WHERE couple_id = ? ORDER BY joined_at ASC`, [
      coupleId,
    ]);
  },

  /** Full replace from an authoritative server response (create/join/getMyCouple) — the server is the source of truth for membership. */
  async upsertFromServer(dto: CoupleDto): Promise<void> {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO couples (id, invite_code, nickname, anniversary_date, created_at, updated_at, updated_by_user_id, version, is_deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET
           invite_code = excluded.invite_code,
           nickname = excluded.nickname,
           anniversary_date = excluded.anniversary_date,
           updated_at = excluded.updated_at,
           updated_by_user_id = excluded.updated_by_user_id,
           version = excluded.version,
           is_deleted = 0`,
        [
          dto.id,
          dto.inviteCode,
          dto.nickname,
          dto.anniversaryDate,
          dto.updatedAt,
          dto.updatedAt,
          dto.updatedByUserId,
          dto.version,
        ],
      );

      await replaceLocalMembers(db, dto.id, dto.members);
    });
  },

  /**
   * Applies a "couple_profile" change pulled from /api/sync/pull. The server has already
   * resolved any conflict — this just mirrors its result.
   *
   * `payload.members`, when present, is what lets this device learn about a partner joining (or
   * the membership otherwise changing) at all — a join touches nothing this device could
   * otherwise push or poll for, so without replaying the server's member list here, a device
   * that's waiting for a partner would stay stuck showing no partner even after one had actually
   * joined. See SyncService.PullAsync (backend) for where `members` gets populated.
   */
  async applyRemoteProfileChange(
    coupleId: string,
    payload: { nickname: string | null; anniversaryDate: string | null; members?: CoupleMemberDto[] } | null,
    updatedAt: string,
    updatedByUserId: string,
    version: number,
  ): Promise<void> {
    const db = await getDatabase();
    if (payload === null) {
      // A null payload is the couple ending (see SyncService.LeaveAsync on the backend) — not
      // just an ordinary field-level update, so it gets the full local cleanup rather than a
      // plain field update.
      await coupleRepository.removeLocalCoupleAndData(coupleId);
      return;
    }
    await db.runAsync(
      `UPDATE couples SET nickname = ?, anniversary_date = ?, updated_at = ?, updated_by_user_id = ?, version = ? WHERE id = ?`,
      [payload.nickname, payload.anniversaryDate, updatedAt, updatedByUserId, version, coupleId],
    );
    if (payload.members) {
      await replaceLocalMembers(db, coupleId, payload.members);
    }
  },

  /**
   * Removes every local trace of a couple that has ended — called both right after this
   * device's own successful "leave couple" call, and when a sync pull delivers a couple_profile
   * tombstone (the partner ended it instead). Discards any not-yet-synced sync_queue entry for
   * the couple's data too: without this, a pending offline edit/create from before the couple
   * ended could otherwise get pushed under whatever couple this device joins/creates next, since
   * the server derives a push's couple from the *current* token, not from whenever the change
   * was originally queued.
   *
   * Not a soft-delete: unlike the server (which keeps an IsDeleted row so a pull can tell a
   * partner's device the couple is gone), there's nothing else locally that needs to see a
   * tombstone — a new couple always gets a fresh id, so nothing can ever collide with what's
   * removed here.
   */
  async removeLocalCoupleAndData(coupleId: string): Promise<void> {
    const db = await getDatabase();

    // Future couple-scoped local tables need a line here too.
    const events = await db.getAllAsync<{ id: string }>(`SELECT id FROM calendar_events WHERE couple_id = ?`, [coupleId]);
    const accounts = await db.getAllAsync<{ id: string }>(`SELECT id FROM accounts WHERE couple_id = ?`, [coupleId]);
    const transactions = await db.getAllAsync<{ id: string }>(`SELECT id FROM money_transactions WHERE couple_id = ?`, [coupleId]);
    const budgets = await db.getAllAsync<{ id: string }>(`SELECT id FROM budgets WHERE couple_id = ?`, [coupleId]);
    const vaultItems = await db.getAllAsync<{ id: string }>(`SELECT id FROM vault_items WHERE couple_id = ?`, [coupleId]);
    const queuedEntityIds = [
      coupleId,
      ...events.map((e) => e.id),
      ...accounts.map((a) => a.id),
      ...transactions.map((t) => t.id),
      ...budgets.map((b) => b.id),
      ...vaultItems.map((v) => v.id),
    ];

    await db.withTransactionAsync(async () => {
      for (const entityId of queuedEntityIds) {
        await db.runAsync(`DELETE FROM sync_queue WHERE entity_id = ?`, [entityId]);
      }
      await db.runAsync(`DELETE FROM couples WHERE id = ?`, [coupleId]);
      await db.runAsync(`DELETE FROM couple_members WHERE couple_id = ?`, [coupleId]);
      await db.runAsync(`DELETE FROM calendar_events WHERE couple_id = ?`, [coupleId]);
      // Transactions before accounts — no FK enforcement in SQLite here, but it keeps the order
      // logically "history first, then what it referenced", matching the backend's own ordering.
      await db.runAsync(`DELETE FROM money_transactions WHERE couple_id = ?`, [coupleId]);
      await db.runAsync(`DELETE FROM accounts WHERE couple_id = ?`, [coupleId]);
      await db.runAsync(`DELETE FROM budgets WHERE couple_id = ?`, [coupleId]);
      await db.runAsync(`DELETE FROM vault_items WHERE couple_id = ?`, [coupleId]);
    });
  },

  /**
   * The offline-first write path for editing shared couple details: update SQLite immediately
   * (so the UI reflects it right away), then queue the change for the sync engine — whether or
   * not the device is online right now.
   */
  async updateProfileLocally(couple: Couple, edit: CoupleProfileEdit, updatedByUserId: string): Promise<void> {
    const db = await getDatabase();
    const updatedAt = new Date().toISOString();
    await db.runAsync(
      `UPDATE couples SET nickname = ?, anniversary_date = ?, updated_at = ?, updated_by_user_id = ? WHERE id = ?`,
      [edit.nickname, edit.anniversaryDate, updatedAt, updatedByUserId, couple.id],
    );

    // The queue row's own created_at (refreshed by enqueue's collapsing logic below) doubles as
    // clientUpdatedAt when this gets pushed — no need to duplicate the timestamp into the payload.
    await syncQueueRepository.enqueue(COUPLE_PROFILE_ENTITY_TYPE, couple.id, 'UPDATE', {
      nickname: edit.nickname,
      anniversaryDate: edit.anniversaryDate,
    });
  },
};

export { COUPLE_PROFILE_ENTITY_TYPE };
