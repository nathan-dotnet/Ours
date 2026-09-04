import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { budgetRepository, type BudgetInput } from '../repositories/budgetRepository';
import { useSyncStore } from '../stores/syncStore';
import { triggerSync } from '../sync';
import type { Budget } from '../types/entities';

export function useBudgetsForMonth(coupleId: string | undefined, year: number, month: number) {
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  return useQuery<Budget[]>({
    queryKey: ['budgets', coupleId, year, month, lastSyncedAt],
    queryFn: () => (coupleId ? budgetRepository.getForMonth(coupleId, year, month) : Promise.resolve([])),
    enabled: Boolean(coupleId),
  });
}

export function useBudget(id: string | undefined) {
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  return useQuery<Budget | null>({
    queryKey: ['budget', id, lastSyncedAt],
    queryFn: () => (id ? budgetRepository.getById(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
}

export function useCreateBudget() {
  const queryClient = useQueryClient();

  return useCallback(
    async (coupleId: string, input: BudgetInput, createdByUserId: string) => {
      const budget = await budgetRepository.createLocally(coupleId, input, createdByUserId);
      await queryClient.invalidateQueries({ queryKey: ['budgets'] });
      triggerSync();
      return budget;
    },
    [queryClient],
  );
}

export function useUpdateBudget() {
  const queryClient = useQueryClient();

  return useCallback(
    async (budget: Budget, input: BudgetInput, updatedByUserId: string) => {
      await budgetRepository.updateLocally(budget, input, updatedByUserId);
      await queryClient.invalidateQueries({ queryKey: ['budgets'] });
      await queryClient.invalidateQueries({ queryKey: ['budget'] });
      triggerSync();
    },
    [queryClient],
  );
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();

  return useCallback(
    async (budget: Budget) => {
      await budgetRepository.deleteLocally(budget);
      await queryClient.invalidateQueries({ queryKey: ['budgets'] });
      triggerSync();
    },
    [queryClient],
  );
}
