import { z } from 'zod';
import { parseAmountInputToCents } from '../utils/money';

/** Mirrors the backend's ExpenseCategory constants exactly — keep both lists in sync. */
export const EXPENSE_CATEGORIES = [
  'Food',
  'Transportation',
  'Shopping',
  'Bills',
  'Entertainment',
  'Health',
  'Travel',
  'Home',
  'Other',
] as const;

export type ExpenseCategoryValue = (typeof EXPENSE_CATEGORIES)[number];

/** Same application-level sanity ceiling as the backend (SyncService.MaxExpenseAmount) — see there for why it's independent of the column's actual headroom. */
const MAX_AMOUNT_CENTS = 10_000_000 * 100;

export const expenseSchema = z.object({
  // Kept as raw text (not z.number()) through validation — the amount field's value is a string
  // the whole way through the form so the numeric keypad and parseAmountInputToCents (exact,
  // string-based) are what ever touch it; see utils/money.ts.
  amountText: z
    .string()
    .trim()
    .min(1, 'Enter an amount')
    .refine((value) => parseAmountInputToCents(value) !== null, 'Enter a valid amount')
    .refine((value) => (parseAmountInputToCents(value) ?? 0) > 0, 'Amount must be greater than zero')
    .refine((value) => (parseAmountInputToCents(value) ?? 0) <= MAX_AMOUNT_CENTS, 'Amount is too large'),
  currency: z
    .string()
    .trim()
    .length(3, 'Use a 3-letter currency code')
    .regex(/^[A-Za-z]{3}$/, 'Use a 3-letter currency code')
    .transform((value) => value.toUpperCase()),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().max(2000).optional(),
  expenseDate: z.date(),
  notes: z.string().trim().max(2000).optional(),
});

export type ExpenseFormValues = z.infer<typeof expenseSchema>;
