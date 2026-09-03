import { getDatabase } from '../database/db';
import { syncQueueRepository } from '../sync/syncQueue';
import type { CalendarEventPayload } from '../types/api';
import type { CalendarEvent } from '../types/entities';
import { generateUuid } from '../utils/uuid';

export const CALENDAR_EVENT_ENTITY_TYPE = 'calendar_event';

export interface CalendarEventInput {
  title: string;
  description: string | null;
  startAt: string; // ISO datetime
  endAt: string; // ISO datetime
  // Optional (default false/null) so existing callers/tests written before these fields
  // existed keep compiling — matches the additive spirit of the schema migration that added them.
  allDay?: boolean;
  location?: string | null;
  reminderAt: string | null; // ISO datetime
}

function toPayload(input: CalendarEventInput): CalendarEventPayload {
  return {
    title: input.title,
    description: input.description,
    startAt: input.startAt,
    endAt: input.endAt,
    allDay: input.allDay ?? false,
    location: input.location ?? null,
    reminderAt: input.reminderAt,
  };
}

/**
 * Repository for calendar events — Phase 2's first real feature built on the Phase 1 pattern:
 * read/write SQLite directly, enqueue a sync_queue row for local writes, and expose a separate
 * "apply what the server just told us" path for pulled changes (see coupleRepository.ts for the
 * original of this shape).
 *
 * One difference from couple_profile: an event is a genuinely independent entity (there can be
 * many, and a device may pull one it has never seen before), so deletes are hard local deletes
 * (SQLite is just a mirror; the server keeps the tombstone the partner's device needs) and
 * applyRemoteChange is a true upsert rather than an update-only path.
 */
export const calendarEventRepository = {
  async getAllForCouple(coupleId: string): Promise<CalendarEvent[]> {
    const db = await getDatabase();
    return db.getAllAsync<CalendarEvent>(
      `SELECT * FROM calendar_events WHERE couple_id = ? AND is_deleted = 0 ORDER BY start_at ASC`,
      [coupleId],
    );
  },

  async getById(id: string): Promise<CalendarEvent | null> {
    const db = await getDatabase();
    return db.getFirstAsync<CalendarEvent>(`SELECT * FROM calendar_events WHERE id = ? AND is_deleted = 0`, [id]);
  },

  /** Offline-first create: writes SQLite immediately (device-generated id), then queues the sync op. */
  async createLocally(coupleId: string, input: CalendarEventInput, createdByUserId: string): Promise<CalendarEvent> {
    const db = await getDatabase();
    const id = generateUuid();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO calendar_events
         (id, couple_id, title, description, start_at, end_at, all_day, location, reminder_at, created_by_user_id, created_at, updated_at, updated_by_user_id, version, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        id,
        coupleId,
        input.title,
        input.description,
        input.startAt,
        input.endAt,
        input.allDay ? 1 : 0,
        input.location ?? null,
        input.reminderAt,
        createdByUserId,
        now,
        now,
        createdByUserId,
      ],
    );

    await syncQueueRepository.enqueue(CALENDAR_EVENT_ENTITY_TYPE, id, 'CREATE', toPayload(input));

    return {
      id,
      couple_id: coupleId,
      title: input.title,
      description: input.description,
      start_at: input.startAt,
      end_at: input.endAt,
      all_day: input.allDay ? 1 : 0,
      location: input.location ?? null,
      reminder_at: input.reminderAt,
      created_by_user_id: createdByUserId,
      created_at: now,
      updated_at: now,
      updated_by_user_id: createdByUserId,
      version: 1,
      is_deleted: 0,
    };
  },

  /** Offline-first edit: writes SQLite immediately, then queues the sync op. */
  async updateLocally(event: CalendarEvent, input: CalendarEventInput, updatedByUserId: string): Promise<void> {
    const db = await getDatabase();
    const updatedAt = new Date().toISOString();

    await db.runAsync(
      `UPDATE calendar_events
       SET title = ?, description = ?, start_at = ?, end_at = ?, all_day = ?, location = ?, reminder_at = ?, updated_at = ?, updated_by_user_id = ?
       WHERE id = ?`,
      [
        input.title,
        input.description,
        input.startAt,
        input.endAt,
        input.allDay ? 1 : 0,
        input.location ?? null,
        input.reminderAt,
        updatedAt,
        updatedByUserId,
        event.id,
      ],
    );

    await syncQueueRepository.enqueue(CALENDAR_EVENT_ENTITY_TYPE, event.id, 'UPDATE', toPayload(input));
  },

  /**
   * Offline-first delete: removes the local row immediately so it disappears from the UI right
   * away. Hard delete is safe here (unlike the server's soft delete) — SQLite is just this
   * device's mirror, and the sync_queue row (not this table) is what remembers the deletion
   * needs to be pushed.
   */
  async deleteLocally(event: CalendarEvent): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM calendar_events WHERE id = ?`, [event.id]);

    await syncQueueRepository.enqueue(CALENDAR_EVENT_ENTITY_TYPE, event.id, 'DELETE', null);
  },

  /**
   * Applies a "calendar_event" change pulled from /api/sync/pull. Unlike couple_profile, the
   * event may be entirely new to this device (the partner created it), so this upserts rather
   * than assuming a row already exists; a null payload means the server told us it was deleted.
   */
  async applyRemoteChange(
    coupleId: string,
    entityId: string,
    payload: CalendarEventPayload | null,
    updatedAt: string,
    updatedByUserId: string,
    version: number,
  ): Promise<void> {
    const db = await getDatabase();

    if (payload === null) {
      await db.runAsync(`DELETE FROM calendar_events WHERE id = ?`, [entityId]);
      return;
    }

    await db.runAsync(
      `INSERT INTO calendar_events
         (id, couple_id, title, description, start_at, end_at, all_day, location, reminder_at, created_by_user_id, created_at, updated_at, updated_by_user_id, version, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         description = excluded.description,
         start_at = excluded.start_at,
         end_at = excluded.end_at,
         all_day = excluded.all_day,
         location = excluded.location,
         reminder_at = excluded.reminder_at,
         updated_at = excluded.updated_at,
         updated_by_user_id = excluded.updated_by_user_id,
         version = excluded.version,
         is_deleted = 0`,
      [
        entityId,
        coupleId,
        payload.title,
        payload.description,
        payload.startAt,
        payload.endAt,
        payload.allDay ? 1 : 0,
        payload.location ?? null,
        payload.reminderAt,
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
