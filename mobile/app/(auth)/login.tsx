import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useAuthActions } from '@/hooks/useAuthActions';
import { ApiError } from '@/services/api';
import { loginSchema, type LoginFormValues } from '@/validation/auth';

export default function LoginScreen() {
  const { login } = useAuthActions();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    setIsSubmitting(true);
    try {
      await login(values);
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'Could not log in. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

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

        {serverError ? <Text className="text-sm text-rose">{serverError}</Text> : null}

        <Button label="Log in" onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
      </View>

      <View className="flex-row justify-center gap-1 pt-6">
        <Text className="text-clay">New here?</Text>
        <Link href="/(auth)/register" className="font-semibold text-rose">
          Create an account
        </Link>
      </View>
    </Screen>
  );
}
