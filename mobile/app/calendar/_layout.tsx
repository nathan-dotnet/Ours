import { Stack } from 'expo-router';

/** Create/edit are presented as modals over whichever tab the user pushed them from. */
export default function CalendarLayout() {
  return (
    <Stack screenOptions={{ presentation: 'modal', headerShown: true, headerTintColor: '#C97C6D' }}>
      <Stack.Screen name="new" options={{ title: 'New Event' }} />
      <Stack.Screen name="[id]" options={{ title: 'Edit Event' }} />
    </Stack>
  );
}
