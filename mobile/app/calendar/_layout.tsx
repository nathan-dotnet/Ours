import { Stack } from 'expo-router';

/** Create/edit are presented as modals over whichever tab the user pushed them from. */
export default function CalendarLayout() {
  return (
    <Stack screenOptions={{ presentation: 'modal', headerShown: true, headerTintColor: '#5B7FBE' }}>
      <Stack.Screen name="new" options={{ title: 'New Event' }} />
      <Stack.Screen name="[id]" options={{ title: 'Edit Event' }} />
    </Stack>
  );
}
