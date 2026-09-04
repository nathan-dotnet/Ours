import { Stack } from 'expo-router';

/** Create/edit are presented as modals over whichever tab the user pushed them from — same pattern as app/calendar/_layout.tsx. */
export default function BudgetsLayout() {
  return (
    <Stack screenOptions={{ presentation: 'modal', headerShown: true, headerTintColor: '#C97C6D' }}>
      <Stack.Screen name="new" options={{ title: 'New Budget' }} />
      <Stack.Screen name="[id]" options={{ title: 'Edit Budget' }} />
    </Stack>
  );
}
