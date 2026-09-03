import { useRouter } from 'expo-router';
import { useState } from 'react';
import { CalendarEventForm } from '@/components/CalendarEventForm';
import { Screen } from '@/components/Screen';
import { useCreateCalendarEvent } from '@/hooks/useCalendarEvents';
import { useLocalCouple } from '@/hooks/useCouple';
import { useAuthStore } from '@/stores/authStore';
import { allDayRange } from '@/utils/calendarGrouping';
import type { CalendarEventFormValues } from '@/validation/calendar';

function defaultStart(): Date {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date;
}

export default function NewEventScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const { data } = useLocalCouple();
  const createEvent = useCreateCalendarEvent();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = defaultStart();
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const onSubmit = async (values: CalendarEventFormValues) => {
    if (!data?.couple || !user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      // All-day events collapse to the wall-clock midnight of the chosen day, in this device's
      // own offset — read back (even on a partner's device in the same timezone) that still
      // means "the same day", which is what matters for an all-day event; see mobile/README.md.
      const [startAt, endAt] = values.allDay ? allDayRange(values.startAt) : [values.startAt, values.endAt];
      const reminderAt =
        values.reminderMinutesBefore === null ? null : new Date(values.startAt.getTime() - values.reminderMinutesBefore * 60_000);
      await createEvent(
        data.couple.id,
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
      // Local writes don't fail for network reasons (they're pure SQLite) — this is a genuine
      // unexpected error (e.g. a validation edge case), so keep the form open and show it.
      setError('Could not save this event. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen scroll>
      <CalendarEventForm
        initialValues={{ title: '', description: '', startAt: start, endAt: end, allDay: false, location: '', reminderMinutesBefore: null }}
        submitLabel="Add event"
        isSubmitting={isSubmitting}
        serverError={error}
        onSubmit={onSubmit}
      />
    </Screen>
  );
}
