/**
 * Local SQLite schema, versioned via `PRAGMA user_version` (see migrations.ts).
 *
 * Two kinds of tables live here:
 *  - Generic sync plumbing (`sync_queue`, `sync_meta`) that every future feature reuses as-is.
 *  - Feature tables that mirror the server's shape plus sync metadata (updated_at,
 *    updated_by_user_id, version, is_deleted) so the "last valid server write wins" strategy
 *    has what it needs on both ends. `couples`/`couple_members` (Phase 1) and `calendar_events`
 *    (Phase 2) follow this same shape — later phases add one table per new entity the same way.
 */

export const CURRENT_SCHEMA_VERSION = 2;

/** Statements applied when moving from schema version 0 -> 1. */
export const MIGRATION_V1 = `
  PRAGMA journal_mode = 'wal';

  CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('CREATE', 'UPDATE', 'DELETE')),
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'syncing', 'failed', 'synced'))
  );

  CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue (status);

  CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS couples (
    id TEXT PRIMARY KEY NOT NULL,
    invite_code TEXT NOT NULL,
    nickname TEXT,
    anniversary_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by_user_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS couple_members (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    joined_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_couple_members_couple_id ON couple_members (couple_id);
`;

/** Statements applied when moving from schema version 1 -> 2: adds Calendar (Phase 2). */
export const MIGRATION_V2 = `
  CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    reminder_at TEXT,
    created_by_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by_user_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_calendar_events_couple_id ON calendar_events (couple_id);
  CREATE INDEX IF NOT EXISTS idx_calendar_events_start_at ON calendar_events (start_at);
`;
