import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { generateUuid } from '../utils/uuid';

const ENABLED_FLAG_KEY = 'ours.biometric_enabled';
const LOCK_KEY = 'ours.biometric_lock';
const AUTH_PROMPT = 'Log in to Ours';

export type BiometricType = 'facial' | 'fingerprint' | 'other';

export interface BiometricCapability {
  available: boolean;
  type: BiometricType;
}

/**
 * Whether this device *could* offer biometric login right now (hardware present and at least
 * one biometric enrolled) — not whether the user has actually turned it on for this app.
 */
export async function getBiometricCapability(): Promise<BiometricCapability> {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  if (!hasHardware || !isEnrolled) {
    return { available: false, type: 'other' };
  }

  // Fingerprint is checked first: on Android, supportedAuthenticationTypesAsync() reflects what
  // the device's hardware could technically do, not what the user actually enrolled per type — a
  // phone with only a fingerprint sensor set up can still report FACIAL_RECOGNITION as "supported"
  // because of its front camera. iOS has no such overlap (Face ID and Touch ID are mutually
  // exclusive per device), so this ordering is safe there too.
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const type: BiometricType = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
    ? 'fingerprint'
    : types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
      ? 'facial'
      : 'other';

  return { available: true, type };
}

export function biometricLabel(type: BiometricType): string {
  switch (type) {
    case 'facial':
      return 'Face ID';
    case 'fingerprint':
      return 'Fingerprint';
    default:
      return 'Biometrics';
  }
}

export async function isBiometricLoginEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ENABLED_FLAG_KEY)) === 'true';
}

/**
 * Enables biometric quick-login. Doesn't store any credential or session data itself — it writes
 * a throwaway opaque value under a SecureStore key created with `requireAuthentication: true`, so
 * the OS (Keychain/Keystore) — not this app — gates every future read of it behind Face
 * ID/Fingerprint/device credential. That gate is all biometric login ever checks; the actual
 * session lives where it always has (the plain, ungated session key authStore already manages).
 *
 * Requires a real successful authentication before turning on, per the "enabling it again
 * requires a successful authentication flow" rule — returns false without changing anything if
 * the user cancels or fails.
 */
export async function enableBiometricLogin(): Promise<boolean> {
  // iOS only prompts the user when *updating* an existing gated value, not when creating one, so
  // creating the lock silently wouldn't actually prove the user can authenticate there. Android's
  // own write already requires authentication for a `requireAuthentication` key, so skip this
  // explicit step there to avoid two prompts back to back.
  if (Platform.OS === 'ios') {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: AUTH_PROMPT });
    if (!result.success) {
      return false;
    }
  }

  try {
    await SecureStore.setItemAsync(LOCK_KEY, generateUuid(), {
      requireAuthentication: true,
      authenticationPrompt: AUTH_PROMPT,
    });
    await SecureStore.setItemAsync(ENABLED_FLAG_KEY, 'true');
    return true;
  } catch {
    return false;
  }
}

/** Disables biometric login and removes the biometric-gated material — normal login keeps working. */
export async function disableBiometricLogin(): Promise<void> {
  await SecureStore.deleteItemAsync(LOCK_KEY).catch(() => undefined);
  await SecureStore.deleteItemAsync(ENABLED_FLAG_KEY).catch(() => undefined);
}

export type BiometricUnlockResult = 'unlocked' | 'cancelled' | 'not_enabled';

/**
 * Attempts the OS-level biometric gate. 'unlocked' means the OS confirmed the user's identity —
 * it says nothing about whether the session material behind it is still valid server-side; the
 * caller (see useBiometricAuth) still has to validate that through the normal refresh-token flow.
 */
export async function unlockWithBiometrics(): Promise<BiometricUnlockResult> {
  if (!(await isBiometricLoginEnabled())) {
    return 'not_enabled';
  }

  try {
    const value = await SecureStore.getItemAsync(LOCK_KEY, {
      requireAuthentication: true,
      authenticationPrompt: AUTH_PROMPT,
    });
    return value !== null ? 'unlocked' : 'cancelled';
  } catch {
    // Cancellation, failed authentication, or a key invalidated by an enrollment change (e.g. a
    // new fingerprint was added) all surface here — all mean the same thing to the caller: the
    // gate wasn't passed, fall back to normal login.
    return 'cancelled';
  }
}
