import * as Clipboard from 'expo-clipboard';
import { api } from './api';
import { getIsOnline } from './connectivity';
import { authenticateToRevealPassword } from './vaultAuth';

/** How long a copied password stays on the clipboard before this app clears it again. */
export const CLIPBOARD_CLEAR_MS = 30_000;

export type VaultRevealFailureReason = 'offline' | 'auth_unavailable' | 'auth_cancelled';

export class VaultRevealError extends Error {
  constructor(
    public reason: VaultRevealFailureReason,
    message: string,
  ) {
    super(message);
    this.name = 'VaultRevealError';
  }
}

/**
 * The only path anywhere in the app that ever produces a plaintext vault password — always
 * gated by both connectivity (this device never holds the decryption key; decrypting is
 * inherently a server round trip) and a fresh local authentication check, never just "the user
 * is logged in." The returned password is never logged, and the caller (see vault/[id].tsx) is
 * expected to let it go out of scope as soon as it's shown/copied rather than holding onto it.
 *
 * A plain async function, not a hook — there's no component state involved, so it's directly
 * callable (and testable) without a React render context.
 */
export async function revealVaultPassword(itemId: string): Promise<string> {
  const online = await getIsOnline();
  if (!online) {
    throw new VaultRevealError('offline', 'You need to be online to reveal this password.');
  }

  const authResult = await authenticateToRevealPassword('Reveal Password');
  if (authResult === 'unavailable') {
    throw new VaultRevealError('auth_unavailable', 'Enable a device passcode or biometrics to reveal passwords.');
  }
  if (authResult !== 'authenticated') {
    throw new VaultRevealError('auth_cancelled', 'Authentication was cancelled.');
  }

  const { password } = await api.revealVaultPassword(itemId);
  return password;
}

/**
 * Reveals (same online + authentication gate) then copies to the clipboard, clearing it again
 * after CLIPBOARD_CLEAR_MS — but only if the clipboard still holds exactly what was copied, so
 * this never clobbers something else the user copied in the meantime.
 */
export async function copyVaultPassword(itemId: string): Promise<void> {
  const password = await revealVaultPassword(itemId);
  await Clipboard.setStringAsync(password);
  setTimeout(() => {
    Clipboard.getStringAsync()
      .then((current) => {
        if (current === password) {
          return Clipboard.setStringAsync('');
        }
      })
      .catch(() => undefined);
  }, CLIPBOARD_CLEAR_MS);
}
