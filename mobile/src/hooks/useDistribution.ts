import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '../services/api';
import { getIsOnline } from '../services/connectivity';
import type { DistributeMoneyRequestDto, DistributeMoneyResponseDto, DistributionStatusResponseDto } from '../types/api';

const DISTRIBUTION_STATUS_KEY = ['distribution', 'status'] as const;

/**
 * Whether this income period has already been distributed is only ever true as of the server's
 * clock — same reasoning as useMissMe.ts's cooldown — so this is never read from SQLite, always
 * asked fresh. React Query still avoids refetching on every render (see useMissMe.ts's own
 * comment on this exact pattern).
 */
export function useDistributionStatus(coupleId: string | undefined, year: number, month: number) {
  return useQuery<DistributionStatusResponseDto>({
    queryKey: [...DISTRIBUTION_STATUS_KEY, coupleId, year, month],
    queryFn: () => api.getDistributionStatus(year, month),
    enabled: Boolean(coupleId),
    staleTime: 30_000,
  });
}

export class DistributionOfflineError extends Error {
  constructor() {
    super('You need to be online to distribute your income.');
    this.name = 'DistributionOfflineError';
  }
}

/**
 * A one-shot, server-validated action, not an offline-queued edit — same reasoning as
 * useSendMissMe: the duplicate-period check and every reconciliation calculation are
 * server-side, so there is nothing sensible to queue while offline.
 */
export function useDistributeMoney() {
  const queryClient = useQueryClient();

  return useCallback(
    async (request: DistributeMoneyRequestDto): Promise<DistributeMoneyResponseDto> => {
      const online = await getIsOnline();
      if (!online) {
        throw new DistributionOfflineError();
      }

      const result = await api.distributeMoney(request);
      await queryClient.invalidateQueries({ queryKey: DISTRIBUTION_STATUS_KEY });
      return result;
    },
    [queryClient],
  );
}
