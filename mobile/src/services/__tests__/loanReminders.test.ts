import { Platform } from 'react-native';
import type { Loan } from '../../types/entities';

const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockSetNotificationChannelAsync = jest.fn();
const mockGetAllScheduledNotificationsAsync = jest.fn();
const mockCancelScheduledNotificationAsync = jest.fn();
const mockScheduleNotificationAsync = jest.fn();

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  setNotificationChannelAsync: (...args: unknown[]) => mockSetNotificationChannelAsync(...args),
  getAllScheduledNotificationsAsync: (...args: unknown[]) => mockGetAllScheduledNotificationsAsync(...args),
  cancelScheduledNotificationAsync: (...args: unknown[]) => mockCancelScheduledNotificationAsync(...args),
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args),
  AndroidImportance: { MAX: 5 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('../api', () => ({ api: { registerPushToken: jest.fn(), unregisterPushToken: jest.fn() } }));

import { isLoanReminderNotification, syncScheduledLoanReminders } from '../loanReminders';

const ALICE = 'user-alice';

function loan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: 'loan-1',
    couple_id: 'couple-1',
    name: 'Shopee PayLater',
    provider: 'Shopee',
    original_amount_cents: 3_000_00,
    monthly_payment_cents: 1_000_00,
    total_installments: 3,
    first_due_date: '2026-09-15',
    frequency: 'Monthly',
    fees_amount_cents: null,
    currency: 'PHP',
    payment_account_id: 'account-1',
    owner_user_id: null,
    created_by_user_id: ALICE,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    updated_by_user_id: ALICE,
    version: 1,
    is_deleted: 0,
    ...overrides,
  };
}

describe('syncScheduledLoanReminders', () => {
  const today = new Date(2026, 8, 1, 12, 0, 0);

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true });
    mockGetPermissionsAsync.mockResolvedValue({ granted: true });
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([]);
    mockScheduleNotificationAsync.mockResolvedValue('some-id');
    mockCancelScheduledNotificationAsync.mockResolvedValue(undefined);
  });

  it('creates the Android notification channel, but not on iOS', async () => {
    await syncScheduledLoanReminders([loan()], [], ALICE, today);
    expect(mockSetNotificationChannelAsync).not.toHaveBeenCalled();

    Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
    await syncScheduledLoanReminders([loan()], [], ALICE, today);
    expect(mockSetNotificationChannelAsync).toHaveBeenCalledWith('loan-reminders', expect.objectContaining({ importance: 5, sound: 'default' }));
  });

  it('does nothing when notification permission is denied', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: false });
    mockRequestPermissionsAsync.mockResolvedValue({ granted: false });

    await syncScheduledLoanReminders([loan()], [], ALICE, today);

    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules the 4 reminders for the next unpaid installment, each with its own stable identifier', async () => {
    await syncScheduledLoanReminders([loan()], [], ALICE, today);

    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(4);
    const identifiers = mockScheduleNotificationAsync.mock.calls.map(([request]) => request.identifier);
    expect(identifiers).toEqual(
      expect.arrayContaining([
        'loan-reminder:loan-1:2026-09-15:3-day',
        'loan-reminder:loan-1:2026-09-15:1-day',
        'loan-reminder:loan-1:2026-09-15:due-today',
        'loan-reminder:loan-1:2026-09-15:overdue',
      ]),
    );
  });

  it('cancels every previously-scheduled loan reminder before rescheduling, leaving unrelated notifications alone', async () => {
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'loan-reminder:loan-1:2026-08-15:overdue' },
      { identifier: 'some-other-feature:xyz' },
    ]);

    await syncScheduledLoanReminders([loan()], [], ALICE, today);

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('loan-reminder:loan-1:2026-08-15:overdue');
  });

  it('re-running with the same loan/payments/today reschedules the exact same identifiers — idempotent', async () => {
    await syncScheduledLoanReminders([loan()], [], ALICE, today);
    const firstRunIdentifiers = mockScheduleNotificationAsync.mock.calls.map(([request]) => request.identifier).sort();

    mockScheduleNotificationAsync.mockClear();
    await syncScheduledLoanReminders([loan()], [], ALICE, today);
    const secondRunIdentifiers = mockScheduleNotificationAsync.mock.calls.map(([request]) => request.identifier).sort();

    expect(secondRunIdentifiers).toEqual(firstRunIdentifiers);
  });

  it('schedules nothing for a fully paid-off loan', async () => {
    const payment = {
      id: 'p1', couple_id: 'couple-1', type: 'LoanPayment', amount_cents: 3_000_00, currency: 'PHP',
      account_id: 'account-1', destination_account_id: null, category: null, savings_goal_id: null,
      loan_id: 'loan-1', description: null, transaction_date: '2026-09-01', notes: null,
      paid_by_user_id: ALICE, created_by_user_id: ALICE, created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z', updated_by_user_id: ALICE, version: 1, is_deleted: 0,
    };

    await syncScheduledLoanReminders([loan()], [payment], ALICE, today);

    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('never throws, even when a step fails', async () => {
    mockScheduleNotificationAsync.mockRejectedValue(new Error('platform error'));

    await expect(syncScheduledLoanReminders([loan()], [], ALICE, today)).resolves.toBeUndefined();
  });
});

describe('isLoanReminderNotification', () => {
  it('extracts the loanId only from a loan-reminder payload', () => {
    expect(isLoanReminderNotification({ kind: 'loan-reminder', loanId: 'loan-1' })).toEqual({ loanId: 'loan-1' });
    expect(isLoanReminderNotification({ kind: 'miss-me' })).toBeNull();
    expect(isLoanReminderNotification(undefined)).toBeNull();
  });
});
