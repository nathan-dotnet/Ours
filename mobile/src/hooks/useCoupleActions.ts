import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { coupleRepository } from '../repositories/coupleRepository';
import { api } from '../services/api';
import { getIsOnline } from '../services/connectivity';
import { useAuthStore } from '../stores/authStore';
import { triggerSync } from '../sync';
import type { CoupleActionResponseDto, LeaveCoupleResponseDto } from '../types/api';
import type { JoinCoupleFormValues } from '../validation/couple';

/**
 * Create/join/leave all require the server — creating/joining need a globally-unique invite code
 * and link two accounts together; leaving ends another user's membership too. None of that can
 * be safely resolved from local SQLite alone, so (unlike every other couple-scoped feature) these
 * are the one place in the app that isn't offline-capable by nature. Once create/join succeed,
 * everything that follows goes through SQLite + the sync queue like any other feature.
 */
export function useCoupleActions() {
  const updateTokens = useAuthStore((s) => s.updateTokens);
  const clearCoupleId = useAuthStore((s) => s.clearCoupleId);
  const queryClient = useQueryClient();

  /**
   * Applies a create/join result to local state: swaps in the new token (its coupleId claim is
   * what the root layout's Stack.Protected guards key off, so this is what actually navigates
   * the user into the main app) and seeds SQLite. Kept separate from `createCouple` below so the
   * create-couple screen can show the invite code first and call this only once the user taps
   * "Continue" — otherwise the guard would redirect away before they ever saw the code.
   */
  const finalizeCoupleAction = useCallback(
    async (result: CoupleActionResponseDto) => {
      await updateTokens(result.auth);
      await coupleRepository.upsertFromServer(result.couple);
      triggerSync();
    },
    [updateTokens],
  );

  const createCouple = useCallback(() => api.createCouple(), []);

  const joinCouple = useCallback(
    async (values: JoinCoupleFormValues) => {
      const result = await api.joinCouple(values.inviteCode);
      // Joining immediately reaches a fully-paired state, so there's nothing to show first.
      await finalizeCoupleAction(result);
      return result.couple;
    },
    [finalizeCoupleAction],
  );

  /**
   * Ends the current couple for both partners. Requires the server to actually confirm it before
   * touching any local state — a destructive relationship change like this must never be
   * "resolved" purely offline, so an offline attempt throws before ever calling the API.
   */
  const leaveCouple = useCallback(async (): Promise<LeaveCoupleResponseDto> => {
    const online = await getIsOnline();
    if (!online) {
      throw new Error('You need to be online to leave your couple.');
    }

    // Captured before the API call so the cleanup below still knows which couple to remove even
    // though the server (and, in a moment, our own session) will no longer say we belong to one.
    const localCouple = await coupleRepository.getLocalCouple();

    const result = await api.leaveCouple();

    if (result.left) {
      if (localCouple) {
        await coupleRepository.removeLocalCoupleAndData(localCouple.id);
      }
      // No fresh token is issued for this — GetMyCoupleAsync/SyncService already reject a stale
      // coupleId claim server-side, so this is purely a local reconciliation (see clearCoupleId's
      // own doc comment), not something relied on for security.
      await clearCoupleId();
    }

    await queryClient.invalidateQueries({ queryKey: ['couple', 'local'] });
    await queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    await queryClient.invalidateQueries({ queryKey: ['calendar-event'] });

    return result;
  }, [clearCoupleId, queryClient]);

  return { createCouple, finalizeCoupleAction, joinCouple, leaveCouple };
}
