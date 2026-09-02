import { create } from 'zustand';

export type SyncStatus = 'offline' | 'syncing' | 'synced' | 'error';

interface SyncState {
  isOnline: boolean;
  status: SyncStatus;
  lastSyncedAt: string | null;
  pendingCount: number;
  setOnline: (isOnline: boolean) => void;
  setStatus: (status: SyncStatus) => void;
  setLastSyncedAt: (iso: string) => void;
  setPendingCount: (count: number) => void;
}

/** Drives the subtle "Offline / Syncing… / All changes synced ✓" indicator — see SyncStatusBadge. */
export const useSyncStore = create<SyncState>((set) => ({
  isOnline: true,
  status: 'synced',
  lastSyncedAt: null,
  pendingCount: 0,
  setOnline: (isOnline) => set({ isOnline }),
  setStatus: (status) => set({ status }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
}));
