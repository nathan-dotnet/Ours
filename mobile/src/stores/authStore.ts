import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
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
  hydrate: () => Promise<void>;
  setSession: (auth: AuthResponseDto) => Promise<void>;
  /** Swaps in a fresh token pair for the same user (used after refresh, and after create/join couple re-issues tokens with an updated coupleId claim). */
  updateTokens: (auth: AuthResponseDto) => Promise<void>;
  clearSession: () => Promise<void>;
}

function toSession(auth: AuthResponseDto): AuthSession {
  return {
    accessToken: auth.accessToken,
    accessTokenExpiresAt: auth.accessTokenExpiresAt,
    refreshToken: auth.refreshToken,
    user: auth.user,
  };
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  isHydrated: false,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(SESSION_KEY);
      const session = raw ? (JSON.parse(raw) as AuthSession) : null;
      set({ session, isHydrated: true });
    } catch {
      // A corrupt/unreadable stored session shouldn't crash startup — treat as logged out.
      set({ session: null, isHydrated: true });
    }
  },

  setSession: async (auth) => {
    const session = toSession(auth);
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
    set({ session });
  },

  updateTokens: async (auth) => {
    const session = toSession(auth);
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
    set({ session });
  },

  clearSession: async () => {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    set({ session: null });
  },
}));
