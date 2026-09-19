import { getDatabase } from '../database/db';
import { syncQueueRepository } from '../sync/syncQueue';
import type { CoupleDto, CoupleMemberDto, MemberWantsAllocationInput } from '../types/api';
import type { Couple, CoupleMember } from '../types/entities';
import { apiAmountToCents, centsToApiAmount } from '../utils/money';

/** One member's Wants share to save, as edited from the Calculator — see CoupleProfileEdit.memberWantsAllocations. */
export interface MemberWantsAllocationEdit {
  userId: string;
  wantsAllocationPercent: number | null;
  wantsAccountId: string | null;
}

export interface CoupleProfileEdit {
  nickname: string | null;
  anniversaryDate: string | null;
  /** The couple's saved default income-allocation plan (see the Money Calculator) — all five null until saved once. */
  budgetAllocationPercent: number | null;
  savingsAllocationPercent: number | null;
  wantsAllocationPercent: number | null;
  budgetAccountId: string | null;
  savingsAccountId: string | null;
  /**
   * The caller's own income to save (integer cents) — omit entirely to leave it unchanged.
   * Every couple_profile push is a full-payload replace (same as nickname/anniversaryDate), so
   * updateProfileLocally reads the caller's current value itself when this is omitted, rather
   * than risk silently clearing it just because a caller only meant to edit the nickname.
   */
  myMonthlyIncomeCents?: number | null;
  /**
   * The couple's Wants split between its members (Mine/Hers — see the Money Calculator) —
   * unlike myMonthlyIncomeCents this is NOT self-scoped: either partner's device can set
   * either/both members' share and account here in one action. Omit entirely to leave every
   * member's Wants share unchanged.
   */
  memberWantsAllocations?: MemberWantsAllocationEdit[];
}

const COUPLE_PROFILE_ENTITY_TYPE = 'couple_profile';

