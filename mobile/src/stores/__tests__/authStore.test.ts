const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn();
const mockDeleteItemAsync = jest.fn();

jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
  deleteItemAsync: (...args: unknown[]) => mockDeleteItemAsync(...args),
}));

import { useAuthStore, type AuthSession } from '../authStore';

const storedSession: AuthSession = {
  accessToken: 'token',
  accessTokenExpiresAt: '2026-01-01T00:00:00.000Z',
  refreshToken: 'refresh',
  user: { id: 'user-1', email: 'alice@example.com', displayName: 'Alice', coupleId: 'couple-1' },
};

const authResponse = {
  accessToken: 'token',
  accessTokenExpiresAt: '2026-01-01T00:00:00.000Z',
  refreshToken: 'refresh',
  user: storedSession.user,
};

describe('authStore biometric gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hydrate(): no stored session -> gate already passed (nothing to protect)', async () => {
    mockGetItemAsync.mockImplementation(async () => null);

    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().isBiometricGatePassed).toBe(true);
  });

  it('hydrate(): a stored session with biometrics NOT enabled restores it with the gate already passed (unchanged Phase 1 behavior)', async () => {
    mockGetItemAsync.mockImplementation(async (key: string) => {
      if (key === 'ours.session') return JSON.stringify(storedSession);
      if (key === 'ours.biometric_enabled') return null;
      return null;
    });

    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().session).toEqual(storedSession);
    expect(useAuthStore.getState().isBiometricGatePassed).toBe(true);
  });

  it('hydrate(): a stored session with biometrics enabled restores the session but leaves the gate unpassed', async () => {
    mockGetItemAsync.mockImplementation(async (key: string) => {
      if (key === 'ours.session') return JSON.stringify(storedSession);
      if (key === 'ours.biometric_enabled') return 'true';
      return null;
    });

    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().session).toEqual(storedSession);
    expect(useAuthStore.getState().isBiometricGatePassed).toBe(false);
  });

  it('setSession() always passes the gate — a fresh login/register already proved identity', async () => {
    useAuthStore.setState({ isBiometricGatePassed: false });

    await useAuthStore.getState().setSession(authResponse);

    expect(useAuthStore.getState().isBiometricGatePassed).toBe(true);
  });

  it('updateTokens() passes the gate — this is what a successful biometric-triggered refresh calls', async () => {
    useAuthStore.setState({ isBiometricGatePassed: false });

    await useAuthStore.getState().updateTokens(authResponse);

    expect(useAuthStore.getState().isBiometricGatePassed).toBe(true);
  });

  it('clearSession() resets the gate to passed (nothing left to protect)', async () => {
    useAuthStore.setState({ session: storedSession, isBiometricGatePassed: false });

    await useAuthStore.getState().clearSession();

    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().isBiometricGatePassed).toBe(true);
  });
});
