import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { coupleRepository, type CoupleProfileEdit } from '../repositories/coupleRepository';
import { triggerSync } from '../sync';
import { useSyncStore } from '../stores/syncStore';
import type { Couple, CoupleMember } from '../types/entities';

export interface LocalCoupleData {
  couple: Couple;
  members: CoupleMember[];
}

function coupleQueryKey(lastSyncedAt: string | null) {
  return ['couple', 'local', lastSyncedAt] as const;
}

/**
 * Reads the couple straight from SQLite — never from an API response — per the offline-first
 * rule that the UI always renders local data. `lastSyncedAt` is folded into the query key so a
 * completed sync (which may have changed SQLite outside of React's knowledge) triggers a refetch.
 */
export function useLocalCouple() {
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  return useQuery<LocalCoupleData | null>({
    queryKey: coupleQueryKey(lastSyncedAt),
    queryFn: async () => {
      const couple = await coupleRepository.getLocalCouple();
      if (!couple) return null;
      const members = await coupleRepository.getLocalMembers(couple.id);
      return { couple, members };
    },
  });
}

/** Offline-first edit: writes SQLite + queues the sync op immediately, then nudges the engine to flush if online. */
export function useUpdateCoupleProfile() {
  const queryClient = useQueryClient();

  return useCallback(
    async (couple: Couple, edit: CoupleProfileEdit, updatedByUserId: string) => {
      await coupleRepository.updateProfileLocally(couple, edit, updatedByUserId);
      await queryClient.invalidateQueries({ queryKey: ['couple', 'local'] });
      triggerSync();
    },
    [queryClient],
  );
}