/** Shared by upsertFromServer and applyRemoteProfileChange — both fully replace local membership from an authoritative server list. */
async function replaceLocalMembers(db: Awaited<ReturnType<typeof getDatabase>>, coupleId: string, members: CoupleMemberDto[]): Promise<void> {
  await db.runAsync(`DELETE FROM couple_members WHERE couple_id = ?`, [coupleId]);
  for (const member of members) {
    await db.runAsync(
      `INSERT INTO couple_members (id, couple_id, user_id, display_name, joined_at, monthly_income_cents, wants_allocation_percent, wants_account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `${coupleId}:${member.userId}`,
        coupleId,
        member.userId,
        member.displayName,
        member.joinedAt,
        apiAmountToCentsOrNull(member.monthlyIncome),
        member.wantsAllocationPercent,
        member.wantsAccountId,
      ],
    );
  }
}

function apiAmountToCentsOrNull(amount: number | null): number | null {
  return amount === null ? null : apiAmountToCents(amount);
}

function centsToApiAmountOrNull(cents: number | null): number | null {
  return cents === null ? null : centsToApiAmount(cents);
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
        `INSERT INTO couples
           (id, invite_code, nickname, anniversary_date, budget_allocation_percent, savings_allocation_percent, wants_allocation_percent, budget_account_id, savings_account_id, created_at, updated_at, updated_by_user_id, version, is_deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET
           invite_code = excluded.invite_code,
           nickname = excluded.nickname,
           anniversary_date = excluded.anniversary_date,
           budget_allocation_percent = excluded.budget_allocation_percent,
           savings_allocation_percent = excluded.savings_allocation_percent,
           wants_allocation_percent = excluded.wants_allocation_percent,
           budget_account_id = excluded.budget_account_id,
           savings_account_id = excluded.savings_account_id,
           updated_at = excluded.updated_at,
           updated_by_user_id = excluded.updated_by_user_id,
           version = excluded.version,
           is_deleted = 0`,
        [
          dto.id,
          dto.inviteCode,
          dto.nickname,
          dto.anniversaryDate,
          dto.budgetAllocationPercent,
          dto.savingsAllocationPercent,
          dto.wantsAllocationPercent,
          dto.budgetAccountId,
          dto.savingsAccountId,
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
   * joined. See SyncService.PullAsync (backend) for where `members` gets populated. Each
   * member's own Wants share/account rides along in that same list — see CoupleMemberDto — never
   * as a separate couple-level field, since Wants has no pooled account of its own.
   */
  async applyRemoteProfileChange(
    coupleId: string,
    payload: {
      nickname: string | null;
      anniversaryDate: string | null;
      budgetAllocationPercent?: number | null;
      savingsAllocationPercent?: number | null;
      wantsAllocationPercent?: number | null;
      budgetAccountId?: string | null;
      savingsAccountId?: string | null;
      members?: CoupleMemberDto[];
    } | null,
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
      `UPDATE couples SET
         nickname = ?, anniversary_date = ?,
         budget_allocation_percent = ?, savings_allocation_percent = ?, wants_allocation_percent = ?,
         budget_account_id = ?, savings_account_id = ?,
         updated_at = ?, updated_by_user_id = ?, version = ?
       WHERE id = ?`,
      [
        payload.nickname,
        payload.anniversaryDate,
        payload.budgetAllocationPercent ?? null,
        payload.savingsAllocationPercent ?? null,
        payload.wantsAllocationPercent ?? null,
        payload.budgetAccountId ?? null,
        payload.savingsAccountId ?? null,
        updatedAt,
        updatedByUserId,
        version,
        coupleId,
      ],
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
    const savingsGoals = await db.getAllAsync<{ id: string }>(`SELECT id FROM savings_goals WHERE couple_id = ?`, [coupleId]);
    const vaultItems = await db.getAllAsync<{ id: string }>(`SELECT id FROM vault_items WHERE couple_id = ?`, [coupleId]);
    const queuedEntityIds = [
      coupleId,
      ...events.map((e) => e.id),
      ...accounts.map((a) => a.id),
      ...transactions.map((t) => t.id),
      ...budgets.map((b) => b.id),
      ...savingsGoals.map((g) => g.id),
      ...vaultItems.map((v) => v.id),
    ];

    await db.withTransactionAsync(async () => {
      for (const entityId of queuedEntityIds) {
        await db.runAsync(`DELETE FROM sync_queue WHERE entity_id = ?`, [entityId]);
      }
      await db.runAsync(`DELETE FROM couples WHERE id = ?`, [coupleId]);
      await db.runAsync(`DELETE FROM couple_members WHERE couple_id = ?`, [coupleId]);
      await db.runAsync(`DELETE FROM calendar_events WHERE couple_id = ?`, [coupleId]);
      // Transactions before accounts/goals — no FK enforcement in SQLite here, but it keeps the
      // order logically "history first, then what it referenced", matching the backend's own ordering.
      await db.runAsync(`DELETE FROM money_transactions WHERE couple_id = ?`, [coupleId]);
      await db.runAsync(`DELETE FROM accounts WHERE couple_id = ?`, [coupleId]);
      await db.runAsync(`DELETE FROM budgets WHERE couple_id = ?`, [coupleId]);
      await db.runAsync(`DELETE FROM savings_goals WHERE couple_id = ?`, [coupleId]);
      await db.runAsync(`DELETE FROM vault_items WHERE couple_id = ?`, [coupleId]);
    });
  },

  /**
   * The offline-first write path for editing shared couple details: update SQLite immediately
   * (so the UI reflects it right away), then queue the change for the sync engine — whether or
   * not the device is online right now. Used both by Settings' nickname/anniversary form and the
   * Calculator's "save my allocation"/"save Wants split" actions — every caller must pass the
   * couple's *current* values for whichever fields it isn't changing, since a couple_profile push
   * is a full replace, not a patch (same discipline as the backend's own
   * ApplyCoupleProfileChangeAsync). `edit.memberWantsAllocations`, when present, is the one
   * exception to "full replace": only the members it lists are touched, so one partner can save
   * just their own share without having to already know the other's.
   */
  async updateProfileLocally(couple: Couple, edit: CoupleProfileEdit, updatedByUserId: string): Promise<void> {
    const db = await getDatabase();
    const updatedAt = new Date().toISOString();

    await db.runAsync(
      `UPDATE couples SET
         nickname = ?, anniversary_date = ?,
         budget_allocation_percent = ?, savings_allocation_percent = ?, wants_allocation_percent = ?,
         budget_account_id = ?, savings_account_id = ?,
         updated_at = ?, updated_by_user_id = ?
       WHERE id = ?`,
      [
        edit.nickname,
        edit.anniversaryDate,
        edit.budgetAllocationPercent,
        edit.savingsAllocationPercent,
        edit.wantsAllocationPercent,
        edit.budgetAccountId,
        edit.savingsAccountId,
        updatedAt,
        updatedByUserId,
        couple.id,
      ],
    );

    let myMonthlyIncomeCents = edit.myMonthlyIncomeCents;
    if (myMonthlyIncomeCents === undefined) {
      const member = await db.getFirstAsync<{ monthly_income_cents: number | null }>(
        `SELECT monthly_income_cents FROM couple_members WHERE couple_id = ? AND user_id = ?`,
        [couple.id, updatedByUserId],
      );
      myMonthlyIncomeCents = member?.monthly_income_cents ?? null;
    } else {
      await db.runAsync(`UPDATE couple_members SET monthly_income_cents = ? WHERE couple_id = ? AND user_id = ?`, [
        myMonthlyIncomeCents,
        couple.id,
        updatedByUserId,
      ]);
    }

    if (edit.memberWantsAllocations) {
      for (const member of edit.memberWantsAllocations) {
        await db.runAsync(
          `UPDATE couple_members SET wants_allocation_percent = ?, wants_account_id = ? WHERE couple_id = ? AND user_id = ?`,
          [member.wantsAllocationPercent, member.wantsAccountId, couple.id, member.userId],
        );
      }
    }

    const memberWantsAllocationsPayload: MemberWantsAllocationInput[] | undefined = edit.memberWantsAllocations?.map((member) => ({
      userId: member.userId,
      wantsAllocationPercent: member.wantsAllocationPercent,
      wantsAccountId: member.wantsAccountId,
    }));

    // The queue row's own created_at (refreshed by enqueue's collapsing logic below) doubles as
    // clientUpdatedAt when this gets pushed — no need to duplicate the timestamp into the payload.
    await syncQueueRepository.enqueue(COUPLE_PROFILE_ENTITY_TYPE, couple.id, 'UPDATE', {
      nickname: edit.nickname,
      anniversaryDate: edit.anniversaryDate,
      budgetAllocationPercent: edit.budgetAllocationPercent,
      savingsAllocationPercent: edit.savingsAllocationPercent,
      wantsAllocationPercent: edit.wantsAllocationPercent,
      budgetAccountId: edit.budgetAccountId,
      savingsAccountId: edit.savingsAccountId,
      myMonthlyIncome: centsToApiAmountOrNull(myMonthlyIncomeCents),
      ...(memberWantsAllocationsPayload ? { memberWantsAllocations: memberWantsAllocationsPayload } : {}),
    });
  },
};

export { COUPLE_PROFILE_ENTITY_TYPE };
