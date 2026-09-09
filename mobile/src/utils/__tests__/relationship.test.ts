import { daysTogether } from '../relationship';

describe('daysTogether', () => {
  it('returns null when there is no anniversary date', () => {
    expect(daysTogether(null, new Date(2026, 8, 3))).toBeNull();
    expect(daysTogether(undefined, new Date(2026, 8, 3))).toBeNull();
  });

  it('counts the anniversary date itself as day 1', () => {
    expect(daysTogether('2026-09-03', new Date(2026, 8, 3))).toBe(1);
  });

  it('counts inclusively for the day after', () => {
    expect(daysTogether('2026-09-03', new Date(2026, 8, 4))).toBe(2);
  });

  it('counts a full year correctly', () => {
    expect(daysTogether('2020-06-15', new Date(2026, 8, 3))).toBe(2272);
  });

  it('is unaffected by the time-of-day on either end', () => {
    expect(daysTogether('2026-09-03', new Date(2026, 8, 4, 23, 59))).toBe(2);
  });

  it('returns null for a future anniversary date rather than a negative number', () => {
    expect(daysTogether('2030-01-01', new Date(2026, 8, 3))).toBeNull();
  });
});
