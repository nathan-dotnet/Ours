import * as LocalAuthentication from 'expo-local-authentication';

/**
 * Reveal/copy is gated by a fresh local authentication check — not "the user is logged into
 * Ours" (a session can sit unlocked for hours). Deliberately a separate, lighter-weight check
 * from `biometricAuth.ts`'s login flow: this isn't restoring a session, just proving "you're the
 * person holding this device right now" before decrypting one password. `disableDeviceFallback:
 * false` (the default) is what gives the "secure fallback consistent with the app's existing
 * design" the spec asks for — iOS/Android both fall back to the device passcode automatically
 * when biometrics aren't available/fail, with no extra code needed here.
 */
export type RevealAuthResult = 'authenticated' | 'cancelled' | 'unavailable';

export async function authenticateToRevealPassword(promptMessage = 'Reveal Password'): Promise<RevealAuthResult> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  if (!hasHardware && !isEnrolled) {
    // No biometric hardware AND (implicitly, since isEnrolledAsync also covers device-credential
    // enrollment on most platforms) no device passcode set either — there is no secure local gate
    // this device can offer at all. Fail closed rather than silently skipping the check.
    return 'unavailable';
  }

  const result = await LocalAuthentication.authenticateAsync({ promptMessage, disableDeviceFallback: false });
  if (result.success) {
    return 'authenticated';
  }
  return result.error === 'not_available' || result.error === 'not_enrolled' ? 'unavailable' : 'cancelled';
}
