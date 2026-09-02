import { z } from 'zod';

/** Preset reminder offsets shown in the form — kept as a fixed set rather than a free time picker for simplicity. */
export const REMINDER_OPTIONS = [
  { label: 'None', minutesBefore: null },
  { label: '10 minutes before', minutesBefore: 10 },
  { label: '30 minutes before', minutesBefore: 30 },
  { label: '1 hour before', minutesBefore: 60 },
  { label: '1 day before', minutesBefore: 60 * 24 },
] as const;

export const calendarEventSchema = z
  .object({
    title: z.string().trim().min(1, 'Enter a title').max(200),
    description: z.string().trim().max(2000).optional(),
    startAt: z.date(),
    endAt: z.date(),
    reminderMinutesBefore: z.number().nullable(),
  })
  .refine((data) => data.endAt > data.startAt, {
    message: 'End time must be after start time',
    path: ['endAt'],
  });

export type CalendarEventFormValues = z.infer<typeof calendarEventSchema>;
