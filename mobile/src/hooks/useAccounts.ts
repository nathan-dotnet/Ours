import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { accountRepository, type AccountInput } from '../repositories/accountRepository';
import { useSyncStore } from '../stores/syncStore';
import { triggerSync } from '../sync';
import type { Account } from '../types/entities';

/** Same pattern as useCalendarEvents.ts: read straight from SQLite, with `lastSyncedAt` folded into the query key so a completed sync triggers a refetch. */
export function useAccounts(coupleId: string | undefined) {
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  return useQuery<Account[]>({
    queryKey: ['accounts', coupleId, lastSyncedAt],
    queryFn: () => (coupleId ? accountRepository.getAllForCouple(coupleId) : Promise.resolve([])),
    enabled: Boolean(coupleId),
  });
}

export function useActiveAccounts(coupleId: string | undefined) {
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  return useQuery<Account[]>({
    queryKey: ['accounts', 'active', coupleId, lastSyncedAt],
    queryFn: () => (coupleId ? accountRepository.getActiveForCouple(coupleId) : Promise.resolve([])),
    enabled: Boolean(coupleId),
  });
}

export function useAccount(id: string | undefined) {
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  return useQuery<Account | null>({
    queryKey: ['account', id, lastSyncedAt],
    queryFn: () => (id ? accountRepository.getById(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
}

/** Offline-first create: writes SQLite + queues the sync op immediately, then nudges the engine to flush if online. */
export function useCreateAccount() {
  const queryClient = useQueryClient();

  return useCallback(
    async (coupleId: string, input: AccountInput, openingBalanceCents: number, createdByUserId: string) => {
      const account = await accountRepository.createLocally(coupleId, input, openingBalanceCents, createdByUserId);
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      triggerSync();
      return account;
    },
    [queryClient],
  );
}

/** Also used to deactivate an account — pass isActive: false in the input. */
export function useUpdateAccount() {
  const queryClient = useQueryClient();

  return useCallback(
    async (account: Account, input: AccountInput, updatedByUserId: string) => {
      await accountRepository.updateLocally(account, input, updatedByUserId);
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      await queryClient.invalidateQueries({ queryKey: ['account'] });
      triggerSync();
    },
    [queryClient],
  );
}
