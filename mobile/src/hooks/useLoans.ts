import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { loanRepository, type LoanInput } from '../repositories/loanRepository';
import { api } from '../services/api';
import { getIsOnline } from '../services/connectivity';
import { syncScheduledLoanReminders } from '../services/loanReminders';
import { useSyncStore } from '../stores/syncStore';
import { triggerSync } from '../sync';
import type { LoanPaymentRequestDto, LoanPaymentResponseDto } from '../types/api';
import type { Loan, Transaction } from '../types/entities';

export function useLoans(coupleId: string | undefined) {
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  return useQuery<Loan[]>({
    queryKey: ['loans', coupleId, lastSyncedAt],
    queryFn: () => (coupleId ? loanRepository.getAllForCouple(coupleId) : Promise.resolve([])),
    enabled: Boolean(coupleId),
  });
}

export function useLoan(id: string | undefined) {
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  return useQuery<Loan | null>({
    queryKey: ['loan', id, lastSyncedAt],
    queryFn: () => (id ? loanRepository.getById(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
}

export function useCreateLoan() {
  const queryClient = useQueryClient();

  return useCallback(
    async (coupleId: string, input: LoanInput, createdByUserId: string) => {
      const loan = await loanRepository.createLocally(coupleId, input, createdByUserId);
      await queryClient.invalidateQueries({ queryKey: ['loans'] });
      triggerSync();
      return loan;
    },
    [queryClient],
  );
}

export function useUpdateLoan() {
  const queryClient = useQueryClient();

  return useCallback(
    async (loan: Loan, input: LoanInput, updatedByUserId: string) => {
      await loanRepository.updateLocally(loan, input, updatedByUserId);
      await queryClient.invalidateQueries({ queryKey: ['loans'] });
      await queryClient.invalidateQueries({ queryKey: ['loan'] });
      triggerSync();
    },
    [queryClient],
  );
}

export function useDeleteLoan() {
  const queryClient = useQueryClient();

  return useCallback(
    async (loan: Loan) => {
      await loanRepository.deleteLocally(loan);
      await queryClient.invalidateQueries({ queryKey: ['loans'] });
      triggerSync();
    },
    [queryClient],
  );
}

/**
 * Reschedules every due-date reminder for this couple's loans (see
 * services/loanReminders.ts's own doc comment for why this is a full "cancel and reschedule
 * everything" sweep rather than a diff) whenever the loans or transactions this device knows
 * about change — a local create/edit/pay (each already invalidates the `loans`/
 * `money-transactions` queries this reads), or a completed sync pulling in the partner's own
 * changes. Mount once, high up the tree (see app/_layout.tsx) — not per-screen, so reminders stay
 * current even while the user isn't looking at Loans at all.
 */
export function useLoanReminderScheduler(loans: Loan[] | undefined, transactions: Transaction[] | undefined, currentUserId: string | undefined): void {
  useEffect(() => {
    if (!currentUserId) return;
    void syncScheduledLoanReminders(loans ?? [], transactions ?? [], currentUserId);
  }, [loans, transactions, currentUserId]);
}

export class LoanPaymentOfflineError extends Error {
  constructor() {
    super('You need to be online to pay a loan.');
    this.name = 'LoanPaymentOfflineError';
  }
}

/**
 * "Pay" a loan — a one-shot, server-validated action, not an offline-queued edit, same reasoning
 * as useDistribution.ts's useDistributeMoney (the balance/overpayment checks and the atomic
 * outcome are all server-side). On success, writes the resulting transaction into the local
 * mirror immediately (see loanRepository.recordPaymentLocally) for instant UI feedback, then
 * triggers a real sync so the partner's device eventually sees the same thing.
 */
export function usePayLoan() {
  const queryClient = useQueryClient();

  return useCallback(
    async (coupleId: string, loan: Loan, request: LoanPaymentRequestDto, paidByUserId: string): Promise<LoanPaymentResponseDto> => {
      const online = await getIsOnline();
      if (!online) {
        throw new LoanPaymentOfflineError();
      }

      const response = await api.payLoan(loan.id, request);
      await loanRepository.recordPaymentLocally(coupleId, loan, request, response, paidByUserId);
      await queryClient.invalidateQueries({ queryKey: ['loans'] });
      await queryClient.invalidateQueries({ queryKey: ['loan'] });
      await queryClient.invalidateQueries({ queryKey: ['money-transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      triggerSync();
      return response;
    },
    [queryClient],
  );
}
