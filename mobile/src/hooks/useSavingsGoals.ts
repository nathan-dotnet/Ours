import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { savingsGoalRepository, type SavingsGoalInput } from '../repositories/savingsGoalRepository';
import { useSyncStore } from '../stores/syncStore';
import { triggerSync } from '../sync';
import type { SavingsGoal } from '../types/entities';

export function useSavingsGoals(coupleId: string | undefined) {
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  return useQuery<SavingsGoal[]>({
    queryKey: ['savingsGoals', coupleId, lastSyncedAt],
    queryFn: () => (coupleId ? savingsGoalRepository.getAllForCouple(coupleId) : Promise.resolve([])),
    enabled: Boolean(coupleId),
  });
}

export function useSavingsGoal(id: string | undefined) {
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  return useQuery<SavingsGoal | null>({
    queryKey: ['savingsGoal', id, lastSyncedAt],
    queryFn: () => (id ? savingsGoalRepository.getById(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
}

export function useCreateSavingsGoal() {
  const queryClient = useQueryClient();

  return useCallback(
    async (coupleId: string, input: SavingsGoalInput, createdByUserId: string) => {
      const goal = await savingsGoalRepository.createLocally(coupleId, input, createdByUserId);
      await queryClient.invalidateQueries({ queryKey: ['savingsGoals'] });
      triggerSync();
      return goal;
    },
    [queryClient],
  );
}

export function useUpdateSavingsGoal() {
  const queryClient = useQueryClient();

  return useCallback(
    async (goal: SavingsGoal, input: SavingsGoalInput, updatedByUserId: string) => {
      await savingsGoalRepository.updateLocally(goal, input, updatedByUserId);
      await queryClient.invalidateQueries({ queryKey: ['savingsGoals'] });
      await queryClient.invalidateQueries({ queryKey: ['savingsGoal'] });
      triggerSync();
    },
    [queryClient],
  );
}

export function useDeleteSavingsGoal() {
  const queryClient = useQueryClient();

  return useCallback(
    async (goal: SavingsGoal) => {
      await savingsGoalRepository.deleteLocally(goal);
      await queryClient.invalidateQueries({ queryKey: ['savingsGoals'] });
      triggerSync();
    },
    [queryClient],
  );
}
