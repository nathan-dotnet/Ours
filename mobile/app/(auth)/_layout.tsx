import { Stack } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

export default function AuthLayout() {
  const hasSession = useAuthStore((s) => s.session !== null);
  const isBiometricGatePassed = useAuthStore((s) => s.isBiometricGatePassed);
  const isAuthenticated = hasSession && isBiometricGatePassed;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Login is the only auth screen a restored, biometric-locked session can access. */}
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      {/* Creating an account or starting password recovery is only meaningful while fully logged out. */}
      <Stack.Protected guard={!hasSession}>
        <Stack.Screen name="register" />
        <Stack.Screen name="forgot-password" options={{ headerShown: true, title: 'Reset Password' }} />
      </Stack.Protected>
    </Stack>
  );
}
