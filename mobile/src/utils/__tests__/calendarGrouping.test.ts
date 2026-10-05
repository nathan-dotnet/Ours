import type { CalendarEvent } from '../../types/entities';
import { allDayRange, getDatesWithEvents, getDatesWithEventsInRange, getEventsForDate, groupEventsByDay } from '../calendarGrouping';

function makeEvent(id: string, startAt: string, overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id,
    couple_id: 'couple-1',
    title: id,
    description: null,
    start_at: startAt,
    end_at: startAt,
    all_day: 0,
    location: null,
    reminder_at: null,
    repeat_type: 'None',
    repeat_interval: 1,
    repeat_until: null,
    repeat_days_of_week: 0,
    recurrence_parent_id: null,
    original_occurrence_start_at: null,
    created_by_user_id: 'user-1',
    created_at: startAt,
    updated_at: startAt,
    updated_by_user_id: 'user-1',
    version: 1,
    is_deleted: 0,
    ...overrides,
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

describe('getEventsForDate', () => {
  it('returns only events starting on the given local day, sorted chronologically', () => {
    const events = [
      makeEvent('evening', new Date(2026, 5, 15, 19).toISOString()),
      makeEvent('morning', new Date(2026, 5, 15, 8).toISOString()),
      makeEvent('other-day', new Date(2026, 5, 16, 8).toISOString()),
    ];

    const result = getEventsForDate(events, new Date(2026, 5, 15, 12));

    expect(result.map((e) => e.id)).toEqual(['morning', 'evening']);
  });

  it('returns an empty array when nothing is scheduled that day', () => {
    expect(getEventsForDate([], new Date(2026, 5, 15))).toEqual([]);
  });

  it('generates daily occurrences only on screen and respects the inclusive repeat-until date', () => {
    const event = makeEvent('daily', new Date(2026, 5, 1, 9).toISOString(), {
      repeat_type: 'Daily', repeat_interval: 2, repeat_until: '2026-06-05',
    });
    expect(getEventsForDate([event], new Date(2026, 5, 3)).map((row) => row.start_at)).toEqual([
      new Date(2026, 5, 3, 9).toISOString(),
    ]);
    expect(getEventsForDate([event], new Date(2026, 5, 4))).toEqual([]);
  });

  it('keeps daily intervals aligned across daylight-saving transitions', () => {
    const event = makeEvent('dst-daily', new Date(2026, 2, 8, 9).toISOString(), {
      repeat_type: 'Daily', repeat_interval: 2,
    });
    expect(getEventsForDate([event], new Date(2026, 2, 10)).map((row) => row.start_at)).toEqual([
      new Date(2026, 2, 10, 9).toISOString(),
    ]);
  });

  it('supports weekly weekday masks and suppresses only the overridden occurrence', () => {
    const parent = makeEvent('weekly', new Date(2026, 5, 1, 9).toISOString(), {
      repeat_type: 'Weekly', repeat_days_of_week: (1 << 2) | (1 << 4),
    });
    const occurrenceStart = new Date(2026, 5, 2, 9).toISOString();
    const override = makeEvent('override', new Date(2026, 5, 3, 11).toISOString(), {
      recurrence_parent_id: parent.id, original_occurrence_start_at: occurrenceStart,
    });
    expect(getEventsForDate([parent, override], new Date(2026, 5, 2))).toEqual([]);
    expect(getEventsForDate([parent, override], new Date(2026, 5, 3)).map((row) => row.id)).toEqual(['override']);
    expect(getEventsForDate([parent], new Date(2026, 5, 4))[0].isGeneratedOccurrence).toBe(true);
  });
});

describe('getDatesWithEvents', () => {
  it('marks exactly the local days that have at least one event', () => {
    const events = [makeEvent('a', new Date(2026, 5, 15, 9).toISOString()), makeEvent('b', new Date(2026, 5, 20, 9).toISOString())];

    const dates = getDatesWithEvents(events);

    expect(dates.has('2026-5-15')).toBe(true);
    expect(dates.has('2026-5-20')).toBe(true);
    expect(dates.has('2026-5-16')).toBe(false);
  });

  it('marks recurring dates across the requested month range', () => {
    const event = makeEvent('weekly', new Date(2026, 5, 1, 9).toISOString(), {
      repeat_type: 'Weekly', repeat_days_of_week: 1 << 1,
    });
    const dates = getDatesWithEventsInRange([event], new Date(2026, 5, 1), new Date(2026, 5, 30));
    expect(dates.has('2026-5-1')).toBe(true);
    expect(dates.has('2026-5-8')).toBe(true);
    expect(dates.has('2026-5-15')).toBe(true);
  });
});

describe('allDayRange', () => {
  it('collapses the picked date to local midnight for both the start and the end', () => {
    const picked = new Date(2026, 5, 15, 14, 30);

    const [start, end] = allDayRange(picked);

    expect(start).toEqual(new Date(2026, 5, 15, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 5, 15, 0, 0, 0, 0));
  });
});
