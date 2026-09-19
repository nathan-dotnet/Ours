import { Platform } from 'react-native';
import type { Loan, Transaction } from '../types/entities';
import { planLoanReminders } from '../utils/loanReminders';
import { ensureNotificationPermissionAsync } from './pushNotifications';

/**
 * Loan due-date reminders — local, on-device scheduled notifications (never a server round trip;
 * see utils/loanReminders.ts's own doc comment for why: every due date is already known the
 * moment a loan/payment is synced locally). Same guarded-`expo-notifications`-require pattern as
 * pushNotifications.ts (see its own doc comment for why a plain top-level import would crash the
 * app in Expo Go on Android), and its own Android channel so a couple can mute loan reminders
 * independently of Miss You.
 */

type NotificationsModule = typeof import('expo-notifications');

const Notifications: NotificationsModule | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications');
  } catch {
    return null;
  }
})();

const ANDROID_CHANNEL_ID = 'loan-reminders';
const REMINDER_PREFIX = 'loan-reminder:';

async function ensureAndroidChannelAsync(): Promise<void> {
  if (Platform.OS !== 'android' || !Notifications) return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Loan Reminders',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#E0A44C',
  });
}

/**
 * Cancels every currently-scheduled loan reminder, then schedules exactly what
 * `planLoanReminders` says should exist right now. A full cancel-then-reschedule sweep (rather
 * than diffing against what's already pending) is what keeps this trivially idempotent — call it
 * as often as you like (after a loan create/edit, after a payment, after every sync pull — see
 * useLoans.ts's useLoanReminderScheduler) and it always converges to the same end state, which is
 * exactly the "LoanId + ScheduledDate + ReminderType stays a stable identifier" duplicate-
 * protection the Loans spec asks for: scheduling a request with an identifier that's already
 * pending simply replaces it, it never queues a second copy.
 *
 * Silently does nothing (never throws) wherever push isn't available (Expo Go on Android, no
 * permission granted, etc.) — a missing reminder should never block using the app.
 */
export async function syncScheduledLoanReminders(loans: Loan[], transactions: Transaction[], currentUserId: string, now: Date = new Date()): Promise<void> {
  try {
    if (!Notifications) return;

    await ensureAndroidChannelAsync();
    if (!(await ensureNotificationPermissionAsync())) return;

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((request) => request.identifier.startsWith(REMINDER_PREFIX))
        .map((request) => Notifications!.cancelScheduledNotificationAsync(request.identifier)),
    );

    const planned = planLoanReminders(loans, transactions, currentUserId, now);
    await Promise.all(
      planned.map((reminder) =>
        Notifications!.scheduleNotificationAsync({
          identifier: reminder.identifier,
          content: {
            title: reminder.title,
            body: reminder.body,
            sound: 'default',
            data: reminder.data,
          },
          trigger: {
            type: Notifications!.SchedulableTriggerInputTypes.DATE,
            date: reminder.triggerAt,
            channelId: ANDROID_CHANNEL_ID,
          },
        }),
      ),
    );
  } catch {
    // Best-effort, same reasoning as pushNotifications.ts's registerPushToken.
  }
}

/** What a loan reminder's `data` payload means for in-app navigation — mirrors isMissMeNotification. */
export function isLoanReminderNotification(data: Record<string, unknown> | undefined): { loanId: string } | null {
  if (data?.kind !== 'loan-reminder' || typeof data.loanId !== 'string') return null;
  return { loanId: data.loanId };
}
