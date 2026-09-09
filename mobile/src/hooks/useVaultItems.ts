import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { vaultRepository, type VaultItemInput } from '../repositories/vaultRepository';
import { useSyncStore } from '../stores/syncStore';
import { triggerSync } from '../sync';
import type { VaultItem } from '../types/entities';

/** Same pattern as useCalendarEvents.ts: read straight from SQLite, with `lastSyncedAt` folded into the query key so a completed sync triggers a refetch. */
export function useVaultItems(coupleId: string | undefined) {
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  return useQuery<VaultItem[]>({
    queryKey: ['vault-items', coupleId, lastSyncedAt],
    queryFn: () => (coupleId ? vaultRepository.getAllForCouple(coupleId) : Promise.resolve([])),
    enabled: Boolean(coupleId),
  });
}

export function useVaultItem(id: string | undefined) {
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  return useQuery<VaultItem | null>({
    queryKey: ['vault-item', id, lastSyncedAt],
    queryFn: () => (id ? vaultRepository.getById(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
}

/** Offline-first create: writes SQLite + queues the sync op immediately, then nudges the engine to flush if online. The plaintext password passes through this call only in memory. */
export function useCreateVaultItem() {
  const queryClient = useQueryClient();

  return useCallback(
    async (coupleId: string, input: VaultItemInput, createdByUserId: string) => {
      const item = await vaultRepository.createLocally(coupleId, input, createdByUserId);
      await queryClient.invalidateQueries({ queryKey: ['vault-items'] });
      triggerSync();
      return item;
    },
    [queryClient],
  );
}

export function useUpdateVaultItem() {
  const queryClient = useQueryClient();

  return useCallback(
    async (item: VaultItem, input: VaultItemInput, updatedByUserId: string) => {
      await vaultRepository.updateLocally(item, input, updatedByUserId);
      await queryClient.invalidateQueries({ queryKey: ['vault-items'] });
      await queryClient.invalidateQueries({ queryKey: ['vault-item'] });
      triggerSync();
    },
    [queryClient],
  );
}

export function useDeleteVaultItem() {
  const queryClient = useQueryClient();

  return useCallback(
    async (item: VaultItem) => {
      await vaultRepository.deleteLocally(item);
      await queryClient.invalidateQueries({ queryKey: ['vault-items'] });
      triggerSync();
    },
    [queryClient],
  );
}

/** Search by title, username, website, or category — never touches/decrypts a password. */
export function searchVaultItems(items: VaultItem[], query: string): VaultItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) =>
    [item.title, item.username, item.website_url, item.category].some((field) => field?.toLowerCase().includes(normalized)),
  );
}
