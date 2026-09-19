import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { transactionRepository, type TransactionInput } from '../repositories/transactionRepository';
import { useSyncStore } from '../stores/syncStore';
import { triggerSync } from '../sync';
import type { Transaction } from '../types/entities';

export function useTransactionsForMonth(coupleId: string | undefined, year: number, month: number) {
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  return useQuery<Transaction[]>({
    queryKey: ['money-transactions', coupleId, year, month, lastSyncedAt],
    queryFn: () => (coupleId ? transactionRepository.getForMonth(coupleId, year, month) : Promise.resolve([])),
    enabled: Boolean(coupleId),
  });
}

/** Every transaction for the couple, regardless of account or month — used where a fact (like a savings goal's progress) isn't scoped to a single account. */
export function useTransactionsForCouple(coupleId: string | undefined) {
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  return useQuery<Transaction[]>({
    queryKey: ['money-transactions', 'couple', coupleId, lastSyncedAt],
    queryFn: () => (coupleId ? transactionRepository.getAllForCouple(coupleId) : Promise.resolve([])),
    enabled: Boolean(coupleId),
  });
}

export function useTransactionsForAccount(accountId: string | undefined) {
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  return useQuery<Transaction[]>({
    queryKey: ['money-transactions', 'account', accountId, lastSyncedAt],
    queryFn: () => (accountId ? transactionRepository.getForAccount(accountId) : Promise.resolve([])),
    enabled: Boolean(accountId),
  });
}

export function useTransaction(id: string | undefined) {
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  return useQuery<Transaction | null>({
    queryKey: ['money-transaction', id, lastSyncedAt],
    queryFn: () => (id ? transactionRepository.getById(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
}

function useInvalidateTransactionQueries() {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['money-transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['money-transaction'] }),
      ]),
    [queryClient],
  );
}

/** Offline-first create: writes SQLite + queues the sync op immediately, then nudges the engine to flush if online. Covers Expense, Income, and Transfer alike — the type is just a field on the input. */
export function useCreateTransaction() {
  const invalidate = useInvalidateTransactionQueries();

  return useCallback(
    async (coupleId: string, input: TransactionInput, createdByUserId: string) => {
      const transaction = await transactionRepository.createLocally(coupleId, input, createdByUserId);
      await invalidate();
      triggerSync();
      return transaction;
    },
    [invalidate],
  );
}

export function useUpdateTransaction() {
  const invalidate = useInvalidateTransactionQueries();

  return useCallback(
    async (transaction: Transaction, input: TransactionInput, updatedByUserId: string) => {
      await transactionRepository.updateLocally(transaction, input, updatedByUserId);
      await invalidate();
      triggerSync();
    },
    [invalidate],
  );
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateTransactionQueries();

  return useCallback(
    async (transaction: Transaction) => {
      await transactionRepository.deleteLocally(transaction);
      await invalidate();
      triggerSync();
    },
    [invalidate],
  );
}
