import type { CalendarEvent } from '../types/entities';
import { toLocalDateString } from './date';

export interface CalendarEventGroup {
  label: string;
  events: CalendarEvent[];
}

export type CalendarDisplayEvent = CalendarEvent & { isGeneratedOccurrence: boolean; occurrenceStartAt: string };

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function calendarDayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

function matchesRecurrenceOnDate(event: CalendarEvent, date: Date): boolean {
  const start = new Date(event.start_at);
  const candidate = startOfDay(date);
  const first = startOfDay(start);
  const dayDelta = calendarDayNumber(candidate) - calendarDayNumber(first);
  const interval = Math.max(1, event.repeat_interval || 1);
  if (dayDelta < 0 || (event.repeat_until && toLocalDateString(candidate) > event.repeat_until)) return false;
  if (dayDelta === 0) return true;

  if (event.repeat_type === 'Daily') return dayDelta % interval === 0;
  if (event.repeat_type === 'Weekly') {
    const weekStart = new Date(first.getFullYear(), first.getMonth(), first.getDate() - first.getDay());
    const candidateWeek = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate() - candidate.getDay());
    const weekDelta = Math.floor((calendarDayNumber(candidateWeek) - calendarDayNumber(weekStart)) / 7);
    const days = event.repeat_days_of_week || (1 << start.getDay());
    return weekDelta >= 0 && weekDelta % interval === 0 && (days & (1 << candidate.getDay())) !== 0;
  }
  if (event.repeat_type === 'Monthly') {
    const monthDelta = (candidate.getFullYear() - first.getFullYear()) * 12 + candidate.getMonth() - first.getMonth();
    const targetDay = Math.min(start.getDate(), new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate());
    return monthDelta >= 0 && monthDelta % interval === 0 && candidate.getDate() === targetDay;
  }
  if (event.repeat_type === 'Yearly') {
    const yearDelta = candidate.getFullYear() - first.getFullYear();
    const targetDay = Math.min(start.getDate(), new Date(candidate.getFullYear(), start.getMonth() + 1, 0).getDate());
    return yearDelta >= 0 && yearDelta % interval === 0 && candidate.getMonth() === start.getMonth() && candidate.getDate() === targetDay;
  }
  return dayDelta === 0;
}

function occurrenceAt(event: CalendarEvent, date: Date): CalendarDisplayEvent {
  const start = new Date(event.start_at);
  const startAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds());
  const duration = new Date(event.end_at).getTime() - start.getTime();
  return {
    ...event,
    start_at: startAt.toISOString(),
    end_at: new Date(startAt.getTime() + Math.max(0, duration)).toISOString(),
    isGeneratedOccurrence: true,
    occurrenceStartAt: startAt.toISOString(),
  };
}

/** Generates recurring rows only for the requested range; nothing is cloned into SQLite. */
export function getOccurrencesForRange(events: CalendarEvent[], rangeStart: Date, rangeEnd: Date): CalendarDisplayEvent[] {
  const start = startOfDay(rangeStart);
  const end = startOfDay(rangeEnd);
  const overrides = new Set(
    events.filter((event) => event.recurrence_parent_id && event.original_occurrence_start_at)
      .map((event) => `${event.recurrence_parent_id}|${event.original_occurrence_start_at}`),
  );
  const result: CalendarDisplayEvent[] = [];
  for (const event of events) {
    if (event.recurrence_parent_id) {
      if (startOfDay(new Date(event.start_at)) >= start && startOfDay(new Date(event.start_at)) <= end) {
        result.push({ ...event, isGeneratedOccurrence: false, occurrenceStartAt: event.start_at });
      }
      continue;
    }
    if (event.repeat_type === 'None') {
      if (startOfDay(new Date(event.start_at)) >= start && startOfDay(new Date(event.start_at)) <= end) {
        result.push({ ...event, isGeneratedOccurrence: false, occurrenceStartAt: event.start_at });
      }
      continue;
    }
    const eventStart = startOfDay(new Date(event.start_at));
    const firstDay = eventStart > start ? eventStart : start;
    for (let day = new Date(firstDay); day <= end; day.setDate(day.getDate() + 1)) {
      if (!matchesRecurrenceOnDate(event, day)) continue;
      const occurrence = occurrenceAt(event, day);
      if (!overrides.has(`${event.id}|${occurrence.occurrenceStartAt}`)) result.push(occurrence);
    }
  }
  return result.sort((a, b) => a.start_at.localeCompare(b.start_at));
}

/** Events and generated recurring occurrences starting on the given local day. */
export function getEventsForDate(events: CalendarEvent[], date: Date): CalendarDisplayEvent[] {
  return getOccurrencesForRange(events, date, date);
}

/** Local-day keys (YYYY-M-D, timezone-safe) of every date that has at least one event — used to mark days in the month grid. */
export function getDatesWithEvents(events: CalendarEvent[]): Set<string> {
  const keys = new Set<string>();
  for (const event of events) {
    const d = startOfDay(new Date(event.start_at));
    keys.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }
  return keys;
}

/** Day keys with events or generated recurrences in a bounded calendar range. */
export function getDatesWithEventsInRange(events: CalendarEvent[], rangeStart: Date, rangeEnd: Date): Set<string> {
  const keys = new Set<string>();
  for (const event of getOccurrencesForRange(events, rangeStart, rangeEnd)) {
    const date = startOfDay(new Date(event.start_at));
    keys.add(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
  }
  return keys;
}

/**
 * Collapses an all-day event's picked date to this device's local midnight for both start and
 * end. Storing a real UTC instant (rather than a bare date string) keeps CalendarEvent's fields
 * uniform for sync/versioning, but always deriving it from *local* midnight — never converting
 * the picked date through UTC first — is what stops the day from silently shifting by one
 * depending on the device's timezone offset (see "Timezone handling" in the Phase 2 spec).
 */
export function allDayRange(pickedDate: Date): [Date, Date] {
  const midnight = startOfDay(pickedDate);
  return [midnight, midnight];
}

function formatDayLabel(date: Date, now: Date): string {
  const diffDays = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** Groups events into day buckets ("Today", "Tomorrow", "Friday, June 5", ...), sorted chronologically. */
export function groupEventsByDay(events: CalendarEvent[], now: Date = new Date()): CalendarEventGroup[] {
  const groups = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const key = startOfDay(new Date(event.start_at)).toISOString();
    const existing = groups.get(key);
    if (existing) {
      existing.push(event);
    } else {
      groups.set(key, [event]);
    }
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, dayEvents]) => ({ label: formatDayLabel(new Date(key), now), events: dayEvents }));
}
