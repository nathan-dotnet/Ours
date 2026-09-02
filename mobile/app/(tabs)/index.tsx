import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { SyncStatusBadge } from '@/components/SyncStatusBadge';
import { TextField } from '@/components/TextField';
import { useLocalCouple, useUpdateCoupleProfile } from '@/hooks/useCouple';
import { useAuthStore } from '@/stores/authStore';
import { coupleProfileSchema, type CoupleProfileFormValues } from '@/validation/couple';

const TODAY_LABEL = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export default function HomeScreen() {
  const user = useAuthStore((s) => s.session?.user);
  const { data, isLoading } = useLocalCouple();
  const updateProfile = useUpdateCoupleProfile();
  const [isEditing, setIsEditing] = useState(false);

  const couple = data?.couple ?? null;
  const members = data?.members ?? [];
  const partner = members.find((m) => m.user_id !== user?.id);

  const { control, handleSubmit, reset } = useForm<CoupleProfileFormValues>({
    resolver: zodResolver(coupleProfileSchema),
    defaultValues: { nickname: couple?.nickname ?? '', anniversaryDate: couple?.anniversary_date ?? '' },
  });

  const startEditing = () => {
    reset({ nickname: couple?.nickname ?? '', anniversaryDate: couple?.anniversary_date ?? '' });
    setIsEditing(true);
  };

  const onSave = async (values: CoupleProfileFormValues) => {
    if (!couple || !user) return;
    await updateProfile(
      couple,
      { nickname: values.nickname?.trim() || null, anniversaryDate: values.anniversaryDate?.trim() || null },
      user.id,
    );
    setIsEditing(false);
  };

  return (
    <Screen scroll>
      <View className="gap-1 pb-6 pt-4">
        <Text className="text-sm font-medium text-clay">{TODAY_LABEL}</Text>
        <Text className="text-3xl font-semibold text-ink">
          {couple?.nickname ? couple.nickname : `Hi ${user?.displayName ?? 'there'}`}
        </Text>
      </View>

      <SyncStatusBadge />

      {isLoading ? null : couple ? (
        <View className="mt-6 gap-4 rounded-2xl bg-blush p-5">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-semibold text-ink">Our details</Text>
            {!isEditing && (
              <Button label="Edit" variant="secondary" onPress={startEditing} />
            )}
          </View>

          {isEditing ? (
            <View className="gap-3">
              <Controller
                control={control}
                name="nickname"
                render={({ field }) => (
                  <TextField label="A nickname for us" placeholder="e.g. Team Ross" value={field.value} onChangeText={field.onChange} />
                )}
              />
              <Controller
                control={control}
                name="anniversaryDate"
                render={({ field }) => (
                  <TextField
                    label="Anniversary (YYYY-MM-DD)"
                    placeholder="2020-06-15"
                    value={field.value}
                    onChangeText={field.onChange}
                  />
                )}
              />
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button label="Cancel" variant="secondary" onPress={() => setIsEditing(false)} />
                </View>
                <View className="flex-1">
                  <Button label="Save" onPress={handleSubmit(onSave)} />
                </View>
              </View>
            </View>
          ) : (
            <View className="gap-2">
              <DetailRow label="Together with" value={partner?.display_name ?? 'Waiting for your partner to join'} />
              <DetailRow label="Anniversary" value={couple.anniversary_date ?? 'Not set'} />
              <DetailRow label="Invite code" value={couple.invite_code} />
            </View>
          )}
        </View>
      ) : (
        <View className="mt-6 rounded-2xl bg-blush p-5">
          <Text className="text-clay">Your couple isn't set up on this device yet — pull to sync once you're online.</Text>
        </View>
      )}
    </Screen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between">
      <Text className="text-clay">{label}</Text>
      <Text className="font-medium text-ink">{value}</Text>
    </View>
  );
}
