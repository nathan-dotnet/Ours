/**
 * Simulates exactly what happens opening the app in Expo Go on Android (SDK 53+): requiring
 * `expo-notifications` throws synchronously. A separate file from loanReminders.test.ts because
 * this mock must throw at require-time, which can't coexist with that file's fully-mocked,
 * working version of the same module — same reasoning as pushNotificationsUnavailable.test.ts.
 */
jest.mock('expo-notifications', () => {
  throw new Error(
    "expo-notifications: Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go with the release of SDK 53.",
  );
});

jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('../api', () => ({ api: { registerPushToken: jest.fn(), unregisterPushToken: jest.fn() } }));

import { isLoanReminderNotification, syncScheduledLoanReminders } from '../loanReminders';

describe('loanReminders when expo-notifications fails to load (e.g. Expo Go on Android)', () => {
  it('syncScheduledLoanReminders resolves without throwing, and schedules nothing', async () => {
    await expect(syncScheduledLoanReminders([], [], 'user-1')).resolves.toBeUndefined();
  });

  it('isLoanReminderNotification still works (it never touches expo-notifications)', () => {
    expect(isLoanReminderNotification({ kind: 'loan-reminder', loanId: 'loan-1' })).toEqual({ loanId: 'loan-1' });
  });
});
