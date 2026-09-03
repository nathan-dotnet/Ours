import { getMonthGridDays, isSameLocalDay } from '../calendarMonth';

describe('getMonthGridDays', () => {
  it('returns a fixed 42-day (6-week) grid', () => {
    expect(getMonthGridDays(2026, 8)).toHaveLength(42); // September 2026
  });

  it('starts the grid on a Sunday and every cell is exactly one day after the previous one', () => {
    const days = getMonthGridDays(2026, 8);

    expect(days[0].date.getDay()).toBe(0);
    for (let i = 1; i < days.length; i++) {
      const diff = days[i].date.getTime() - days[i - 1].date.getTime();
      expect(diff).toBe(24 * 60 * 60 * 1000);
    }
  });

  it('marks only days that actually fall within the requested month as inCurrentMonth', () => {
    const days = getMonthGridDays(2026, 8); // September 2026: Sep 1 is a Tuesday
    const inMonthDates = days.filter((d) => d.inCurrentMonth).map((d) => d.date.getDate());

    expect(inMonthDates).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(days.some((d) => !d.inCurrentMonth)).toBe(true);
  });

  it('rolls over correctly at a year boundary (December -> January)', () => {
    const days = getMonthGridDays(2026, 11); // December 2026
    const inMonthDates = days.filter((d) => d.inCurrentMonth).map((d) => d.date.getDate());

    expect(inMonthDates).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
  });
});

describe('isSameLocalDay', () => {
  it('is true for two Date instances on the same local day regardless of time', () => {
    expect(isSameLocalDay(new Date(2026, 8, 3, 0, 1), new Date(2026, 8, 3, 23, 59))).toBe(true);
  });

  it('is false across a day boundary', () => {
    expect(isSameLocalDay(new Date(2026, 8, 3, 23, 59), new Date(2026, 8, 4, 0, 1))).toBe(false);
  });
});
