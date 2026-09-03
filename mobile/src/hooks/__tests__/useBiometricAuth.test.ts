const mockUnlockWithBiometrics = jest.fn();
const mockDisableBiometricLogin = jest.fn();

jest.mock('../../services/biometricAuth', () => ({
  ...jest.requireActual('../../services/biometricAuth'),
  unlockWithBiometrics: (...args: unknown[]) => mockUnlockWithBiometrics(...args),
  disableBiometricLogin: (...args: unknown[]) => mockDisableBiometricLogin(...args),
}));

const mockRefreshSession = jest.fn();
jest.mock('../../services/api', () => ({
  api: { refreshSession: (...args: unknown[]) => mockRefreshSession(...args) },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

import { useAuthStore } from '../../stores/authStore';
import { attemptBiometricLogin } from '../useBiometricAuth';

const session = {
  accessToken: 'token',
  accessTokenExpiresAt: '2026-01-01T00:00:00.000Z',
  refreshToken: 'refresh-token',
  user: { id: 'user-1', email: 'alice@example.com', displayName: 'Alice', coupleId: 'couple-1' },
};

describe('attemptBiometricLogin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ session: null, isHydrated: true, isBiometricGatePassed: false });
  });

  it('passes through not_enabled without touching the session', async () => {
    mockUnlockWithBiometrics.mockResolvedValue('not_enabled');

    expect(await attemptBiometricLogin()).toBe('not_enabled');
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it('passes through cancelled without touching the session', async () => {
    mockUnlockWithBiometrics.mockResolvedValue('cancelled');

    expect(await attemptBiometricLogin()).toBe('cancelled');
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it('disables biometrics and reports session_invalid when the OS gate passes but there is no local session', async () => {
    mockUnlockWithBiometrics.mockResolvedValue('unlocked');
    useAuthStore.setState({ session: null });

    expect(await attemptBiometricLogin()).toBe('session_invalid');
    expect(mockDisableBiometricLogin).toHaveBeenCalled();
  });

  it('reports success once the OS gate passes and the server confirms the session is still valid', async () => {
    mockUnlockWithBiometrics.mockResolvedValue('unlocked');
    useAuthStore.setState({ session });
    mockRefreshSession.mockResolvedValue({
      accessToken: 'fresh',
      accessTokenExpiresAt: '2026-01-01T01:00:00.000Z',
      refreshToken: 'fresh-refresh',
      user: session.user,
    });

    expect(await attemptBiometricLogin()).toBe('success');
    expect(mockDisableBiometricLogin).not.toHaveBeenCalled();
  });

  it('never grants access on a revoked/expired session — clears it and disables biometrics instead of retrying', async () => {
    mockUnlockWithBiometrics.mockResolvedValue('unlocked');
    useAuthStore.setState({ session });
    mockRefreshSession.mockRejectedValue(new Error('Session expired. Please log in again.'));

    expect(await attemptBiometricLogin()).toBe('session_invalid');
    expect(mockDisableBiometricLogin).toHaveBeenCalled();
  });
});
