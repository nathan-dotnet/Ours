import { z } from 'zod';
import { parseAmountInputToCents } from '../utils/money';

/**
 * Preset quick-pick chips for an expense category — not exhaustive. The backend's
 * TransactionCategory.ExpenseCategories treats this as an *open* vocabulary: a couple can also
 * type their own custom name (e.g. "Date Night", "Baby Fund") so a budget or expense can live
 * wherever they actually organize their spending — see CategoryPickerField.
 */
export const EXPENSE_CATEGORIES = [
  'Food', 'Groceries', 'Transportation', 'Shopping', 'Bills', 'Entertainment', 'Health',
  'Personal', 'Education', 'Travel', 'Household', 'Other',
] as const;

/** The handful shown as Quick Log's own fast-tap chips (see app/transactions/quick-log.tsx) — everything else is still one tap away via "More…"/the full CategoryPickerField, same open vocabulary, no separate category list. */
export const QUICK_LOG_CATEGORIES = ['Food', 'Transportation', 'Shopping', 'Bills', 'Entertainment', 'Other'] as const;

/** Mirrors the backend's TransactionCategory.IncomeCategories exactly — income stays a closed vocabulary. */
export const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Gift', 'Refund', 'Other'] as const;

/** Mirrors the backend's TransactionCategory.MaxExpenseCategoryLength (the Category column's max length) exactly. */
export const MAX_EXPENSE_CATEGORY_LENGTH = 30;

const MAX_AMOUNT_CENTS = 10_000_000 * 100; // mirrors the backend's MaxMoneyAmount sanity ceiling

const amountText = z
  .string()
  .trim()
  .min(1, 'Enter an amount')
  .refine((value) => parseAmountInputToCents(value) !== null, 'Enter a valid amount')
  .refine((value) => (parseAmountInputToCents(value) ?? 0) > 0, 'Amount must be greater than zero')
  .refine((value) => (parseAmountInputToCents(value) ?? 0) <= MAX_AMOUNT_CENTS, 'Amount is too large');

export const expenseTransactionSchema = z.object({
  amountText,
  // Open vocabulary — a preset or a custom name (see EXPENSE_CATEGORIES above).
  category: z
    .string()
    .trim()
    .min(1, 'Enter a category')
    .max(MAX_EXPENSE_CATEGORY_LENGTH, `Keep it under ${MAX_EXPENSE_CATEGORY_LENGTH} characters`),
  accountId: z.string().min(1, 'Choose an account'),
  description: z.string().trim().max(2000).optional(),
  transactionDate: z.date(),
  notes: z.string().trim().max(2000).optional(),
  paidByUserId: z.string().nullable().optional(),
});

export const incomeTransactionSchema = z.object({
  amountText,
  category: z.enum(INCOME_CATEGORIES),
  accountId: z.string().min(1, 'Choose an account'),
  description: z.string().trim().max(2000).optional(),
  transactionDate: z.date(),
  notes: z.string().trim().max(2000).optional(),
});

export const transferTransactionSchema = z
  .object({
    amountText,
    accountId: z.string().min(1, 'Choose a source account'),
    destinationAccountId: z.string().min(1, 'Choose a destination account'),
    transactionDate: z.date(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((data) => data.accountId !== data.destinationAccountId, {
    message: 'Source and destination must be different',
    path: ['destinationAccountId'],
  });

export type ExpenseTransactionFormValues = z.infer<typeof expenseTransactionSchema>;
export type IncomeTransactionFormValues = z.infer<typeof incomeTransactionSchema>;
export type TransferTransactionFormValues = z.infer<typeof transferTransactionSchema>;
