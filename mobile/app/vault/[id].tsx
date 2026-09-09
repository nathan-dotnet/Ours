import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { VaultItemForm, type VaultItemFormValues } from '@/components/VaultItemForm';
import { Screen } from '@/components/Screen';
import { useDeleteVaultItem, useUpdateVaultItem, useVaultItem } from '@/hooks/useVaultItems';
import { copyVaultPassword, revealVaultPassword, VaultRevealError } from '@/services/vaultReveal';
import { useAuthStore } from '@/stores/authStore';
import type { VaultCategoryValue } from '@/validation/vault';
import { softRaised, softRaisedSubtle } from '@/styles/neumorphism';

export default function VaultItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const { data: item, isLoading } = useVaultItem(id);
  const updateVaultItem = useUpdateVaultItem();
  const deleteVaultItem = useDeleteVaultItem();
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  const onSubmit = async (values: VaultItemFormValues) => {
    if (!item || !user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await updateVaultItem(
        item,
        {
          title: values.title,
          username: values.username?.trim() || null,
          // An empty password field means "leave it unchanged" — see validation/vault.ts.
          password: values.password ? values.password : null,
          websiteUrl: values.websiteUrl?.trim() || null,
          category: values.category,
          notes: values.notes?.trim() || null,
        },
        user.id,
      );
      router.back();
    } catch {
      setError('Could not save these changes. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const performDelete = async () => {
    if (!item) return;
    setIsDeleting(true);
    try {
      await deleteVaultItem(item);
      router.back();
    } catch {
      setError('Could not delete this password. Please try again.');
      setIsDeleting(false);
    }
  };

  const onDelete = () => {
    Alert.alert('Delete this password?', 'This will be removed from the shared vault.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: performDelete },
    ]);
  };

  const onReveal = async () => {
    if (!item) return;
    if (revealedPassword) {
      setRevealedPassword(null); // hiding again never needs re-authentication
      return;
    }
    setRevealError(null);
    setIsRevealing(true);
    try {
      setRevealedPassword(await revealVaultPassword(item.id));
    } catch (err) {
      setRevealError(err instanceof VaultRevealError ? err.message : 'Could not reveal this password. Please try again.');
    } finally {
      setIsRevealing(false);
    }
  };

  const onCopy = async () => {
    if (!item) return;
    setRevealError(null);
    setIsCopying(true);
    try {
      await copyVaultPassword(item.id);
      Alert.alert('Password copied');
    } catch (err) {
      setRevealError(err instanceof VaultRevealError ? err.message : 'Could not copy this password. Please try again.');
    } finally {
      setIsCopying(false);
    }
  };

  if (isLoading) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#5B7FBE" />
        </View>
      </Screen>
    );
  }

  if (!item || !user) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-2">
          <Text className="text-lg font-semibold text-ink">Password not found</Text>
          <Text className="text-center text-clay">It may have already been deleted — pull to sync to catch up.</Text>
        </View>
      </Screen>
    );
  }

  if (isEditing) {
    return (
      <Screen scroll>
        <VaultItemForm
          initialValues={{
            title: item.title,
            username: item.username ?? '',
            password: '',
            websiteUrl: item.website_url ?? '',
            category: (item.category as VaultCategoryValue) ?? 'Other',
            notes: item.notes ?? '',
          }}
          passwordRequired={false}
          submitLabel="Save changes"
          isSubmitting={isSubmitting}
          serverError={error}
          onSubmit={onSubmit}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View className="gap-1 py-4">
        <Text className="text-3xl">🔐</Text>
        <Text className="text-2xl font-semibold text-ink">{item.title}</Text>
      </View>

      <View className="gap-4">
        {item.username ? (
          <View className="gap-1">
            <Text className="text-sm text-clay">Account</Text>
            <Text className="text-base text-ink">{item.username}</Text>
          </View>
        ) : null}

        <View className="gap-2">
          <Text className="text-sm text-clay">Password</Text>
          <View className="flex-row items-center justify-between rounded-xl bg-blush p-4" style={softRaisedSubtle}>
            <Text className="flex-1 text-base text-ink" numberOfLines={1}>
              {revealedPassword ?? '••••••••••••••'}
            </Text>
            <Pressable onPress={onReveal} disabled={isRevealing} accessibilityLabel={revealedPassword ? 'Hide password' : 'Reveal password'}>
              {isRevealing ? <ActivityIndicator color="#5B7FBE" /> : <Text className="text-lg">{revealedPassword ? '🙈' : '👁'}</Text>}
            </Pressable>
          </View>
          {revealError ? <Text className="text-xs text-rose">{revealError}</Text> : null}
          <Pressable onPress={onCopy} disabled={isCopying} className="items-center rounded-2xl bg-blush px-5 py-4" style={softRaised}>
            <Text className="text-base font-semibold text-rose">{isCopying ? 'Copying…' : 'Copy Password'}</Text>
          </Pressable>
        </View>

        {item.website_url ? (
          <View className="gap-1">
            <Text className="text-sm text-clay">Website</Text>
            <Text className="text-base text-ink">{item.website_url}</Text>
          </View>
        ) : null}

        <View className="gap-1">
          <Text className="text-sm text-clay">Category</Text>
          <Text className="text-base text-ink">{item.category}</Text>
        </View>

        {item.notes ? (
          <View className="gap-1">
            <Text className="text-sm text-clay">Notes</Text>
            <Text className="text-base text-ink">{item.notes}</Text>
          </View>
        ) : null}
      </View>

      <View className="gap-3 pt-6">
        <Pressable onPress={() => setIsEditing(true)} className="items-center rounded-2xl bg-blush px-5 py-4" style={softRaised}>
          <Text className="text-base font-semibold text-rose">Edit</Text>
        </Pressable>
        <Pressable onPress={onDelete} className="items-center rounded-2xl bg-blush px-5 py-4" style={softRaised}>
          <Text className="text-base font-semibold text-rose">Delete</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
