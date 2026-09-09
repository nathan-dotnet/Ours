import { z } from 'zod';
import { parseAmountInputToCents } from '../utils/money';

/** Mirrors the backend's AccountType constants exactly. */
export const ACCOUNT_TYPES = ['Bank', 'EWallet', 'Cash', 'Savings', 'Other'] as const;

export type AccountTypeValue = (typeof ACCOUNT_TYPES)[number];

export const accountSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(100),
  type: z.enum(ACCOUNT_TYPES),
  icon: z.string().trim().min(1),
  // Kept as raw text through validation, same reasoning as every money amount field — see
  // utils/money.ts's parseAmountInputToCents (exact, string-based, never a floating parse).
  // Empty means "starting from zero", which is a perfectly normal new account.
  openingBalanceText: z
    .string()
    .trim()
    .refine((value) => value === '' || parseAmountInputToCents(value) !== null, 'Enter a valid amount'),
  currency: z
    .string()
    .trim()
    .length(3, 'Use a 3-letter currency code')
    .regex(/^[A-Za-z]{3}$/, 'Use a 3-letter currency code')
    .transform((value) => value.toUpperCase()),
  isActive: z.boolean(),
});

export type AccountFormValues = z.infer<typeof accountSchema>;
