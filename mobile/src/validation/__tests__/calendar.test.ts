import { calendarEventSchema } from '../calendar';

function values(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    title: 'Dinner',
    description: '',
    startAt: new Date('2026-06-15T18:00:00.000Z'),
    endAt: new Date('2026-06-15T20:00:00.000Z'),
    allDay: false,
    location: '',
    reminderMinutesBefore: null,
    ...overrides,
  };
}

describe('calendarEventSchema', () => {
  it('accepts a well-formed event', () => {
    expect(calendarEventSchema.safeParse(values()).success).toBe(true);
  });

  it('rejects a blank title', () => {
    expect(calendarEventSchema.safeParse(values({ title: '  ' })).success).toBe(false);
  });

  it('rejects an end time before the start time', () => {
    const result = calendarEventSchema.safeParse(
      values({ startAt: new Date('2026-06-15T20:00:00.000Z'), endAt: new Date('2026-06-15T18:00:00.000Z') }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects an end time equal to the start time', () => {
    const same = new Date('2026-06-15T18:00:00.000Z');
    const result = calendarEventSchema.safeParse(values({ startAt: same, endAt: same }));
    expect(result.success).toBe(false);
  });

  it('accepts a null reminder and a numeric one', () => {
    expect(calendarEventSchema.safeParse(values({ reminderMinutesBefore: null })).success).toBe(true);
    expect(calendarEventSchema.safeParse(values({ reminderMinutesBefore: 30 })).success).toBe(true);
  });

  it('accepts an all-day event even when endAt equals (or precedes) startAt — they collapse to the same day', () => {
    const same = new Date('2026-06-15T00:00:00.000Z');
    expect(calendarEventSchema.safeParse(values({ allDay: true, startAt: same, endAt: same })).success).toBe(true);
  });

  it('still rejects an end time before the start time for a timed (non-all-day) event', () => {
    const result = calendarEventSchema.safeParse(
      values({ allDay: false, startAt: new Date('2026-06-15T20:00:00.000Z'), endAt: new Date('2026-06-15T18:00:00.000Z') }),
    );
    expect(result.success).toBe(false);
  });

  it('accepts an optional location', () => {
    expect(calendarEventSchema.safeParse(values({ location: 'Santa Monica' })).success).toBe(true);
    expect(calendarEventSchema.safeParse(values({ location: '' })).success).toBe(true);
  });

  it('requires a real ISO date for recurrence end dates', () => {
    expect(calendarEventSchema.safeParse(values({ repeatType: 'Monthly', repeatUntilText: '2026-02-30' })).success).toBe(false);
    expect(calendarEventSchema.safeParse(values({ repeatType: 'Monthly', repeatForever: false, repeatUntilText: '2026-12-31' })).success).toBe(true);
    expect(calendarEventSchema.safeParse(values({ repeatType: 'Monthly', repeatForever: false, repeatUntilText: '2026-02-28' })).success).toBe(false);
  });

  it('requires a selected day for weekly repetition and an end date when Until date is selected', () => {
    expect(calendarEventSchema.safeParse(values({ repeatType: 'Weekly' })).success).toBe(false);
    expect(calendarEventSchema.safeParse(values({ repeatType: 'Weekly', repeatDaysOfWeek: 1 << 5 })).success).toBe(true);
    expect(calendarEventSchema.safeParse(values({ repeatType: 'Daily', repeatForever: false })).success).toBe(false);
  });
});
