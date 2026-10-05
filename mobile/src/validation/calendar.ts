import { z } from 'zod';

/** Preset reminder offsets shown in the form — kept as a fixed set rather than a free time picker for simplicity. */
export const REMINDER_OPTIONS = [
  { label: 'None', minutesBefore: null },
  { label: '10 minutes before', minutesBefore: 10 },
  { label: '30 minutes before', minutesBefore: 30 },
  { label: '1 hour before', minutesBefore: 60 },
  { label: '1 day before', minutesBefore: 60 * 24 },
] as const;

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const calendarEventSchema = z
  .object({
    title: z.string().trim().min(1, 'Enter a title').max(200),
    description: z.string().trim().max(2000).optional(),
    startAt: z.date(),
    endAt: z.date(),
    allDay: z.boolean(),
    location: z.string().trim().max(200).optional(),
    reminderMinutesBefore: z.number().nullable(),
    repeatType: z.enum(['None', 'Daily', 'Weekly', 'Monthly', 'Yearly']).default('None'),
    repeatIntervalText: z.string().regex(/^\d+$/, 'Enter a whole number').refine((value) => Number(value) >= 1 && Number(value) <= 999, 'Use an interval from 1 to 999').default('1'),
    repeatUntilText: z.string().refine((value) => value === '' || isIsoDate(value), 'Use a valid YYYY-MM-DD date').default(''),
    repeatForever: z.boolean().default(true),
    repeatDaysOfWeek: z.number().int().min(0).max(127).default(0),
  })
  .refine((data) => data.allDay || data.endAt > data.startAt, {
    // An all-day event's start/end both collapse to the same local midnight (see
    // app/calendar/new.tsx and [id].tsx), so the strict "after" check only makes sense for
    // timed events — it would otherwise reject every valid all-day event.
    message: 'End time must be after start time',
    path: ['endAt'],
  })
  .refine((data) => data.repeatType !== 'Weekly' || data.repeatDaysOfWeek !== 0, {
    message: 'Choose at least one day',
    path: ['repeatDaysOfWeek'],
  })
  .refine((data) => data.repeatType === 'None' || data.repeatForever || data.repeatUntilText !== '', {
    message: 'Choose an end date or repeat forever',
    path: ['repeatUntilText'],
  })
  .refine((data) => {
    if (data.repeatType === 'None' || data.repeatForever || data.repeatUntilText === '') return true;
    const startDate = `${data.startAt.getFullYear()}-${String(data.startAt.getMonth() + 1).padStart(2, '0')}-${String(data.startAt.getDate()).padStart(2, '0')}`;
    return data.repeatUntilText >= startDate;
  }, {
    message: 'End date must be on or after the start date',
    path: ['repeatUntilText'],
  });

export type CalendarEventFormValues = z.infer<typeof calendarEventSchema>;
