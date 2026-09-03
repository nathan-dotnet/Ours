import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { expenseRepository, type ExpenseInput } from '../repositories/expenseRepository';
import { useSyncStore } from '../stores/syncStore';
import { triggerSync } from '../sync';
import type { Expense } from '../types/entities';
import { sumCents } from '../utils/money';

/** Same pattern as useCalendarEvents.ts: read straight from SQLite, with `lastSyncedAt` folded into the query key so a completed sync (which may change SQLite outside of React's knowledge) triggers a refetch. */
export function useExpensesForMonth(coupleId: string | undefined, year: number, month: number) {
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  return useQuery<Expense[]>({
    queryKey: ['expenses', coupleId, year, month, lastSyncedAt],
    queryFn: () => (coupleId ? expenseRepository.getForMonth(coupleId, year, month) : Promise.resolve([])),
    enabled: Boolean(coupleId),
  });
}

export function useExpense(id: string | undefined) {
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  return useQuery<Expense | null>({
    queryKey: ['expense', id, lastSyncedAt],
    queryFn: () => (id ? expenseRepository.getById(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
}

/**
 * Total this month and the per-category breakdown, both derived purely from local data with
 * plain integer-cent addition (see utils/money.ts) — never a server-computed total, and never a
 * floating-point sum. Recomputes automatically whenever the underlying expense list changes
 * (create/edit/delete, offline or synced), since it's a pure function of `expenses`.
 */
export function useExpenseTotals(expenses: Expense[]) {
  return useMemo(() => {
    const totalCents = sumCents(expenses.map((e) => e.amount_cents));

    const byCategory = new Map<string, number>();
    for (const expense of expenses) {
      byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amount_cents);
    }
    const categoryTotals = Array.from(byCategory.entries())
      .map(([category, cents]) => ({ category, cents }))
      .sort((a, b) => b.cents - a.cents);

    return { totalCents, categoryTotals };
  }, [expenses]);
}

/** Offline-first create: writes SQLite + queues the sync op immediately, then nudges the engine to flush if online. */
export function useCreateExpense() {
  const queryClient = useQueryClient();

  return useCallback(
    async (coupleId: string, input: ExpenseInput, createdByUserId: string) => {
      const expense = await expenseRepository.createLocally(coupleId, input, createdByUserId);
      await queryClient.invalidateQueries({ queryKey: ['expenses'] });
      triggerSync();
      return expense;
    },
    [queryClient],
  );
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();

  return useCallback(
    async (expense: Expense, input: ExpenseInput, updatedByUserId: string) => {
      await expenseRepository.updateLocally(expense, input, updatedByUserId);
      await queryClient.invalidateQueries({ queryKey: ['expenses'] });
      await queryClient.invalidateQueries({ queryKey: ['expense'] });
      triggerSync();
    },
    [queryClient],
  );
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();

  return useCallback(
    async (expense: Expense) => {
      await expenseRepository.deleteLocally(expense);
      await queryClient.invalidateQueries({ queryKey: ['expenses'] });
      triggerSync();
    },
    [queryClient],
  );
}
