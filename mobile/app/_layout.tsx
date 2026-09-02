import '../global.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getDatabase } from '../src/database/db';
import { useAuthStore } from '../src/stores/authStore';
import { startSyncEngine, stopSyncEngine } from '../src/sync';

const queryClient = new QueryClient();

/**
 * Three protected route groups gate on auth + couple-membership state:
 *  - (auth): not logged in yet
 *  - (onboarding): logged in, hasn't created/joined a couple yet
 *  - (tabs): logged in and paired — the main app
 * `calendar` (the create/edit modals) shares the (tabs) guard since it's equally couple-scoped.
 * Stack.Protected re-evaluates its guard on every render, so completing any of these steps
 * (which updates the auth store) navigates the user forward automatically.
 */
export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const hydrate = useAuthStore((s) => s.hydrate);
  const session = useAuthStore((s) => s.session);

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

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        {!isReady ? (
          <View className="flex-1 items-center justify-center bg-cream">
            <ActivityIndicator color="#C97C6D" />
          </View>
        ) : (
          <RootNavigator isAuthenticated={session !== null} hasCouple={hasCouple} />
        )}
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

function RootNavigator({ isAuthenticated, hasCouple }: { isAuthenticated: boolean; hasCouple: boolean }) {
  return (
    <Stack screenOptions={{ headerShown: false }}>
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
    </Stack>
  );
}
