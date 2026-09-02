import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { SyncStatusBadge } from '@/components/SyncStatusBadge';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useLocalCouple } from '@/hooks/useCouple';
import { triggerSync } from '@/sync';
import { groupEventsByDay } from '@/utils/calendarGrouping';

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

function formatRange(startAt: string, endAt: string): string {
  return `${timeFormatter.format(new Date(startAt))} – ${timeFormatter.format(new Date(endAt))}`;
}

export default function CalendarScreen() {
  const router = useRouter();
  const { data: coupleData } = useLocalCouple();
  const coupleId = coupleData?.couple.id;
  const { data: events, isLoading, isError, refetch } = useCalendarEvents(coupleId);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const onRefresh = async () => {
    setIsRefreshing(true);
    try {
      await triggerSync();
    } finally {
      setIsRefreshing(false);
    }
  };

  const groups = groupEventsByDay(events ?? []);

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#C97C6D" />}>
      <View className="flex-row items-center justify-between pb-4 pt-4">
        <Text className="text-3xl font-semibold text-ink">Calendar</Text>
        <Pressable onPress={() => router.push('/calendar/new')} className="rounded-full bg-rose px-4 py-2">
          <Text className="font-semibold text-cream">+ Add</Text>
        </Pressable>
      </View>

      <SyncStatusBadge />

      {isLoading ? (
        <View className="items-center py-16">
          <ActivityIndicator color="#C97C6D" />
        </View>
      ) : isError ? (
        <View className="mt-8 items-center gap-3">
          <Text className="text-lg font-semibold text-ink">Couldn't load your calendar</Text>
          <Text className="text-center text-clay">This is a local issue, not a connection one — try again.</Text>
          <Button label="Try again" variant="secondary" onPress={() => refetch()} />
        </View>
      ) : groups.length === 0 ? (
        <View className="mt-8 items-center gap-3">
          <Text className="text-lg font-semibold text-ink">No events yet</Text>
          <Text className="text-center text-clay">Add your first shared plan — a date night, a trip, anything.</Text>
          <Button label="Add an event" onPress={() => router.push('/calendar/new')} />
        </View>
      ) : (
        <View className="mt-4 gap-6">
          {groups.map((group) => (
            <View key={group.label} className="gap-2">
              <Text className="text-sm font-semibold text-clay">{group.label}</Text>
              {group.events.map((event) => (
                <Pressable
                  key={event.id}
                  onPress={() => router.push(`/calendar/${event.id}`)}
                  className="gap-1 rounded-2xl bg-blush p-4"
                >
                  <Text className="text-base font-semibold text-ink">{event.title}</Text>
                  <Text className="text-sm text-clay">{formatRange(event.start_at, event.end_at)}</Text>
                  {event.description ? (
                    <Text className="text-sm text-clay" numberOfLines={2}>
                      {event.description}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
