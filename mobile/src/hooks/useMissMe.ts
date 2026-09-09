import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '../services/api';
import { getIsOnline } from '../services/connectivity';
import { useSyncStore } from '../stores/syncStore';
import type { MissMeInteractionKind, MissMeSendResponseDto, MissMeStatusResponseDto } from '../types/api';

const MISS_ME_STATUS_KEY = ['miss-me', 'status'] as const;

/**
 * Unlike every offline-first feature (Calendar/Money/Vault), Miss Me's status is never read from
 * SQLite — a cooldown is only ever true as of the *server's* clock, so a locally cached "can
 * send" would just be wrong the moment it goes stale. React Query still gives this the same
 * "don't refetch on every render" behavior the rest of the app relies on (see Performance in the
 * Home screen spec): fetched on mount, refetched after a send, and folding `lastSyncedAt` into
 * the query key means it also refreshes for free whenever a sync round completes — including the
 * existing AppState-driven sync-on-foreground (see sync/index.ts) — without polling or any new
 * "refetch on app foreground" plumbing of its own.
 */
export function useMissMeStatus(coupleId: string | undefined) {
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  return useQuery<MissMeStatusResponseDto>({
    queryKey: [...MISS_ME_STATUS_KEY, coupleId, lastSyncedAt],
    queryFn: () => api.getMissMeStatus(),
    enabled: Boolean(coupleId),
    staleTime: 30_000,
  });
}

export class MissMeOfflineError extends Error {
  constructor() {
    super('You need to be online to send this.');
    this.name = 'MissMeOfflineError';
  }
}

/**
 * A gesture, not an offline-queued edit — same reasoning as useCoupleActions.leaveCouple: it
 * only ever means something as an immediate, server-validated action (the cooldown and "who's
 * my partner" checks are both server-side), so there is nothing sensible to queue while offline.
 */
export function useSendMissMe() {
  const queryClient = useQueryClient();

  return useCallback(
    async (type: MissMeInteractionKind, inResponseToId?: string): Promise<MissMeSendResponseDto> => {
      const online = await getIsOnline();
      if (!online) {
        throw new MissMeOfflineError();
      }

      const result = await api.sendMissMe(type, inResponseToId);
      await queryClient.invalidateQueries({ queryKey: MISS_ME_STATUS_KEY });
      return result;
    },
    [queryClient],
  );
}
