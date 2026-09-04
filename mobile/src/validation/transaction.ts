import { z } from 'zod';
import { parseAmountInputToCents } from '../utils/money';

/** Mirrors the backend's TransactionCategory.ExpenseCategories exactly. */
export const EXPENSE_CATEGORIES = ['Food', 'Transportation', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Travel', 'Home', 'Other'] as const;

/** Mirrors the backend's TransactionCategory.IncomeCategories exactly. */
export const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Gift', 'Refund', 'Other'] as const;

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
  category: z.enum(EXPENSE_CATEGORIES),
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
