import { z } from 'zod';
import { parseAmountInputToCents } from '../utils/money';
import { EXPENSE_CATEGORIES } from './transaction';

const MAX_AMOUNT_CENTS = 10_000_000 * 100;

export const budgetSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amountText: z
    .string()
    .trim()
    .min(1, 'Enter an amount')
    .refine((value) => parseAmountInputToCents(value) !== null, 'Enter a valid amount')
    .refine((value) => (parseAmountInputToCents(value) ?? 0) > 0, 'Amount must be greater than zero')
    .refine((value) => (parseAmountInputToCents(value) ?? 0) <= MAX_AMOUNT_CENTS, 'Amount is too large'),
});

export type BudgetFormValues = z.infer<typeof budgetSchema>;
