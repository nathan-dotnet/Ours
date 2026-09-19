import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { api } from './api';

/**
 * Real device push notifications (Miss You, and anything else that pushes later) — never an
 * in-app/local-only notification. See backend/Ours.Application/Services/MissMeService.cs for the
 * send side; this module is everything the app needs to (a) obtain an Expo push token and hand
 * it to the backend, and (b) decide where a tapped notification should navigate to.
 *
 * Requires a development build (or a store build) on Android — Expo Go dropped remote push
 * notification support on Android from SDK 53 onward. Local/in-app notifications still work in
 * Expo Go, but that's not what this is: see the module doc for `api.registerPushToken`.
 */

type NotificationsModule = typeof import('expo-notifications');

/**
 * `import * as Notifications from 'expo-notifications'` throws *synchronously*, at import time,
 * when this module is opened inside Expo Go on Android (SDK 53+ removed remote push support
 * there entirely — see the module doc above) — a plain top-level import can't be wrapped in a
 * try/catch, so a static import here would crash the whole app on launch in Expo Go, not just
 * this feature. A guarded `require()` is the standard escape hatch: it runs the same
 * module-initialization code, but as a normal function call a try/catch can actually catch, so
 * opening this app in Expo Go degrades to "no push notifications" instead of not opening at all.
 * A real development/production build still gets full push support as normal.
 */
const Notifications: NotificationsModule | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications');
  } catch {
    return null;
  }
})();

const PUSH_TOKEN_STORAGE_KEY = 'ours_registered_push_token';
const ANDROID_CHANNEL_ID = 'default';

/**
 * Foreground presentation — a Miss You while the app is already open still shows a banner, still
 * plays the notification sound, and (Android) still respects the channel's importance for a
 * heads-up display. Must be registered before anything can arrive (see registerNotificationHandler's
 * call site in app/_layout.tsx).
 */
export function registerNotificationHandler(): void {
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Android 13+ requires at least one notification channel to exist before the permission prompt
 * (and before a push token can be requested) — see registerPushToken's call order below. MAX
 * importance + an explicit sound is what makes the notification able to actually alert with
 * sound while the phone is locked/backgrounded, not just silently land in the tray.
 */
async function ensureAndroidChannelAsync(): Promise<void> {
  if (Platform.OS !== 'android' || !Notifications) return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Little Moments',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#5B7FBE',
  });
}

/**
 * Exported so services/loanReminders.ts can reuse this exact request flow for its own (local,
 * not push-token-related) reminders, rather than duplicating the permission dance — the OS-level
 * "notifications" permission is one shared resource regardless of which feature is asking.
 */
export async function ensureNotificationPermissionAsync(): Promise<boolean> {
  if (!Notifications) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return requested.granted;
}

/**
 * Registers this device for push and hands the token to the backend (PushTokensController) so
 * MissMeService has somewhere to send to. Safe to call every time the app becomes
 * authenticated+paired (see app/_layout.tsx) — it's a cheap no-op once already registered, and
 * naturally re-registers if Expo ever rotates the token.
 *
 * Silently does nothing (never throws) on a simulator/emulator, in Expo Go (see the module's own
 * doc comment), when permission is denied, or on any registration failure — a missing push token
 * should never block using the app.
 */
export async function registerPushToken(): Promise<void> {
  try {
    if (!Notifications || !Device.isDevice) return; // push tokens don't work on simulators/emulators

    await ensureAndroidChannelAsync(); // must exist before requesting permission/token on Android 13+
    if (!(await ensureNotificationPermissionAsync())) return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      // Not configured yet (no `eas init` run) — nothing to register against.
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.registerPushToken(token, Platform.OS);
    await SecureStore.setItemAsync(PUSH_TOKEN_STORAGE_KEY, token).catch(() => undefined);
  } catch {
    // Best-effort — see doc comment above.
  }
}

/** Called on logout so a signed-out device stops receiving notifications meant for the account. */
export async function unregisterPushToken(): Promise<void> {
  try {
    const token = await SecureStore.getItemAsync(PUSH_TOKEN_STORAGE_KEY);
    if (!token) return;
    await api.unregisterPushToken(token);
    await SecureStore.deleteItemAsync(PUSH_TOKEN_STORAGE_KEY).catch(() => undefined);
  } catch {
    // Best-effort, same reasoning as api.logout's own revocation call.
  }
}

/** What a Miss Me push's `data` payload (see MissMeService.NotifyAsync) means for in-app navigation. */
export function isMissMeNotification(data: Record<string, unknown> | undefined): boolean {
  return data?.kind === 'miss-me';
}

/**
 * Fires once for the notification response that *launched* the app (cold start) — expo-router
 * isn't mounted yet at that instant, so app/_layout.tsx polls this once on mount rather than
 * relying only on the live addNotificationResponseReceivedListener below. Resolves to null
 * wherever push isn't available (see the module's own doc comment) — nothing to report.
 */
export async function getLaunchNotificationResponseAsync() {
  if (!Notifications) return null;
  return Notifications.getLastNotificationResponseAsync();
}

/** Returns a no-op subscription (still safe to call `.remove()` on) wherever push isn't available. */
export function addNotificationResponseListener(onResponse: (data: Record<string, unknown> | undefined) => void) {
  if (!Notifications) return { remove: () => undefined };
  return Notifications.addNotificationResponseReceivedListener((response) => {
    onResponse(response.notification.request.content.data as Record<string, unknown> | undefined);
  });
}
