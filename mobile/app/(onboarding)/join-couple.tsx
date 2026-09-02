import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useCoupleActions } from '@/hooks/useCoupleActions';
import { ApiError } from '@/services/api';
import { joinCoupleSchema, type JoinCoupleFormValues } from '@/validation/couple';

export default function JoinCoupleScreen() {
  const { joinCouple } = useCoupleActions();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<JoinCoupleFormValues>({
    resolver: zodResolver(joinCoupleSchema),
    defaultValues: { inviteCode: '' },
  });

  const onSubmit = async (values: JoinCoupleFormValues) => {
    setServerError(null);
    setIsSubmitting(true);
    try {
      // Navigation to Home happens automatically once this resolves — see app/_layout.tsx.
      await joinCouple(values);
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'Could not join. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen>
      <View className="flex-1 items-center justify-center gap-8">
        <View className="items-center gap-2">
          <Text className="text-2xl font-semibold text-ink">Enter your invite code</Text>
          <Text className="text-center text-clay">Your partner can find theirs on their Ours home screen.</Text>
        </View>

        <View className="w-full gap-4">
          <Controller
            control={control}
            name="inviteCode"
            render={({ field }) => (
              <TextField
                label="Invite code"
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="OURS-8K2F"
                value={field.value}
                onChangeText={field.onChange}
                error={errors.inviteCode?.message}
              />
            )}
          />
          {serverError ? <Text className="text-sm text-rose">{serverError}</Text> : null}
          <Button label="Join" onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
        </View>
      </View>
    </Screen>
  );
}
