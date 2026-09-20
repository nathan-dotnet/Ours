import '../global.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BrandedSplash } from '../src/components/BrandedSplash';
import { getDatabase } from '../src/database/db';
import { useLoanReminderScheduler, useLoans } from '../src/hooks/useLoans';
import { useTransactionsForCouple } from '../src/hooks/useTransactions';
import { isLoanReminderNotification } from '../src/services/loanReminders';
import {
  addNotificationResponseListener,
  getLaunchNotificationResponseAsync,
  isMissMeNotification,
  registerNotificationHandler,
  registerPushToken,
} from '../src/services/pushNotifications';
import { useAuthStore } from '../src/stores/authStore';
import { startSyncEngine, stopSyncEngine } from '../src/sync';

const queryClient = new QueryClient();

// Determines whether a notification that arrives while the app is foregrounded still shows a
// banner + plays its sound (vs. e.g. a sync-driven silent push, if one is ever added later) —
// registered once, before anything could possibly arrive.
registerNotificationHandler();

// Keeps the native splash (app.json's expo-splash-screen config) on screen past its own default
// auto-hide, until this file explicitly calls hideAsync() below — the gap between the two is
// covered by <BrandedSplash />, which reuses the same logo + background color, so the handoff is
// visually seamless. Never a race: this call is synchronous at module load, before RootLayout's
// effects can run. Swallowing the rejection is deliberate — it only ever throws if called twice
// (e.g. Fast Refresh in dev), which is harmless here.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * Four protected route groups gate on session + biometric + couple-membership state:
 *  - welcome: no session at all — a brand-new device or a fully logged-out one
 *  - (auth): no active app authentication — either logged out (where the user can register or
 *    log in) or a restored session that hasn't cleared the biometric gate yet this launch (where
 *    Login's existing auto-biometric-unlock effect still fires)
 *  - (onboarding): logged in, hasn't created/joined a couple yet
 *  - (tabs): logged in and paired — the main app
 * `calendar` (the create/edit modals) shares the (tabs) guard since it's equally couple-scoped.
 * `reset-password` sits outside every guard — see the comment on it below.
 * Stack.Protected re-evaluates its guard on every render, so completing any of these steps
 * (which updates the auth store) navigates the user forward automatically.
 *
 * "isAuthenticated" additionally requires `isBiometricGatePassed` — a restored `session` alone
 * isn't enough to show the app when biometric login is enabled; see authStore.ts.
 */
export default function RootLayout() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const hydrate = useAuthStore((s) => s.hydrate);
  const session = useAuthStore((s) => s.session);
  const isBiometricGatePassed = useAuthStore((s) => s.isBiometricGatePassed);

  useEffect(() => {
    (async () => {
      // Open + migrate SQLite before anything else touches it, then restore the auth session
      // from SecureStore — this is what makes "restart the app while offline" show local data
      // immediately instead of a login screen or a blank state.
      await getDatabase();
      await hydrate();
    })();
  }, [hydrate]);

  const hasCouple = Boolean(session?.user.coupleId);

  useEffect(() => {
    if (isHydrated) {
      setIsReady(true);
      // The one and only place the native splash is dismissed — exactly when session
      // restoration has actually finished, never on a timer. <BrandedSplash /> below covers the
      // (typically imperceptible) gap between this call resolving and RootNavigator mounting.
      void SplashScreen.hideAsync();
    }
  }, [isHydrated]);

  useEffect(() => {
    // Nothing is syncable until the user has a couple (see runSync's own guard for why) — only
    // run the engine's connectivity listener/timer once that's true, and tear it down on logout.
    if (isHydrated && hasCouple) {
      void startSyncEngine();
      return () => stopSyncEngine();
    }
  }, [isHydrated, hasCouple]);

  useEffect(() => {
    // Same gating as the sync engine above — nothing to register a push token *for* until
    // there's a partner who could ever send a Miss You. Re-runs (cheaply — see registerPushToken's
    // own doc comment) whenever this becomes true, including right after onboarding completes.
    if (isHydrated && hasCouple) {
      void registerPushToken();
    }
  }, [isHydrated, hasCouple]);

  useEffect(() => {
    // Only once the Stack below is actually mounted — navigating any earlier has nowhere to go
    // to. Handles both "tapped a notification while the app was already running" (the live
    // listener) and "tapped a notification that cold-started the app" (the one-time check).
    if (!isReady) return;

    const subscription = addNotificationResponseListener((data) => {
      if (isMissMeNotification(data)) {
        router.push('/');
      }
      const loanReminder = isLoanReminderNotification(data);
      if (loanReminder) {
        router.push(`/loans/${loanReminder.loanId}`);
      }
    });

    void getLaunchNotificationResponseAsync().then((response) => {
      const data = response?.notification.request.content.data;
      if (isMissMeNotification(data)) {
        router.push('/');
      }
      const loanReminder = isLoanReminderNotification(data);
      if (loanReminder) {
        router.push(`/loans/${loanReminder.loanId}`);
      }
    });

    return () => subscription.remove();
  }, [isReady, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        {!isReady ? (
          <BrandedSplash />
        ) : (
          <RootNavigator
            hasSession={session !== null}
            isAuthenticated={session !== null && isBiometricGatePassed}
            hasCouple={hasCouple}
            coupleId={session?.user.coupleId ?? undefined}
            userId={session?.user.id}
          />
        )}
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

function RootNavigator({
  hasSession,
  isAuthenticated,
  hasCouple,
  coupleId,
  userId,
}: {
  hasSession: boolean;
  isAuthenticated: boolean;
  hasCouple: boolean;
  coupleId: string | undefined;
  userId: string | undefined;
}) {
  // Reschedules loan due-date reminders whenever this device's view of loans/transactions
  // changes (a local create/edit/pay, or a completed sync) — mounted once here, not per-screen,
  // so reminders stay current even while the user isn't looking at Loans. useLoans/
  // useTransactionsForCouple already no-op without a coupleId (see their own `enabled` guards).
  const { data: loans } = useLoans(coupleId);
  const { data: transactions } = useTransactionsForCouple(coupleId);
  useLoanReminderScheduler(loans, transactions, userId);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!hasSession}>
        <Stack.Screen name="welcome" />
      </Stack.Protected>
      {/* Auth must also be available without a session: Welcome links into Register/Login.
          A restored session that still needs biometric verification remains eligible so Login
          can perform its existing unlock flow. */}
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={isAuthenticated && !hasCouple}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={isAuthenticated && hasCouple}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="calendar" />
      </Stack.Protected>
      {/* Deliberately not inside any Stack.Protected block: the password-reset email link
          (ours://reset-password?email=...&token=...) must open reliably regardless of whether
          this device happens to be logged in — a guarded route redirects away before showing.
          Declared *last*: React Navigation defaults a stack's initial route to whichever screen
          is declared first among the currently-active ones, and this one is always active (no
          guard) — first would make it win as the default landing screen on every plain launch,
          not just when actually deep-linked to. */}
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}
