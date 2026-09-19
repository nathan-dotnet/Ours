import { Stack } from 'expo-router';

/** New is a modal over whichever tab pushed it; [id] is the detail/edit/pay screen, pushed normally (not a modal) — same pattern as app/savings-goals/_layout.tsx, minus the modal on [id] since it also hosts a full "Pay" flow, not just a quick edit form. */
export default function LoansLayout() {
  return (
    <Stack screenOptions={{ headerShown: true, headerTintColor: '#5B7FBE' }}>
      <Stack.Screen name="new" options={{ presentation: 'modal', title: 'New Loan' }} />
      <Stack.Screen name="[id]" options={{ title: 'Loan' }} />
    </Stack>
  );
}
