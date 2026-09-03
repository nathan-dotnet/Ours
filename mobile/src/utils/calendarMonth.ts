/** Pure date-grid math for the month view — kept separate from the component so it's unit-testable without rendering. */

export interface MonthGridDay {
  date: Date;
  /** false for the leading/trailing days of neighboring months shown to fill out the grid. */
  inCurrentMonth: boolean;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return isSameDay(a, b);
}

/**
 * Builds a fixed 6-week (42-day) grid for the given month, starting on Sunday, including the
 * trailing days of the previous/next month needed to fill the first and last rows.
 */
export function getMonthGridDays(year: number, month: number): MonthGridDay[] {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay(); // 0 (Sun) .. 6 (Sat)
  const gridStart = new Date(year, month, 1 - startOffset);

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    return { date, inCurrentMonth: date.getMonth() === month };
  });
}
