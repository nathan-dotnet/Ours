import { Platform } from 'react-native';

const mockHasHardwareAsync = jest.fn();
const mockIsEnrolledAsync = jest.fn();
const mockSupportedAuthenticationTypesAsync = jest.fn();
const mockAuthenticateAsync = jest.fn();

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: (...args: unknown[]) => mockHasHardwareAsync(...args),
  isEnrolledAsync: (...args: unknown[]) => mockIsEnrolledAsync(...args),
  supportedAuthenticationTypesAsync: (...args: unknown[]) => mockSupportedAuthenticationTypesAsync(...args),
  authenticateAsync: (...args: unknown[]) => mockAuthenticateAsync(...args),
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
}));

const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn();
const mockDeleteItemAsync = jest.fn();

jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
  deleteItemAsync: (...args: unknown[]) => mockDeleteItemAsync(...args),
}));

import {
  disableBiometricLogin,
  enableBiometricLogin,
  getBiometricCapability,
  isBiometricLoginEnabled,
  unlockWithBiometrics,
} from '../biometricAuth';

describe('getBiometricCapability', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports unavailable when there is no hardware', async () => {
    mockHasHardwareAsync.mockResolvedValue(false);
    mockIsEnrolledAsync.mockResolvedValue(false);

    expect(await getBiometricCapability()).toEqual({ available: false, type: 'other' });
  });

  it('reports unavailable when hardware exists but nothing is enrolled', async () => {
    mockHasHardwareAsync.mockResolvedValue(true);
    mockIsEnrolledAsync.mockResolvedValue(false);

    expect(await getBiometricCapability()).toEqual({ available: false, type: 'other' });
  });

  it('identifies Face ID as "facial"', async () => {
    mockHasHardwareAsync.mockResolvedValue(true);
    mockIsEnrolledAsync.mockResolvedValue(true);
    mockSupportedAuthenticationTypesAsync.mockResolvedValue([2]);

    expect(await getBiometricCapability()).toEqual({ available: true, type: 'facial' });
  });

  it('identifies a fingerprint sensor as "fingerprint"', async () => {
    mockHasHardwareAsync.mockResolvedValue(true);
    mockIsEnrolledAsync.mockResolvedValue(true);
    mockSupportedAuthenticationTypesAsync.mockResolvedValue([1]);

    expect(await getBiometricCapability()).toEqual({ available: true, type: 'fingerprint' });
  });

  it('prefers fingerprint when a device reports both types (e.g. Android face-unlock hardware present but only a fingerprint enrolled)', async () => {
    mockHasHardwareAsync.mockResolvedValue(true);
    mockIsEnrolledAsync.mockResolvedValue(true);
    mockSupportedAuthenticationTypesAsync.mockResolvedValue([2, 1]);

    expect(await getBiometricCapability()).toEqual({ available: true, type: 'fingerprint' });
  });
});

describe('enableBiometricLogin / isBiometricLoginEnabled / disableBiometricLogin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true });
  });

  it('on iOS, does not write anything if the confirm-it-works authentication fails', async () => {
    mockAuthenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' });

    const result = await enableBiometricLogin();

    expect(result).toBe(false);
    expect(mockSetItemAsync).not.toHaveBeenCalled();
  });

  it('on iOS, writes the gated lock and the enabled flag once authentication succeeds', async () => {
    mockAuthenticateAsync.mockResolvedValue({ success: true });
    mockSetItemAsync.mockResolvedValue(undefined);

    const result = await enableBiometricLogin();

    expect(result).toBe(true);
    expect(mockSetItemAsync).toHaveBeenCalledWith(
      'ours.biometric_lock',
      expect.any(String),
      expect.objectContaining({ requireAuthentication: true }),
    );
    expect(mockSetItemAsync).toHaveBeenCalledWith('ours.biometric_enabled', 'true');
  });

  it('on Android, skips the extra authenticateAsync call and writes directly (the gated write itself requires auth there)', async () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
    mockSetItemAsync.mockResolvedValue(undefined);

    const result = await enableBiometricLogin();

    expect(result).toBe(true);
    expect(mockAuthenticateAsync).not.toHaveBeenCalled();
  });

  it('isBiometricLoginEnabled reflects the stored flag', async () => {
    mockGetItemAsync.mockResolvedValueOnce(null);
    expect(await isBiometricLoginEnabled()).toBe(false);

    mockGetItemAsync.mockResolvedValueOnce('true');
    expect(await isBiometricLoginEnabled()).toBe(true);
  });

  it('disableBiometricLogin removes both keys and never throws even if they are already gone', async () => {
    mockDeleteItemAsync.mockRejectedValue(new Error('not found'));

    await expect(disableBiometricLogin()).resolves.toBeUndefined();
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('ours.biometric_lock');
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('ours.biometric_enabled');
  });
});

describe('unlockWithBiometrics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns not_enabled when the preference flag is off', async () => {
    mockGetItemAsync.mockResolvedValueOnce(null); // isBiometricLoginEnabled check

    expect(await unlockWithBiometrics()).toBe('not_enabled');
    expect(mockGetItemAsync).toHaveBeenCalledTimes(1); // never attempted the gated read
  });

  it('returns unlocked when the gated read succeeds', async () => {
    mockGetItemAsync.mockResolvedValueOnce('true'); // enabled flag
    mockGetItemAsync.mockResolvedValueOnce('some-opaque-value'); // the gated lock

    expect(await unlockWithBiometrics()).toBe('unlocked');
  });

  it('returns cancelled when the gated read throws (user cancelled / failed / key invalidated)', async () => {
    mockGetItemAsync.mockResolvedValueOnce('true');
    mockGetItemAsync.mockRejectedValueOnce(new Error('user_cancel'));

    expect(await unlockWithBiometrics()).toBe('cancelled');
  });
});
