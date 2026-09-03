import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useAuthActions } from '@/hooks/useAuthActions';
import { ApiError } from '@/services/api';
import { resetPasswordSchema, type ResetPasswordFormValues } from '@/validation/auth';

/**
 * Reached via the ours://reset-password?email=...&token=... link sent by the forgot-password
 * email (see app/_layout.tsx for why this route sits outside every auth guard). Doesn't log the
 * user in on success — they return to Login and sign in with the new password, and every
 * previously-active session on every device is revoked server-side as part of the reset.
 */
export default function ResetPasswordScreen() {
  const { email, token } = useLocalSearchParams<{ email?: string; token?: string }>();
  const router = useRouter();
  const { resetPassword } = useAuthActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const onSubmit = async (values: ResetPasswordFormValues) => {
    if (!email || !token) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await resetPassword(email, token, values.newPassword);
      setSucceeded(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset your password. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!email || !token) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3">
          <Text className="text-lg font-semibold text-ink">Invalid reset link</Text>
          <Text className="text-center text-clay">
            This link is missing some information. Request a new one from the Forgot Password screen.
          </Text>
          <Button label="Back to Login" onPress={() => router.replace('/(auth)/login')} />
        </View>
      </Screen>
    );
  }

  if (succeeded) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-4">
          <Text className="text-2xl font-semibold text-ink">Password changed successfully</Text>
          <Text className="text-center text-clay">Log in with your new password to continue.</Text>
          <Button label="Return to Login" onPress={() => router.replace('/(auth)/login')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View className="gap-1 pb-8 pt-6">
        <Text className="text-2xl font-semibold text-ink">Choose a new password</Text>
        <Text className="text-base text-clay">for {email}</Text>
      </View>

      <View className="gap-4">
        <Controller
          control={control}
          name="newPassword"
          render={({ field }) => (
            <TextField
              label="New password"
              secureTextEntry
              value={field.value}
              onChangeText={field.onChange}
              error={errors.newPassword?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="confirmPassword"
          render={({ field }) => (
            <TextField
              label="Confirm new password"
              secureTextEntry
              value={field.value}
              onChangeText={field.onChange}
              error={errors.confirmPassword?.message}
            />
          )}
        />

        {error ? <Text className="text-sm text-rose">{error}</Text> : null}

        <Button label="Reset Password" onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
      </View>
    </Screen>
  );
}
