import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useAuthActions } from '@/hooks/useAuthActions';
import { ApiError } from '@/services/api';
import { forgotPasswordSchema, type ForgotPasswordFormValues } from '@/validation/auth';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { forgotPassword } = useAuthActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await forgotPassword(values.email);
      setSubmittedEmail(values.email);
    } catch (err) {
      // The backend never reveals whether an email exists, even in errors — a failure here is a
      // genuine problem (offline, server down), not "no such account".
      setError(err instanceof ApiError ? err.message : 'Could not send the reset email. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submittedEmail) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-4">
          <Text className="text-2xl font-semibold text-ink">Check your email</Text>
          <Text className="text-center text-clay">
            If an account exists for {submittedEmail}, we've sent a link to reset your password.
          </Text>
          <Button label="Back to Login" onPress={() => router.replace('/(auth)/login')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View className="gap-1 pb-8 pt-6">
        <Text className="text-2xl font-semibold text-ink">Forgot your password?</Text>
        <Text className="text-base text-clay">Enter your email and we'll send you a reset link.</Text>
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

        {error ? <Text className="text-sm text-rose">{error}</Text> : null}

        <Button label="Send reset link" onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
      </View>

      <View className="flex-row justify-center pt-6">
        <Link href="/(auth)/login" className="font-semibold text-rose">
          Back to Login
        </Link>
      </View>
    </Screen>
  );
}
