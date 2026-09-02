import type { CalendarEvent } from '../types/entities';

export interface CalendarEventGroup {
  label: string;
  events: CalendarEvent[];
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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
