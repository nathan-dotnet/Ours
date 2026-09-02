import { calendarEventSchema } from '../calendar';

function values(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    title: 'Dinner',
    description: '',
    startAt: new Date('2026-06-15T18:00:00.000Z'),
    endAt: new Date('2026-06-15T20:00:00.000Z'),
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
});
