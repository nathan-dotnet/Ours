import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import * as biometricAuth from '../services/biometricAuth';
import { useAuthStore } from '../stores/authStore';

/** Whether this device could offer biometric login at all (hardware + enrollment) — checked once per mount. */
export function useBiometricCapability() {
  const [capability, setCapability] = useState<biometricAuth.BiometricCapability | null>(null);

  useEffect(() => {
    let cancelled = false;
    biometricAuth.getBiometricCapability().then((result) => {
      if (!cancelled) setCapability(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return capability;
}

/** Reactive mirror of the SecureStore-backed preference flag — for the Settings toggle and the Login screen's "Use Face ID" button. `refresh` re-reads it after enabling/disabling. */
export function useBiometricLoginEnabled() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    setEnabled(await biometricAuth.isBiometricLoginEnabled());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return [enabled, refresh] as const;
}

export type BiometricLoginOutcome = 'success' | 'not_enabled' | 'cancelled' | 'session_invalid';

/**
 * Attempts to restore the current device's session via biometrics: the OS-level gate first, then
 * the existing refresh-token flow to confirm the session is still valid server-side — biometrics
 * alone never grant access, matching "the server must remain the authority for authentication."
 * A revoked/expired/reused session is cleared (and biometric login turned off) rather than
 * silently retried, so a stale "quick login" preference never lingers.
 */
export async function attemptBiometricLogin(): Promise<BiometricLoginOutcome> {
  const gateResult = await biometricAuth.unlockWithBiometrics();
  if (gateResult !== 'unlocked') {
    return gateResult;
  }

  const session = useAuthStore.getState().session;
  if (!session) {
    // The OS gate succeeded but there's no local session to restore (cleared elsewhere) — the
    // preference is stale by definition.
    await biometricAuth.disableBiometricLogin();
    return 'session_invalid';
  }

  try {
    await api.refreshSession();
    return 'success';
  } catch {
    await biometricAuth.disableBiometricLogin();
    return 'session_invalid';
  }
}
