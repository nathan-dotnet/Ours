import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { MonthCalendarGrid } from '@/components/MonthCalendarGrid';
import { Screen } from '@/components/Screen';
import { SyncStatusBadge } from '@/components/SyncStatusBadge';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useLocalCouple } from '@/hooks/useCouple';
import { triggerSync } from '@/sync';
import { getDatesWithEvents, getEventsForDate } from '@/utils/calendarGrouping';
import { softRaised } from '@/styles/neumorphism';
import { isSameLocalDay } from '@/utils/calendarMonth';

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const selectedDayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

function formatRange(event: { start_at: string; end_at: string; all_day: number }): string {
  if (event.all_day) return 'All day';
  return `${timeFormatter.format(new Date(event.start_at))} – ${timeFormatter.format(new Date(event.end_at))}`;
}

export default function CalendarScreen() {
  const router = useRouter();
  const { data: coupleData } = useLocalCouple();
  const coupleId = coupleData?.couple.id;
  const { data: events, isLoading, isError, refetch } = useCalendarEvents(coupleId);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const today = useMemo(() => new Date(), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [displayedMonth, setDisplayedMonth] = useState(today);

  const onRefresh = async () => {
    setIsRefreshing(true);
    try {
      await triggerSync();
    } finally {
      setIsRefreshing(false);
    }
  };

  const onToday = () => {
    setSelectedDate(today);
    setDisplayedMonth(today);
  };

  const goToPrevMonth = () => setDisplayedMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const goToNextMonth = () => setDisplayedMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const allEvents = events ?? [];
  const datesWithEvents = useMemo(() => getDatesWithEvents(allEvents), [allEvents]);
  const dayEvents = useMemo(() => getEventsForDate(allEvents, selectedDate), [allEvents, selectedDate]);
  const isToday = isSameLocalDay(selectedDate, today);

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#5B7FBE" />}>
      <View className="flex-row items-center justify-between pb-4 pt-4">
        <Text className="text-3xl font-semibold text-ink">📅 Calendar</Text>
        <View className="flex-row items-center gap-2">
          {!isToday ? <Button label="Today" variant="secondary" onPress={onToday} /> : null}
          <Pressable onPress={() => router.push('/calendar/new')} className="rounded-full bg-rose px-4 py-2">
            <Text className="font-semibold text-cream">+ Add</Text>
          </Pressable>
        </View>
      </View>

      <SyncStatusBadge />

      {isLoading ? (
        <View className="items-center py-16">
          <ActivityIndicator color="#5B7FBE" />
        </View>
      ) : isError ? (
        <View className="mt-8 items-center gap-3">
          <Text className="text-lg font-semibold text-ink">Couldn't load your calendar</Text>
          <Text className="text-center text-clay">This is a local issue, not a connection one — try again.</Text>
          <Button label="Try again" variant="secondary" onPress={() => refetch()} />
        </View>
      ) : (
        <View className="mt-4 gap-4">
          <MonthCalendarGrid
            displayedMonth={displayedMonth}
            selectedDate={selectedDate}
            today={today}
            datesWithEvents={datesWithEvents}
            onSelectDate={setSelectedDate}
            onPrevMonth={goToPrevMonth}
            onNextMonth={goToNextMonth}
          />

          <Text className="text-sm font-semibold text-clay">
            {isToday ? 'Today' : selectedDayFormatter.format(selectedDate)}
          </Text>

          {dayEvents.length === 0 ? (
            <View className="items-center gap-3 py-8">
              <Text className="text-lg font-semibold text-ink">No plans yet ❤️</Text>
              <Text className="text-center text-clay">Add something special to your day.</Text>
              <Button label="Add Event" onPress={() => router.push('/calendar/new')} />
            </View>
          ) : (
            <View className="gap-2">
              {dayEvents.map((event) => (
                <Pressable
                  key={event.id}
                  onPress={() => router.push(`/calendar/${event.id}`)}
                  className="gap-1 rounded-2xl bg-blush p-4"
                  style={softRaised}
                >
                  <Text className="text-base font-semibold text-ink">{event.title}</Text>
                  <Text className="text-sm text-clay">{formatRange(event)}</Text>
                  {event.location ? <Text className="text-sm text-clay">📍 {event.location}</Text> : null}
                  {event.description ? (
                    <Text className="text-sm text-clay" numberOfLines={2}>
                      {event.description}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}
    </Screen>
  );
}
