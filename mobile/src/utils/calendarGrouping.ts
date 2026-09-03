import type { CalendarEvent } from '../types/entities';

export interface CalendarEventGroup {
  label: string;
  events: CalendarEvent[];
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Events starting on the given local day, sorted chronologically — used by the month-view calendar's day list. */
export function getEventsForDate(events: CalendarEvent[], date: Date): CalendarEvent[] {
  const day = startOfDay(date).getTime();
  return events
    .filter((event) => startOfDay(new Date(event.start_at)).getTime() === day)
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
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
