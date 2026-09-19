import type { Account, Transaction } from '../types/entities';

/**
 * The one place that turns opening balances + transactions into an actual balance/spending
 * figure — the mobile mirror of the backend's `MoneyCalculator` (Ours.Application/Services).
 * Every screen (dashboard, account detail, budget progress) reads through these functions
 * instead of computing its own arithmetic, so there's exactly one implementation to keep correct.
 *
 * Deliberately stateless and recomputed from scratch every time rather than incremental: an
 * edited or deleted transaction needs no explicit "reverse the old effect" step, because these
 * functions only ever look at the *current* set of non-deleted transactions. All amounts are
 * integer cents (see utils/money.ts) — plain integer arithmetic throughout, never a float.
 */

/** Balance = opening_balance_cents + Income - Expense - TransferOut + TransferIn, over every non-deleted transaction touching this account. */
export function calculateAccountBalance(openingBalanceCents: number, accountId: string, transactions: Transaction[]): number {
  let balance = openingBalanceCents;
  for (const t of transactions) {
    if (t.is_deleted) continue;

    if (t.type === 'Income' && t.account_id === accountId) {
      balance += t.amount_cents;
    } else if (t.type === 'Expense' && t.account_id === accountId) {
      balance -= t.amount_cents;
    } else if (t.type === 'Transfer') {
      if (t.account_id === accountId) balance -= t.amount_cents;
      if (t.destination_account_id === accountId) balance += t.amount_cents;
    } else if (t.type === 'SavingsContribution' && t.account_id === accountId) {
      // The money leaves the spendable account into the earmarked goal — same direction as an
      // Expense, but never counted as spending (see calculateMonthlySpending).
      balance -= t.amount_cents;
    } else if (t.type === 'SavingsWithdrawal' && t.account_id === accountId) {
      balance += t.amount_cents;
    } else if (t.type === 'IncomeAllocation' && t.account_id === accountId) {
      // A distribution bucket landing in its destination account — credits like Income.
      balance += t.amount_cents;
    } else if (t.type === 'LoanPayment' && t.account_id === accountId) {
      // The money leaves the spendable account toward the loan — same direction as an Expense,
      // but tracked separately (see calculateMonthlySpending/calculateLoanPaidAmount).
      balance -= t.amount_cents;
    }
  }
  return balance;
}

/**
 * A savings goal's progress — deliberately never a stored column (see the SavingsGoal type):
 * the sum of every non-deleted SavingsContribution (+) and SavingsWithdrawal (-) transaction
 * linked to it, the same "derive fresh every time" approach as account balance.
 */
export function calculateSavingsGoalBalance(savingsGoalId: string, transactions: Transaction[]): number {
  let balance = 0;
  for (const t of transactions) {
    if (t.is_deleted || t.savings_goal_id !== savingsGoalId) continue;

    if (t.type === 'SavingsContribution') balance += t.amount_cents;
    else if (t.type === 'SavingsWithdrawal') balance -= t.amount_cents;
  }
  return balance;
}

/** Sum of every active (non-deleted) account's balance — a Transfer's two legs always cancel out across the whole couple. */
export function calculateTotalBalance(accounts: Account[], transactions: Transaction[]): number {
  return accounts
    .filter((a) => a.is_active && !a.is_deleted)
    .reduce((total, a) => total + calculateAccountBalance(a.opening_balance_cents, a.id, transactions), 0);
}

/** Total spent (Expense transactions only — never Income or Transfer) in the given calendar month. Reads transaction_date, not created_at. */
export function calculateMonthlySpending(transactions: Transaction[], year: number, month: number): number {
  return transactions
    .filter((t) => !t.is_deleted && t.type === 'Expense' && matchesMonth(t.transaction_date, year, month))
    .reduce((total, t) => total + t.amount_cents, 0);
}

/** Per-category spending (Expense only) for the given calendar month — the same figures a budget's "spent" is measured against. */
export function calculateCategorySpending(transactions: Transaction[], year: number, month: number): Record<string, number> {
  const byCategory: Record<string, number> = {};
  for (const t of transactions) {
    if (t.is_deleted || t.type !== 'Expense' || !t.category || !matchesMonth(t.transaction_date, year, month)) continue;
    byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount_cents;
  }
  return byCategory;
}

/** Remaining = budget amount - spent. Can go negative when over budget — the UI decides how to flag that; nothing here prevents or clamps it. */
export function calculateBudgetRemaining(budgetAmountCents: number, spentCents: number): number {
  return budgetAmountCents - spentCents;
}

/**
 * Total paid so far toward one loan — deliberately never a stored column (see the Loan type):
 * the sum of every non-deleted LoanPayment transaction linked to it, the same "derive fresh every
 * time" approach as account balance / savings goal progress. A loan's remaining balance is always
 * `originalAmountCents - calculateLoanPaidAmount(...)`.
 */
export function calculateLoanPaidAmount(loanId: string, transactions: Transaction[]): number {
  let paid = 0;
  for (const t of transactions) {
    if (t.is_deleted || t.type !== 'LoanPayment' || t.loan_id !== loanId) continue;
    paid += t.amount_cents;
  }
  return paid;
}

/** Never negative — a loan can't owe less than nothing. */
export function calculateLoanRemainingBalance(originalAmountCents: number, paidAmountCents: number): number {
  return Math.max(0, originalAmountCents - paidAmountCents);
}

// Installment-level progress (which installments are paid, next due date, overdue/due-today/
// upcoming status) lives in utils/loanSchedule.ts — it needs the loan's full schedule (anchored
// by first_due_date), not just a bare day-of-month, to correctly handle partial payments without
// a naive floor(paid / monthlyPayment). calculateLoanPaidAmount/calculateLoanRemainingBalance
// above are still correct and used for the headline totals that don't need per-installment detail.

/** Exported for utils/spendLog.ts's own month filter — same "YYYY-MM-DD" string-slice comparison, no Date-parsing timezone risk. */
export function matchesMonth(isoDate: string, year: number, month: number): boolean {
  // isoDate is always "YYYY-MM-DD" (see utils/date.ts) — a plain string slice avoids any
  // Date-parsing timezone risk entirely.
  const [y, m] = isoDate.split('-');
  return Number(y) === year && Number(m) === month;
}
