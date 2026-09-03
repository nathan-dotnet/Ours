import { fromLocalDateString, toLocalDateString } from '../date';

describe('toLocalDateString / fromLocalDateString', () => {
  it('formats a Date as YYYY-MM-DD using local components', () => {
    expect(toLocalDateString(new Date(2026, 8, 3))).toBe('2026-09-03'); // September is month index 8
  });

  it('pads single-digit months and days', () => {
    expect(toLocalDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('round-trips without shifting the day', () => {
    const original = new Date(2026, 8, 3, 23, 59, 59);
    const roundTripped = fromLocalDateString(toLocalDateString(original));
    expect(roundTripped.getFullYear()).toBe(2026);
    expect(roundTripped.getMonth()).toBe(8);
    expect(roundTripped.getDate()).toBe(3);
  });

  it('parses "YYYY-MM-DD" as local midnight, not through Date(string) UTC parsing', () => {
    const date = fromLocalDateString('2026-09-03');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(8);
    expect(date.getDate()).toBe(3);
    expect(date.getHours()).toBe(0);
  });
});
