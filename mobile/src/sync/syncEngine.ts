import { coupleRepository, COUPLE_PROFILE_ENTITY_TYPE } from '../repositories/coupleRepository';
import { ApiError, api, isNetworkError } from '../services/api';
import { useSyncStore } from '../stores/syncStore';
import type { CoupleProfilePayload } from '../types/api';
import type { SyncPushItemDto } from '../types/api';
import { getDatabase } from '../database/db';
import { syncQueueRepository } from './syncQueue';

const LAST_SYNCED_AT_KEY = 'last_synced_at';

async function getLastSyncedAt(): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM sync_meta WHERE key = ?`, [
    LAST_SYNCED_AT_KEY,
  ]);
  return row?.value ?? null;
}

async function setLastSyncedAt(value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [LAST_SYNCED_AT_KEY, value],
  );
}

/** Pushes every queued local change in one request, then applies each per-item result. */
async function pushPending(): Promise<void> {
  const pending = await syncQueueRepository.getPending();
  if (pending.length === 0) return;

  const items: SyncPushItemDto[] = pending.map((row) => ({
    entityType: row.entity_type,
    entityId: row.entity_id,
    operation: row.operation,
    payload: JSON.parse(row.payload),
    clientUpdatedAt: row.created_at,
  }));

  const response = await api.syncPush(items);

  for (const result of response.results) {
    const row = pending.find((p) => p.entity_id === result.entityId && p.entity_type === result.entityType);
    if (!row) continue;

    if (result.accepted) {
      await syncQueueRepository.markSynced(row.id);
    } else if (result.error === 'stale_write') {
      // The server already holds a newer value than the one we tried to push. Drop our queued
      // write rather than retrying it forever — the pull that follows brings us back in sync.
      await syncQueueRepository.markSynced(row.id);
    } else {
      await syncQueueRepository.markFailed(row.id, result.error ?? 'Rejected by server');
    }
  }
}

/** Pulls everything changed since the last cursor and applies it to SQLite. */
async function pullRemote(): Promise<void> {
  const since = await getLastSyncedAt();
  const response = await api.syncPull(since);

  for (const change of response.changes) {
    if (change.entityType === COUPLE_PROFILE_ENTITY_TYPE) {
      await coupleRepository.applyRemoteProfileChange(
        change.entityId,
        change.payload as CoupleProfilePayload | null,
        change.updatedAt,
        change.updatedByUserId,
        change.version,
      );
    }
    // Future entity types (calendar_event, expense, ...) add another branch here.
  }

  await setLastSyncedAt(response.serverTime);
}

let syncInFlight: Promise<void> | null = null;

/**
 * Runs one push-then-pull cycle. Safe to call from multiple triggers (connectivity change, app
 * foreground, a fresh local edit, a periodic timer) — concurrent calls share the same in-flight
 * run instead of racing each other.
 */
export function runSync(): Promise<void> {
  if (!syncInFlight) {
    syncInFlight = (async () => {
      useSyncStore.getState().setStatus('syncing');
      try {
        await pushPending();
        await pullRemote();
        useSyncStore.getState().setOnline(true);
        useSyncStore.getState().setStatus('synced');
        useSyncStore.getState().setLastSyncedAt(new Date().toISOString());
      } catch (error) {
        if (isNetworkError(error)) {
          useSyncStore.getState().setOnline(false);
          useSyncStore.getState().setStatus('offline');
        } else {
          useSyncStore.getState().setStatus('error');
          if (!(error instanceof ApiError && error.status === 401)) {
            console.warn('[sync] run failed', error);
          }
        }
      } finally {
        const pendingCount = await syncQueueRepository.countPending();
        useSyncStore.getState().setPendingCount(pendingCount);
        syncInFlight = null;
      }
    })();
  }
  return syncInFlight;
}
