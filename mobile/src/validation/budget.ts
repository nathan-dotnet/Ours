import { z } from 'zod';
import { parseAmountInputToCents } from '../utils/money';
import { MAX_EXPENSE_CATEGORY_LENGTH } from './transaction';

const MAX_AMOUNT_CENTS = 10_000_000 * 100;

export const budgetSchema = z.object({
  // An open vocabulary, same as an expense transaction's category (see transaction.ts) — a
  // preset like "Food", or a couple's own custom name (e.g. "Date Night") so a budget can live
  // wherever they actually organize their spending. Mirrors the backend's
  // TransactionCategory.IsValidExpenseCategory exactly.
  category: z
    .string()
    .trim()
    .min(1, 'Enter a category')
    .max(MAX_EXPENSE_CATEGORY_LENGTH, `Keep it under ${MAX_EXPENSE_CATEGORY_LENGTH} characters`),
  amountText: z
    .string()
    .trim()
    .min(1, 'Enter an amount')
    .refine((value) => parseAmountInputToCents(value) !== null, 'Enter a valid amount')
    .refine((value) => (parseAmountInputToCents(value) ?? 0) > 0, 'Amount must be greater than zero')
    .refine((value) => (parseAmountInputToCents(value) ?? 0) <= MAX_AMOUNT_CENTS, 'Amount is too large'),
});

export type BudgetFormValues = z.infer<typeof budgetSchema>;
