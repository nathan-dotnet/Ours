import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { loanPaymentScheduleRepository, type LoanPaymentScheduleInput } from '../repositories/loanPaymentScheduleRepository';
import { useSyncStore } from '../stores/syncStore';
import { triggerSync } from '../sync';
import type { LoanPaymentSchedule } from '../types/entities';

export function useLoanPaymentSchedules(loanId: string | undefined) {
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  return useQuery<LoanPaymentSchedule[]>({
    queryKey: ['loan-payment-schedules', loanId, lastSyncedAt],
    queryFn: () => (loanId ? loanPaymentScheduleRepository.getForLoan(loanId) : Promise.resolve([])),
    enabled: Boolean(loanId),
  });
}

export function useLoanPaymentSchedulesForLoans(loanIds: string[]) {
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const key = [...loanIds].sort().join(',');
  return useQuery<LoanPaymentSchedule[]>({
    queryKey: ['loan-payment-schedules', key, lastSyncedAt],
    queryFn: () => loanPaymentScheduleRepository.getForLoans(loanIds),
    enabled: loanIds.length > 0,
  });
}

export function useSaveLoanPaymentSchedule() {
  const queryClient = useQueryClient();
  return useCallback(async (schedule: LoanPaymentSchedule | null, input: LoanPaymentScheduleInput, updatedByUserId: string) => {
    if (schedule) await loanPaymentScheduleRepository.updateLocally(schedule, input, updatedByUserId);
    else await loanPaymentScheduleRepository.createLocally(input, updatedByUserId);
    await queryClient.invalidateQueries({ queryKey: ['loan-payment-schedules'] });
    triggerSync();
  }, [queryClient]);
}

export function useDeleteLoanPaymentSchedule() {
  const queryClient = useQueryClient();
  return useCallback(async (schedule: LoanPaymentSchedule) => {
    await loanPaymentScheduleRepository.deleteLocally(schedule);
    await queryClient.invalidateQueries({ queryKey: ['loan-payment-schedules'] });
    triggerSync();
  }, [queryClient]);
}
