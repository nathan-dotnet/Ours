import { useCallback } from 'react';
import { coupleRepository } from '../repositories/coupleRepository';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { triggerSync } from '../sync';
import type { LoginFormValues, RegisterFormValues } from '../validation/auth';

/**
 * Wraps the always-online identity/couple-bootstrap calls (register, login, create/join couple
 * aren't things a brand-new device can do offline — there's no local data to act on yet) with
 * the local session + SQLite bookkeeping that lets everything afterward be offline-first.
 */
export function useAuthActions() {
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);

  const register = useCallback(
    async (values: RegisterFormValues) => {
      const auth = await api.register(values.email, values.password, values.displayName);
      await setSession(auth);
    },
    [setSession],
  );

  const login = useCallback(
    async (values: LoginFormValues) => {
      const auth = await api.login(values.email, values.password);
      await setSession(auth);

      if (auth.user.coupleId) {
        // A returning user on a fresh/reinstalled device has no local couple row yet, and the
        // generic sync pull only *updates* an existing row (it can't know to create one, or
        // seed membership) — so this one-time fetch seeds SQLite before the sync engine takes
        // over with incremental changes.
        try {
          const couple = await api.getMyCouple();
          await coupleRepository.upsertFromServer(couple);
        } catch {
          // Non-fatal: the next successful sync pass will eventually reconcile this.
        }
      }

      triggerSync();
    },
    [setSession],
  );

  const logout = useCallback(async () => {
    if (session) {
      try {
        await api.logout(session.refreshToken);
      } catch {
        // Best-effort server-side revocation — clearing the local session is what actually matters.
      }
    }
    await clearSession();
  }, [session, clearSession]);

  return { register, login, logout };
}
