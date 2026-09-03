import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { isBiometricLoginEnabled } from '../services/biometricAuth';
import type { AuthResponseDto, UserDto } from '../types/api';

const SESSION_KEY = 'ours.session';

export interface AuthSession {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  user: UserDto;
}

interface AuthState {
  session: AuthSession | null;
  /** False until hydrate() has resolved once — guards against briefly rendering the auth screens before we know a session exists. */
  isHydrated: boolean;
  /**
   * Independent of `session` — a restored session doesn't by itself mean "show the app" when
   * biometric login is enabled. `hydrate()` still always restores `session` from SecureStore
   * exactly as before biometrics existed; this flag additionally has to be true (passed once per
   * launch, by a fresh login/refresh or a successful biometric unlock — see useBiometricAuth)
   * before the root layout treats the user as authenticated. Kept as a separate flag rather than
   * gating `session` itself so nothing about the existing session/token machinery has to change.
   */
  isBiometricGatePassed: boolean;
  hydrate: () => Promise<void>;
  setSession: (auth: AuthResponseDto) => Promise<void>;
  /** Swaps in a fresh token pair for the same user (used after refresh, and after create/join couple re-issues tokens with an updated coupleId claim). */
  updateTokens: (auth: AuthResponseDto) => Promise<void>;
  clearSession: () => Promise<void>;
  /**
   * Patches the couple off the current session without a fresh server token — used when this
   * device learns its couple ended (its own "leave couple" call, or a partner's tombstone
   * arriving through sync pull) so routing (the root layout's `hasCouple` guard) and the sync
   * engine's own "do I have a couple" check react immediately, rather than waiting on whatever
   * eventually triggers this user's next token refresh. The couple itself was already ended
   * server-side by the time either caller reaches this — this only reconciles local state.
   */
  clearCoupleId: () => Promise<void>;
}

function toSession(auth: AuthResponseDto): AuthSession {
  return {
    accessToken: auth.accessToken,
    accessTokenExpiresAt: auth.accessTokenExpiresAt,
    refreshToken: auth.refreshToken,
    user: auth.user,
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  isHydrated: false,
  isBiometricGatePassed: true,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(SESSION_KEY);
      const session = raw ? (JSON.parse(raw) as AuthSession) : null;
      // No point gating a launch that has no session to protect in the first place.
      const needsBiometricGate = session !== null && (await isBiometricLoginEnabled());
      set({ session, isHydrated: true, isBiometricGatePassed: !needsBiometricGate });
    } catch {
      // A corrupt/unreadable stored session shouldn't crash startup — treat as logged out.
      set({ session: null, isHydrated: true, isBiometricGatePassed: true });
    }
  },

  setSession: async (auth) => {
    const session = toSession(auth);
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
    // A fresh login/register just proved identity with a password — nothing left to gate this launch.
    set({ session, isBiometricGatePassed: true });
  },

  updateTokens: async (auth) => {
    const session = toSession(auth);
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
    // Also reached by a successful biometric unlock (see useBiometricAuth) once the restored
    // session is confirmed valid server-side — that's what actually passes the gate, not the
    // OS biometric check by itself.
    set({ session, isBiometricGatePassed: true });
  },

  clearSession: async () => {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    set({ session: null, isBiometricGatePassed: true });
  },

  clearCoupleId: async () => {
    const current = get().session;
    if (!current || current.user.coupleId === null) return;
    const updated: AuthSession = { ...current, user: { ...current.user, coupleId: null } };
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(updated));
    set({ session: updated });
  },
}));
