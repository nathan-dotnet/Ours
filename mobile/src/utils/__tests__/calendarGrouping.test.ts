import type { CalendarEvent } from '../../types/entities';
import { groupEventsByDay } from '../calendarGrouping';

function makeEvent(id: string, startAt: string): CalendarEvent {
  return {
    id,
    couple_id: 'couple-1',
    title: id,
    description: null,
    start_at: startAt,
    end_at: startAt,
    reminder_at: null,
    created_by_user_id: 'user-1',
    created_at: startAt,
    updated_at: startAt,
    updated_by_user_id: 'user-1',
    version: 1,
    is_deleted: 0,
  };
}

describe('groupEventsByDay', () => {
  const now = new Date(2026, 5, 15, 12); // June 15, 2026, noon

  it('labels today, tomorrow, yesterday, and other days distinctly', () => {
    const events = [
      makeEvent('today', new Date(2026, 5, 15, 9).toISOString()),
      makeEvent('tomorrow', new Date(2026, 5, 16, 9).toISOString()),
      makeEvent('yesterday', new Date(2026, 5, 14, 9).toISOString()),
      makeEvent('next-week', new Date(2026, 5, 22, 9).toISOString()),
    ];

    const groups = groupEventsByDay(events, now);

    expect(groups.map((g) => g.label)).toEqual(['Yesterday', 'Today', 'Tomorrow', expect.stringContaining('June 22')]);
  });

  it('groups multiple same-day events together, sorted chronologically across days', () => {
    const events = [
      makeEvent('evening', new Date(2026, 5, 15, 19).toISOString()),
      makeEvent('morning', new Date(2026, 5, 15, 8).toISOString()),
    ];

    const groups = groupEventsByDay(events, now);

    expect(groups).toHaveLength(1);
    expect(groups[0].events.map((e) => e.id)).toEqual(['evening', 'morning']);
  });

  it('returns an empty array for no events', () => {
    expect(groupEventsByDay([], now)).toEqual([]);
  });
});
