/**
 * Money is stored and summed everywhere on this device as an integer number of minor units
 * ("cents") — never as a JS floating-point decimal. Summing integers has no rounding drift at
 * all (unlike `100.10 + 0.20`, which in native JS floating point is `100.30000000000001`), so
 * every local total (monthly total, category breakdown) is computed with plain integer addition
 * over `amount_cents` and only ever converted to a display/API decimal at the very end, once.
 *
 * The wire format (ExpensePayload.amount) is still a plain decimal JSON number, matching the
 * backend's `decimal`/numeric(18,2) — exact on that end regardless of what mobile does. The two
 * conversion functions below are what keep the mobile side exact too: apiAmountToCents rounds a
 * single multiply (immune to the tiny floating-point noise at that scale), and centsToApiAmount
 * uses toFixed to normalize the double to a clean 2-decimal literal before parsing it back, which
 * is what stops stray artifacts like `100.30000000000001` from ever being serialized.
 */

/** Parses a decimal amount received from the API (or read back out of a JSON sync_queue payload) into exact integer cents. */
export function apiAmountToCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Converts integer cents back into the decimal number sent over the wire — never a value like 100.30000000000001. */
export function centsToApiAmount(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

/**
 * Parses raw user text (e.g. "100.10" from the amount field) directly into integer cents via
 * string manipulation — no floating-point arithmetic touches the value at all on the way in.
 * Returns null for anything that isn't a plain non-negative amount with at most 2 decimal places
 * (the numeric keypad plus this parser is what "prevents obviously invalid values", not a regex
 * alone — see validation/expense.ts for the Zod-level check shown to the user).
 */
export function parseAmountInputToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;

  const [wholePart, fractionPart = ''] = trimmed.split('.');
  const cents = fractionPart.padEnd(2, '0');
  const totalCents = Number(wholePart) * 100 + Number(cents);
  return Number.isSafeInteger(totalCents) ? totalCents : null;
}

/** Formats integer cents back into the text shown in the amount field while editing (no currency symbol/grouping). */
export function centsToAmountInput(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const wholePart = Math.floor(abs / 100);
  const fractionPart = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${wholePart}.${fractionPart}`;
}

/** Formats integer cents as a currency string for display, e.g. formatMoney(125050, 'PHP') -> "₱1,250.50". */
export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
  } catch {
    // An unrecognized/malformed currency code shouldn't crash the screen — fall back to a plain
    // "CODE amount" rendering instead of Intl throwing a RangeError.
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

/** Sums a list of integer-cent amounts using plain integer addition — exact, no float drift regardless of list length. */
export function sumCents(amounts: number[]): number {
  return amounts.reduce((total, cents) => total + cents, 0);
}
