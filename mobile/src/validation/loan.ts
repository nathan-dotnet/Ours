import { z } from 'zod';
import { parseAmountInputToCents } from '../utils/money';

const MAX_AMOUNT_CENTS = 10_000_000 * 100; // mirrors the backend's MaxMoneyAmount sanity ceiling

const requiredAmountText = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter ${label}`)
    .refine((value) => parseAmountInputToCents(value) !== null, 'Enter a valid amount')
    .refine((value) => (parseAmountInputToCents(value) ?? 0) > 0, 'Amount must be greater than zero')
    .refine((value) => (parseAmountInputToCents(value) ?? 0) <= MAX_AMOUNT_CENTS, 'Amount is too large');

export const loanSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(60, 'Keep it under 60 characters'),
  provider: z.string().trim().max(60, 'Keep it under 60 characters'),
  originalAmountText: requiredAmountText('the original amount'),
  monthlyPaymentText: requiredAmountText('the monthly payment'),
  totalInstallmentsText: z
    .string()
    .trim()
    .min(1, 'Enter the number of installments')
    .refine((value) => /^\d+$/.test(value) && Number(value) >= 1, 'Enter at least 1 installment')
    .refine((value) => Number(value) <= 999, 'Enter a realistic number of installments'),
  /** The date installment 1 is due — anchors the whole schedule (see utils/loanSchedule.ts). Same `z.date()` shape as transaction.ts's transactionDate, bound to a DateTimeField. */
  firstDueDate: z.date(),
  /** Optional interest/fees, for display only — never folded into the original amount or the derived remaining-balance math. */
  feesAmountText: z
    .string()
    .trim()
    .refine((value) => value === '' || parseAmountInputToCents(value) !== null, 'Enter a valid amount'),
});

export type LoanFormValues = z.infer<typeof loanSchema>;
