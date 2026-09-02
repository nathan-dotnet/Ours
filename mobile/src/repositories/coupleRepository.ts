import { getDatabase } from '../database/db';
import { syncQueueRepository } from '../sync/syncQueue';
import type { CoupleDto } from '../types/api';
import type { Couple, CoupleMember } from '../types/entities';

export interface CoupleProfileEdit {
  nickname: string | null;
  anniversaryDate: string | null;
}

const COUPLE_PROFILE_ENTITY_TYPE = 'couple_profile';

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

      await db.runAsync(`DELETE FROM couple_members WHERE couple_id = ?`, [dto.id]);
      for (const member of dto.members) {
        await db.runAsync(
          `INSERT INTO couple_members (id, couple_id, user_id, display_name, joined_at) VALUES (?, ?, ?, ?, ?)`,
          [`${dto.id}:${member.userId}`, dto.id, member.userId, member.displayName, member.joinedAt],
        );
      }
    });
  },

  /** Applies a "couple_profile" change pulled from /api/sync/pull. The server has already resolved any conflict — this just mirrors its result. */
  async applyRemoteProfileChange(
    coupleId: string,
    payload: { nickname: string | null; anniversaryDate: string | null } | null,
    updatedAt: string,
    updatedByUserId: string,
    version: number,
  ): Promise<void> {
    const db = await getDatabase();
    if (payload === null) {
      await db.runAsync(`UPDATE couples SET is_deleted = 1, updated_at = ?, updated_by_user_id = ?, version = ? WHERE id = ?`, [
        updatedAt,
        updatedByUserId,
        version,
        coupleId,
      ]);
      return;
    }
    await db.runAsync(
      `UPDATE couples SET nickname = ?, anniversary_date = ?, updated_at = ?, updated_by_user_id = ?, version = ? WHERE id = ?`,
      [payload.nickname, payload.anniversaryDate, updatedAt, updatedByUserId, version, coupleId],
    );
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
