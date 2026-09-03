/**
 * Converts a Date to a bare "YYYY-MM-DD" using its *local* year/month/day — never
 * `date.toISOString().slice(0, 10)`, which reads the UTC date and can silently shift to the
 * previous/next day depending on the device's timezone offset. Mirrors the backend's `DateOnly`
 * (see Expense.ExpenseDate) — a date with no time-of-day/timezone component at all.
 */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The inverse of toLocalDateString — parses "YYYY-MM-DD" as a local-midnight Date, not through `new Date(string)` (which parses as UTC and has the same shift risk). */
export function fromLocalDateString(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}
