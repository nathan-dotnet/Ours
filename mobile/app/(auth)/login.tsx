import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useAuthActions } from '@/hooks/useAuthActions';
import { attemptBiometricLogin, useBiometricCapability, useBiometricLoginEnabled } from '@/hooks/useBiometricAuth';
import { ApiConfigurationError, ApiConnectionError, ApiError } from '@/services/api';
import { biometricLabel, enableBiometricLogin } from '@/services/biometricAuth';
import { useAuthStore } from '@/stores/authStore';
import { loginSchema, type LoginFormValues } from '@/validation/auth';

export default function LoginScreen() {
  const { login } = useAuthActions();
  const session = useAuthStore((s) => s.session);
  const isBiometricGatePassed = useAuthStore((s) => s.isBiometricGatePassed);
  const capability = useBiometricCapability();
  const [biometricEnabled, refreshBiometricEnabled] = useBiometricLoginEnabled();

  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  // "App starts -> biometric login enabled? -> yes -> request Face ID/Fingerprint" — a restored
  // session that hasn't passed the biometric gate yet triggers the prompt automatically, once,
  // on mount. A successful attempt flips isBiometricGatePassed (via updateTokens), which
  // navigates this screen away entirely through the root layout's guard — so the only outcome
  // we ever actually render *here* is a failed/cancelled one, which falls through to the normal
  // form below (still fully usable, with a "Use Face ID" button to retry manually).
  useEffect(() => {
    if (session === null || isBiometricGatePassed) return;
    let cancelled = false;
    setIsUnlocking(true);
    attemptBiometricLogin().finally(() => {
      if (!cancelled) setIsUnlocking(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRetryBiometric = async () => {
    setIsUnlocking(true);
    try {
      await attemptBiometricLogin();
    } finally {
      setIsUnlocking(false);
    }
  };

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    setIsSubmitting(true);
    try {
      await login(values);
      await maybeOfferBiometricEnrollment();
    } catch (error) {
      // Keep the lower-level fetch failure in Metro while giving the person logging in enough
      // context to distinguish an unreachable server from a rejected password.
      if (error instanceof ApiConnectionError) {
        console.error('Login request failed before receiving an API response:', error);
        setServerError(`Cannot reach the Ours server (${error.apiHost}). Check your internet connection and try again.`);
      } else if (error instanceof ApiConfigurationError) {
        console.error('Login request cannot start because the app API configuration is invalid:', error);
        setServerError(error.message);
      } else {
        setServerError(error instanceof ApiError ? error.message : 'Could not log in. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const maybeOfferBiometricEnrollment = async () => {
    if (!capability?.available || biometricEnabled) return;
    const label = biometricLabel(capability.type);
    Alert.alert(`Use ${label} for faster login next time?`, undefined, [
      { text: 'Not Now', style: 'cancel' },
      {
        text: 'Enable',
        onPress: async () => {
          await enableBiometricLogin();
          await refreshBiometricEnabled();
        },
      },
    ]);
  };

  if (isUnlocking) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-4">
          <ActivityIndicator color="#5B7FBE" />
          <Text className="text-clay">Unlocking with {biometricLabel(capability?.type ?? 'other')}…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View className="gap-1 pb-8 pt-6">
        <Text className="text-3xl font-semibold text-ink">Welcome back</Text>
        <Text className="text-base text-clay">A little space for us.</Text>
      </View>

      <View className="gap-4">
        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <TextField
              label="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.email?.message}
            />
          )}
        />
        <View className="gap-1.5">
          <Controller
            control={control}
            name="password"
            render={({ field }) => (
              <TextField
                label="Password"
                secureTextEntry
                value={field.value}
                onChangeText={field.onChange}
                error={errors.password?.message}
              />
            )}
          />
          <Link href="/forgot-password" className="self-end text-sm font-medium text-rose">
            Forgot Password?
          </Link>
        </View>

        {serverError ? <Text className="text-sm text-rose">{serverError}</Text> : null}

        <Button label="Log in" onPress={handleSubmit(onSubmit)} loading={isSubmitting} />

        {biometricEnabled && capability?.available ? (
          <Button label={`Use ${biometricLabel(capability.type)}`} variant="secondary" onPress={onRetryBiometric} />
        ) : null}
      </View>

      <View className="flex-row justify-center gap-1 pt-6">
        <Text className="text-clay">New here?</Text>
        <Link href="/register" className="font-semibold text-rose">
          Create an account
        </Link>
      </View>
    </Screen>
  );
}
