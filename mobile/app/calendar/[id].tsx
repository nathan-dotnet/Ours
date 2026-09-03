import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { CalendarEventForm } from '@/components/CalendarEventForm';
import { Screen } from '@/components/Screen';
import { useCalendarEvent, useDeleteCalendarEvent, useUpdateCalendarEvent } from '@/hooks/useCalendarEvents';
import { useAuthStore } from '@/stores/authStore';
import { allDayRange } from '@/utils/calendarGrouping';
import type { CalendarEventFormValues } from '@/validation/calendar';

export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const { data: event, isLoading } = useCalendarEvent(id);
  const updateEvent = useUpdateCalendarEvent();
  const deleteEvent = useDeleteCalendarEvent();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (values: CalendarEventFormValues) => {
    if (!event || !user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const [startAt, endAt] = values.allDay ? allDayRange(values.startAt) : [values.startAt, values.endAt];
      const reminderAt =
        values.reminderMinutesBefore === null ? null : new Date(values.startAt.getTime() - values.reminderMinutesBefore * 60_000);
      await updateEvent(
        event,
        {
          title: values.title,
          description: values.description?.trim() || null,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          allDay: values.allDay,
          location: values.location?.trim() || null,
          reminderAt: reminderAt?.toISOString() ?? null,
        },
        user.id,
      );
      router.back();
    } catch {
      setError('Could not save this event. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const performDelete = async () => {
    if (!event) return;
    setIsDeleting(true);
    try {
      await deleteEvent(event);
      router.back();
    } catch {
      setError('Could not delete this event. Please try again.');
      setIsDeleting(false);
    }
  };

  /** Destructive action — always confirm before a single tap removes the event (see Phase 2 spec). */
  const onDelete = () => {
    Alert.alert('Delete this event?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: performDelete },
    ]);
  };

  if (isLoading) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#C97C6D" />
        </View>
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-2">
          <Text className="text-lg font-semibold text-ink">Event not found</Text>
          <Text className="text-center text-clay">It may have already been deleted — pull to sync to catch up.</Text>
        </View>
      </Screen>
    );
  }

  const reminderMinutesBefore = event.reminder_at
    ? Math.round((new Date(event.start_at).getTime() - new Date(event.reminder_at).getTime()) / 60_000)
    : null;

  return (
    <Screen scroll>
      <CalendarEventForm
        initialValues={{
          title: event.title,
          description: event.description ?? '',
          startAt: new Date(event.start_at),
          endAt: new Date(event.end_at),
          allDay: Boolean(event.all_day),
          location: event.location ?? '',
          reminderMinutesBefore,
        }}
        submitLabel="Save changes"
        isSubmitting={isSubmitting}
        serverError={error}
        onSubmit={onSubmit}
        onDelete={onDelete}
        isDeleting={isDeleting}
      />
    </Screen>
  );
}
