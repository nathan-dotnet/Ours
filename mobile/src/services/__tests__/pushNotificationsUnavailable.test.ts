/**
 * Simulates exactly what happens opening the app in Expo Go on Android (SDK 53+): requiring
 * `expo-notifications` throws synchronously. A separate file from pushNotifications.test.ts
 * because this mock must throw at require-time, which can't coexist with that file's
 * fully-mocked, working version of the same module.
 */
jest.mock('expo-notifications', () => {
  throw new Error(
    "expo-notifications: Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go with the release of SDK 53.",
  );
});

jest.mock('expo-device', () => ({ isDevice: true }));

const mockGetItemAsync = jest.fn();
jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('../api', () => ({
  api: { registerPushToken: jest.fn(), unregisterPushToken: jest.fn() },
}));

import {
  addNotificationResponseListener,
  getLaunchNotificationResponseAsync,
  registerNotificationHandler,
  registerPushToken,
  unregisterPushToken,
} from '../pushNotifications';

describe('pushNotifications when expo-notifications fails to load (e.g. Expo Go on Android)', () => {
  it('registerNotificationHandler does not throw', () => {
    expect(() => registerNotificationHandler()).not.toThrow();
  });

  it('registerPushToken resolves without throwing, and registers nothing', async () => {
    await expect(registerPushToken()).resolves.toBeUndefined();
  });

  it('getLaunchNotificationResponseAsync resolves null instead of throwing', async () => {
    await expect(getLaunchNotificationResponseAsync()).resolves.toBeNull();
  });

  it('addNotificationResponseListener returns a safe no-op subscription', () => {
    const subscription = addNotificationResponseListener(() => undefined);
    expect(() => subscription.remove()).not.toThrow();
  });

  it('unregisterPushToken still works (it never touches expo-notifications)', async () => {
    mockGetItemAsync.mockResolvedValue(null);
    await expect(unregisterPushToken()).resolves.toBeUndefined();
  });
});
