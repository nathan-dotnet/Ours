import { AppState } from 'react-native';
import { getIsOnline, subscribeToConnectivity } from '../services/connectivity';
import { useSyncStore } from '../stores/syncStore';
import { runSync } from './syncEngine';

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * How often the engine polls on a timer regardless of any other signal. Everything that
 * actually needs to be prompt already has its own trigger below (a local edit, reconnecting,
 * the app coming to the foreground) — this is just the backstop for "none of those fired for a
 * while," so it can be slow.
 */
const AUTO_SYNC_INTERVAL_MS = ONE_HOUR_MS;

let unsubscribeConnectivity: (() => void) | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let started = false;

/**
 * Wires the sync engine to the app's lifecycle: an immediate run at startup, a run whenever
 * connectivity flips online, a run when the app returns to the foreground, and an hourly
 * fallback poll in case none of those ever fire. Call once from the root layout. See also
 * `triggerSync` for the manual "Sync now" / pull-to-refresh path.
 */
export async function startSyncEngine(): Promise<void> {
  if (started) return;
  started = true;

  const online = await getIsOnline();
  useSyncStore.getState().setOnline(online);
  if (online) {
    void runSync();
  } else {
    useSyncStore.getState().setStatus('offline');
  }

  unsubscribeConnectivity = subscribeToConnectivity((isOnline) => {
    useSyncStore.getState().setOnline(isOnline);
    if (isOnline) {
      void runSync();
    } else {
      useSyncStore.getState().setStatus('offline');
    }
  });

  appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void runSync();
    }
  });

  intervalId = setInterval(() => void runSync(), AUTO_SYNC_INTERVAL_MS);
}

export function stopSyncEngine(): void {
  unsubscribeConnectivity?.();
  unsubscribeConnectivity = null;
  appStateSubscription?.remove();
  appStateSubscription = null;
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  started = false;
}

/**
 * Ask the sync engine to run now. Repositories call this right after queuing a local write (not
 * awaited — an online device just flushes a bit sooner) and the manual "Sync now" button /
 * pull-to-refresh call it too, awaited, so they can show a loading state until it settles.
 */
export function triggerSync(): Promise<void> {
  return runSync();
}
