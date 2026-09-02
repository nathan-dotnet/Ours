/** Local (SQLite-shaped) domain types. Field names are snake_case to match the columns directly. */

export interface Couple {
  id: string;
  invite_code: string;
  nickname: string | null;
  anniversary_date: string | null; // ISO date (YYYY-MM-DD)
  created_at: string;
  updated_at: string;
  updated_by_user_id: string;
  version: number;
  is_deleted: number; // SQLite has no boolean type; 0/1
}

export interface CoupleMember {
  id: string;
  couple_id: string;
  user_id: string;
  display_name: string;
  joined_at: string;
}

export interface CalendarEvent {
  id: string;
  couple_id: string;
  title: string;
  description: string | null;
  start_at: string; // ISO datetime
  end_at: string; // ISO datetime
  reminder_at: string | null; // ISO datetime
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  updated_by_user_id: string;
  version: number;
  is_deleted: number;
}

export type SyncOperation = 'CREATE' | 'UPDATE' | 'DELETE';
export type SyncQueueStatus = 'pending' | 'syncing' | 'failed' | 'synced';

export interface SyncQueueRow {
  id: string;
  entity_type: string;
  entity_id: string;
  operation: SyncOperation;
  payload: string; // JSON-encoded
  created_at: string;
  retry_count: number;
  last_error: string | null;
  status: SyncQueueStatus;
}
