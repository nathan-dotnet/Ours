import { Platform } from 'react-native';

const mockIsDevice = { value: true };
jest.mock('expo-device', () => ({
  get isDevice() {
    return mockIsDevice.value;
  },
}));

const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockSetNotificationChannelAsync = jest.fn();
const mockGetExpoPushTokenAsync = jest.fn();
const mockSetNotificationHandler = jest.fn();
const mockAddNotificationResponseReceivedListener = jest.fn();
const mockGetLastNotificationResponseAsync = jest.fn();

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  setNotificationChannelAsync: (...args: unknown[]) => mockSetNotificationChannelAsync(...args),
  getExpoPushTokenAsync: (...args: unknown[]) => mockGetExpoPushTokenAsync(...args),
  setNotificationHandler: (...args: unknown[]) => mockSetNotificationHandler(...args),
  addNotificationResponseReceivedListener: (...args: unknown[]) => mockAddNotificationResponseReceivedListener(...args),
  getLastNotificationResponseAsync: (...args: unknown[]) => mockGetLastNotificationResponseAsync(...args),
  AndroidImportance: { MAX: 5 },
}));

let mockExpoConfig: { extra?: { eas?: { projectId?: string } } } = { extra: { eas: { projectId: 'test-project-id' } } };
jest.mock('expo-constants', () => ({
  get expoConfig() {
    return mockExpoConfig;
  },
  easConfig: null,
}));

const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn();
const mockDeleteItemAsync = jest.fn();
jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
  deleteItemAsync: (...args: unknown[]) => mockDeleteItemAsync(...args),
}));

const mockRegisterPushToken = jest.fn();
const mockUnregisterPushToken = jest.fn();
jest.mock('../api', () => ({
  api: {
    registerPushToken: (...args: unknown[]) => mockRegisterPushToken(...args),
    unregisterPushToken: (...args: unknown[]) => mockUnregisterPushToken(...args),
  },
}));

import { isMissMeNotification, registerPushToken, unregisterPushToken } from '../pushNotifications';

describe('registerPushToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsDevice.value = true;
    mockExpoConfig.extra = { eas: { projectId: 'test-project-id' } };
    Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true });
    mockGetPermissionsAsync.mockResolvedValue({ granted: true });
    mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
    mockSetItemAsync.mockResolvedValue(undefined);
  });

  it('does nothing on a simulator/emulator', async () => {
    mockIsDevice.value = false;

    await registerPushToken();

    expect(mockGetPermissionsAsync).not.toHaveBeenCalled();
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
  });

  it('creates the Android notification channel before requesting a token, but not on iOS', async () => {
    await registerPushToken();
    expect(mockSetNotificationChannelAsync).not.toHaveBeenCalled();

    Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
    await registerPushToken();
    expect(mockSetNotificationChannelAsync).toHaveBeenCalledWith('default', expect.objectContaining({ importance: 5, sound: 'default' }));
  });

  it('skips requesting permission when already granted', async () => {
    await registerPushToken();

    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockGetExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'test-project-id' });
  });

  it('requests permission when not already granted, and proceeds if the user allows it', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: false });
    mockRequestPermissionsAsync.mockResolvedValue({ granted: true });

    await registerPushToken();

    expect(mockRequestPermissionsAsync).toHaveBeenCalled();
    expect(mockRegisterPushToken).toHaveBeenCalledWith('ExponentPushToken[abc]', 'ios');
  });

  it('registers nothing when the user denies permission', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: false });
    mockRequestPermissionsAsync.mockResolvedValue({ granted: false });

    await registerPushToken();

    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
  });

  it('registers nothing when no EAS project id is configured yet', async () => {
    mockExpoConfig.extra = { eas: { projectId: undefined } };

    await registerPushToken();

    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('sends the token to the backend and stores it locally on success', async () => {
    await registerPushToken();

    expect(mockRegisterPushToken).toHaveBeenCalledWith('ExponentPushToken[abc]', 'ios');
    expect(mockSetItemAsync).toHaveBeenCalledWith('ours_registered_push_token', 'ExponentPushToken[abc]');
  });

  it('never throws, even when a step fails', async () => {
    mockGetExpoPushTokenAsync.mockRejectedValue(new Error('network down'));

    await expect(registerPushToken()).resolves.toBeUndefined();
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
  });
});

describe('unregisterPushToken', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does nothing when no token was ever registered on this device', async () => {
    mockGetItemAsync.mockResolvedValue(null);

    await unregisterPushToken();

    expect(mockUnregisterPushToken).not.toHaveBeenCalled();
  });

  it('unregisters the stored token from the backend and clears local storage', async () => {
    mockGetItemAsync.mockResolvedValue('ExponentPushToken[abc]');
    mockUnregisterPushToken.mockResolvedValue(undefined);

    await unregisterPushToken();

    expect(mockUnregisterPushToken).toHaveBeenCalledWith('ExponentPushToken[abc]');
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('ours_registered_push_token');
  });

  it('never throws, even when the server call fails', async () => {
    mockGetItemAsync.mockResolvedValue('ExponentPushToken[abc]');
    mockUnregisterPushToken.mockRejectedValue(new Error('offline'));

    await expect(unregisterPushToken()).resolves.toBeUndefined();
  });
});

describe('isMissMeNotification', () => {
  it('is true only for a Miss Me push payload', () => {
    expect(isMissMeNotification({ kind: 'miss-me' })).toBe(true);
    expect(isMissMeNotification({ kind: 'something-else' })).toBe(false);
    expect(isMissMeNotification(undefined)).toBe(false);
  });
});
