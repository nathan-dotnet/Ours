import { useCallback } from 'react';
import { coupleRepository } from '../repositories/coupleRepository';
import { api } from '../services/api';
import { disableBiometricLogin } from '../services/biometricAuth';
import { unregisterPushToken } from '../services/pushNotifications';
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
    // Best-effort, same reasoning as api.logout just below it — a signed-out device should stop
    // receiving notifications meant for this account, but a failure here must never block logout.
    await unregisterPushToken();
    if (session) {
      try {
        await api.logout(session.refreshToken);
      } catch {
        // Best-effort server-side revocation — clearing the local session is what actually matters.
      }
    }
    await clearSession();
    // An explicit logout ends biometric quick-login too — otherwise the biometric-gated material
    // would sit there implying "you can get back in with Face ID", which isn't true once you've
    // deliberately logged out. Re-enabling it requires a normal login again.
    await disableBiometricLogin();
  }, [session, clearSession]);

  const forgotPassword = useCallback(async (email: string) => {
    // The backend deliberately returns the same response whether or not the email exists — see
    // AuthController.ForgotPassword — so there's nothing to branch on here either.
    await api.forgotPassword(email);
  }, []);

  const resetPassword = useCallback(async (email: string, token: string, newPassword: string) => {
    // No session is established here by design — the user returns to Login and signs in with
    // their new password (see the mobile reset-password screen).
    await api.resetPassword(email, token, newPassword);
  }, []);

  return { register, login, logout, forgotPassword, resetPassword };
}
