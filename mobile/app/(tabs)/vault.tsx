import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { SyncStatusBadge } from '@/components/SyncStatusBadge';
import { searchVaultItems, useVaultItems } from '@/hooks/useVaultItems';
import { useLocalCouple } from '@/hooks/useCouple';
import { triggerSync } from '@/sync';

const CATEGORY_ICONS: Record<string, string> = {
  Streaming: '🎬',
  Social: '👥',
  Email: '✉️',
  Shopping: '🛍️',
  Banking: '🏦',
  Work: '💼',
  WiFi: '📶',
  Other: '🔐',
};

export default function VaultScreen() {
  const router = useRouter();
  const { data: coupleData } = useLocalCouple();
  const coupleId = coupleData?.couple.id;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const { data: items, isLoading, isError, refetch } = useVaultItems(coupleId);
  const allItems = items ?? [];
  const visibleItems = useMemo(() => searchVaultItems(allItems, query), [allItems, query]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    try {
      await triggerSync();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#C97C6D" />}>
      <View className="flex-row items-center justify-between pb-1 pt-4">
        <Text className="text-3xl font-semibold text-ink">🔐 Vault</Text>
        <Pressable
          onPress={() => router.push('/vault/new')}
          accessibilityLabel="Add Password"
          className="h-10 w-10 items-center justify-center rounded-full bg-rose"
        >
          <Text className="text-xl font-semibold text-cream">+</Text>
        </Pressable>
      </View>

      <View className="mt-3">
        <SyncStatusBadge />
      </View>

      <View className="mt-4">
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search passwords…"
          placeholderTextColor="#8C7A72"
          autoCapitalize="none"
          className="rounded-xl border border-clay/30 px-4 py-3 text-base text-ink"
        />
      </View>

      {isLoading ? (
        <View className="items-center py-16">
          <ActivityIndicator color="#C97C6D" />
        </View>
      ) : isError ? (
        <View className="mt-8 items-center gap-3">
          <Text className="text-lg font-semibold text-ink">Couldn't load your vault</Text>
          <Text className="text-center text-clay">This is a local issue, not a connection one — try again.</Text>
          <Button label="Try again" variant="secondary" onPress={() => refetch()} />
        </View>
      ) : allItems.length === 0 ? (
        <View className="mt-8 items-center gap-3">
          <Text className="text-lg font-semibold text-ink">No passwords saved yet ❤️</Text>
          <Text className="text-center text-clay">Add your first shared password to get started.</Text>
          <Button label="Add Password" onPress={() => router.push('/vault/new')} />
        </View>
      ) : visibleItems.length === 0 ? (
        <View className="mt-8 items-center gap-2">
          <Text className="text-lg font-semibold text-ink">No matches</Text>
          <Text className="text-center text-clay">Try a different search.</Text>
        </View>
      ) : (
        <View className="mt-4 gap-2">
          {visibleItems.map((item) => (
            <Pressable key={item.id} onPress={() => router.push(`/vault/${item.id}`)} className="gap-2 rounded-2xl bg-blush p-4">
              <View className="flex-row items-center gap-2">
                <Text className="text-xl">{CATEGORY_ICONS[item.category] ?? '🔐'}</Text>
                <Text className="text-base font-semibold text-ink">{item.title}</Text>
              </View>
              {item.username ? <Text className="text-sm text-clay">{item.username}</Text> : null}
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-clay">Password ••••••••••</Text>
                <Text className="text-lg">👁</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}
