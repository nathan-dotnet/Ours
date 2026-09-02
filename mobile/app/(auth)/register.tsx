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
import { registerSchema, type RegisterFormValues } from '@/validation/auth';

export default function RegisterScreen() {
  const { register } = useAuthActions();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { displayName: '', email: '', password: '' },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setServerError(null);
    setIsSubmitting(true);
    try {
      await register(values);
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'Could not create your account. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen scroll>
      <View className="gap-1 pb-8 pt-6">
        <Text className="text-3xl font-semibold text-ink">Ours</Text>
        <Text className="text-base text-clay">A little space for us.</Text>
      </View>

      <View className="gap-4">
        <Controller
          control={control}
          name="displayName"
          render={({ field }) => (
            <TextField label="Your name" value={field.value} onChangeText={field.onChange} error={errors.displayName?.message} />
          )}
        />
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

        <Button label="Create account" onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
      </View>

      <View className="flex-row justify-center gap-1 pt-6">
        <Text className="text-clay">Already have an account?</Text>
        <Link href="/(auth)/login" className="font-semibold text-rose">
          Log in
        </Link>
      </View>
    </Screen>
  );
}
