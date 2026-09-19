import { z } from 'zod';
import { parseAmountInputToCents } from '../utils/money';
import { parsePercentInput } from '../utils/allocationCalculations';

const MAX_AMOUNT_CENTS = 10_000_000 * 100; // mirrors the backend's MaxMoneyAmount sanity ceiling

const amountText = z
  .string()
  .trim()
  .min(1, 'Enter an amount')
  .refine((value) => parseAmountInputToCents(value) !== null, 'Enter a valid amount')
  .refine((value) => (parseAmountInputToCents(value) ?? 0) > 0, 'Amount must be greater than zero')
  .refine((value) => (parseAmountInputToCents(value) ?? 0) <= MAX_AMOUNT_CENTS, 'Amount is too large');

export const savingsGoalSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(60, 'Keep it under 60 characters'),
  targetAmountText: amountText,
  /**
   * This goal's share of the monthly Savings allocation — optional (a manual-only goal has no
   * automatic share). Blank means "not included in Distribute Money", not zero-but-required.
   */
  allocationPercentText: z
    .string()
    .trim()
    .refine((value) => value === '' || parsePercentInput(value) !== null, 'Enter a valid percentage (0-100)'),
});

export type SavingsGoalFormValues = z.infer<typeof savingsGoalSchema>;
