import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { CalendarEventForm } from '@/components/CalendarEventForm';
import { Screen } from '@/components/Screen';
import { useCalendarEvent, useCreateCalendarEvent, useDeleteCalendarEvent, useUpdateCalendarEvent } from '@/hooks/useCalendarEvents';
import { useLocalCouple } from '@/hooks/useCouple';
import { useAuthStore } from '@/stores/authStore';
import { allDayRange } from '@/utils/calendarGrouping';
import { toLocalDateString } from '@/utils/date';
import type { CalendarEventFormValues } from '@/validation/calendar';

export default function EditEventScreen() {
  const { id, occurrence, scope } = useLocalSearchParams<{ id: string; occurrence?: string; scope?: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const { data: event, isLoading } = useCalendarEvent(id);
  const { data: coupleData } = useLocalCouple();
  const createEvent = useCreateCalendarEvent();
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
      const input = {
          title: values.title,
          description: values.description?.trim() || null,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          allDay: values.allDay,
          location: values.location?.trim() || null,
          reminderAt: reminderAt?.toISOString() ?? null,
          repeatType: occurrence ? 'None' as const : values.repeatType,
          repeatInterval: Number(values.repeatIntervalText),
          repeatUntil: values.repeatForever ? null : values.repeatUntilText.trim() || null,
          repeatDaysOfWeek: !occurrence && values.repeatType === 'Weekly' ? values.repeatDaysOfWeek : 0,
          recurrenceParentId: occurrence ? event.id : event.recurrence_parent_id,
          originalOccurrenceStartAt: occurrence ?? event.original_occurrence_start_at,
        };
      if (occurrence) {
        if (!coupleData?.couple || !event.recurrence_parent_id && event.repeat_type === 'None') throw new Error('Not a recurring event');
        if (scope === 'future') {
          const occurrenceDate = new Date(occurrence);
          if (toLocalDateString(occurrenceDate) === toLocalDateString(new Date(event.start_at))) {
            await updateEvent(event, {
              ...input,
              recurrenceParentId: null,
              originalOccurrenceStartAt: null,
            }, user.id);
          } else {
            const cutoff = new Date(occurrenceDate.getFullYear(), occurrenceDate.getMonth(), occurrenceDate.getDate() - 1);
            await updateEvent(event, {
              title: event.title,
              description: event.description,
              startAt: event.start_at,
              endAt: event.end_at,
              allDay: Boolean(event.all_day),
              location: event.location,
              reminderAt: event.reminder_at,
              repeatType: event.repeat_type,
              repeatInterval: event.repeat_interval,
              repeatUntil: toLocalDateString(cutoff),
              repeatDaysOfWeek: event.repeat_days_of_week,
              recurrenceParentId: null,
              originalOccurrenceStartAt: null,
            }, user.id);
            await createEvent(coupleData.couple.id, {
              ...input,
              recurrenceParentId: null,
              originalOccurrenceStartAt: null,
            }, user.id);
          }
        } else {
          await createEvent(coupleData.couple.id, input, user.id);
        }
      } else {
        await updateEvent(event, input, user.id);
      }
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
          <ActivityIndicator color="#5B7FBE" />
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
          startAt: new Date(occurrence ?? event.start_at),
          endAt: occurrence ? new Date(new Date(occurrence).getTime() + new Date(event.end_at).getTime() - new Date(event.start_at).getTime()) : new Date(event.end_at),
          allDay: Boolean(event.all_day),
          location: event.location ?? '',
          reminderMinutesBefore,
          repeatType: event.repeat_type,
          repeatIntervalText: String(event.repeat_interval),
          repeatUntilText: event.repeat_until ?? '',
          repeatForever: event.repeat_until === null,
          repeatDaysOfWeek: event.repeat_days_of_week || (1 << new Date(event.start_at).getDay()),
        }}
        submitLabel={occurrence ? (scope === 'future' ? 'Save future events' : 'Save occurrence changes') : 'Save changes'}
        isSubmitting={isSubmitting}
        serverError={error}
        onSubmit={onSubmit}
        onDelete={occurrence ? undefined : onDelete}
        isDeleting={isDeleting}
        showRecurrence={!occurrence}
      />
    </Screen>
  );
}
