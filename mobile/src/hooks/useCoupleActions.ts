import { useCallback } from 'react';
import { coupleRepository } from '../repositories/coupleRepository';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { triggerSync } from '../sync';
import type { CoupleActionResponseDto } from '../types/api';
import type { JoinCoupleFormValues } from '../validation/couple';

/**
 * Create/join require the server (a globally-unique invite code has to come from somewhere,
 * and joining links two accounts together) — they're the one place in the app that isn't
 * offline-capable by nature. Once they succeed, everything that follows (viewing/editing the
 * couple) goes through SQLite + the sync queue like any other feature.
 */
export function useCoupleActions() {
  const updateTokens = useAuthStore((s) => s.updateTokens);

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

  return { createCouple, finalizeCoupleAction, joinCouple };
}
