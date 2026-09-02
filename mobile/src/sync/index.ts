import { AppState } from 'react-native';
import { getIsOnline, subscribeToConnectivity } from '../services/connectivity';
import { useSyncStore } from '../stores/syncStore';
import { runSync } from './syncEngine';

const FALLBACK_INTERVAL_MS = 30_000;

let unsubscribeConnectivity: (() => void) | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let started = false;

/**
 * Wires the sync engine to the app's lifecycle: an immediate run at startup, a run whenever
 * connectivity flips online, a run when the app returns to the foreground, and a slow polling
 * fallback in case a connectivity event is ever missed. Call once from the root layout.
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

  intervalId = setInterval(() => void runSync(), FALLBACK_INTERVAL_MS);
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

/** Ask the sync engine to run now — repositories call this right after queuing a local write, so an online device flushes immediately instead of waiting for the next tick. */
export function triggerSync(): void {
  void runSync();
}
