import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AccountCard } from '../AccountCard';
import { BudgetProgressRow } from '../BudgetProgressRow';
import { Button } from '../Button';
import { Card } from '../Card';
import { EmptyState } from '../EmptyState';
import { FilterChip } from '../FilterChip';
import { MoneySectionHeader } from '../MoneySectionHeader';
import { MoneyStat } from '../MoneyStat';
import { ProgressBar, type ProgressTone } from '../ProgressBar';
import { TransactionRow } from '../TransactionRow';
import type { Account, Budget, Couple, CoupleMember, Loan, Transaction } from '../../types/entities';
import { chunkIntoRows, getAccountGridView } from '../../utils/accountGrid';
import { calculateBucketAmountCents, calculateCombinedIncomeCents } from '../../utils/allocationCalculations';
import {
  calculateAccountBalance,
  calculateBudgetRemaining,
  calculateCategorySpending,
  calculateLoanPaidAmount,
  calculateLoanRemainingBalance,
  calculateMonthlySpending,
  calculateTotalBalance,
} from '../../utils/moneyCalculations';
import { getLoanDueStatus, getLoanProgress, getNextUnpaidInstallment, isSameMonth } from '../../utils/loanSchedule';
import { describeTransaction } from '../../utils/moneyActivity';
import { formatMoney } from '../../utils/money';
import { filterExpenses, groupExpensesByDay, type ExpenseFilter } from '../../utils/spendLog';

/** "Wants" is a plain Expense category (see the open category vocabulary), but tracked as its own allocation bucket, not mixed into Budget's category list/totals — see the Calculator. */
const WANTS_CATEGORY = 'Wants';

const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

type FilterKind = 'category' | 'account' | 'paidBy' | null;

interface BudgetTabProps {
  couple: Couple | null;
  members: CoupleMember[];
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  loans: Loan[];
  year: number;
  month: number;
  onChangeMonth: (delta: number) => void;
  onViewLoans: () => void;
}

/** Budget's own health tone/color, purely presentational — >=100% used is over budget, >=80% is approaching it, otherwise healthy. Same thresholds BudgetProgressRow uses per-category. */
function budgetTone(percentUsed: number): { bar: ProgressTone; text: string } {
  if (percentUsed >= 100) return { bar: 'error', text: 'text-error' };
  if (percentUsed >= 80) return { bar: 'warning', text: 'text-warning' };
  return { bar: 'accent', text: 'text-textPrimary' };
}

/**
 * Money's single "how am I doing with spending" home. Budget absorbed the old standalone Spend
 * Log tab (see MoneyTabs.tsx — Money is now exactly Budget/Savings/Calculator/Loans): the month
 * selector, Quick Log, filters, and day-grouped spending list that used to live in
 * SpendLogTab.tsx now live here, right alongside the Budget envelope they're actually about.
 * Nothing new was invented for the merge — every figure below still comes from the same
 * `Expense` transactions and the same `calculateMonthlySpending`/`calculateCategorySpending`/
 * `filterExpenses`/`groupExpensesByDay` helpers Budget and Spend Log each already used on their
 * own; LoanPayment/IncomeAllocation transactions never enter any of these calculations, so a
 * loan payment or a Calculator distribution never shows up as "spending" here.
 *
 * Visually this is the modern-fintech redesign's flagship screen: flat bordered surfaces (Card)
 * instead of neumorphic shadow blocks, the Remaining figure leading as the dominant number (see
 * MoneyStat's "value over label" hierarchy), and flat TransactionRow rows for Recent Spending
 * instead of one shadowed card per expense. See src/styles/neumorphism.ts's doc comment and the
 * Card/ProgressBar/StatusBadge/FilterChip/MoneySectionHeader/EmptyState primitives this and the
 * other three Money tabs now share.
 *
 * The headline Budget figure comes from the Calculator's saved allocation (combined income ×
 * Budget%) once a couple has saved one, instead of always being the sum of individual category
 * budgets — those stay, underneath, as finer-grained tracking within that envelope. A small
 * Wants card mirrors the same treatment for the Wants allocation, whose actual spending is just
 * ordinary Expense transactions tagged "Wants" kept out of Budget's own category list/totals.
 */
export function BudgetTab({ couple, members, accounts, transactions, budgets, loans, year, month, onChangeMonth, onViewLoans }: BudgetTabProps) {
  const router = useRouter();
  const [accountsExpanded, setAccountsExpanded] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [paidByUserId, setPaidByUserId] = useState<string | null>(null);
  const [expandedFilter, setExpandedFilter] = useState<FilterKind>(null);

  const toggleFilter = (kind: FilterKind) => setExpandedFilter((current) => (current === kind ? null : kind));

  const currency = accounts[0]?.currency ?? 'PHP';

  const totalBalanceCents = calculateTotalBalance(accounts, transactions);
  const categoryBudgets = budgets.filter((b) => b.category !== WANTS_CATEGORY);
  const nonWantsTransactions = transactions.filter((t) => t.category !== WANTS_CATEGORY);
  const spentThisMonthCents = calculateMonthlySpending(nonWantsTransactions, year, month);
  const categorySpending = calculateCategorySpending(nonWantsTransactions, year, month);

  const combinedIncomeCents = calculateCombinedIncomeCents(
    members[0]?.monthly_income_cents ?? 0,
    members[1]?.monthly_income_cents ?? 0,
  );
  const hasAllocationPlan = couple?.budget_allocation_percent != null;
  const totalBudgetCents = hasAllocationPlan
    ? calculateBucketAmountCents(combinedIncomeCents, couple!.budget_allocation_percent!)
    : categoryBudgets.reduce((sum, b) => sum + b.amount_cents, 0);
  const remainingCents = calculateBudgetRemaining(totalBudgetCents, spentThisMonthCents);
  // Guarded behind totalBudgetCents > 0 below so this never divides by zero — no budget configured
  // means no percentage bar at all, not a NaN/Infinity one.
  const percentUsed = totalBudgetCents > 0 ? Math.round((spentThisMonthCents / totalBudgetCents) * 100) : 0;
  const tone = budgetTone(percentUsed);

  const wantsAmountCents = couple?.wants_allocation_percent != null ? calculateBucketAmountCents(combinedIncomeCents, couple.wants_allocation_percent) : null;
  const wantsSpentCents = calculateMonthlySpending(
    transactions.filter((t) => t.category === WANTS_CATEGORY),
    year,
    month,
  );
  const wantsRemainingCents = (wantsAmountCents ?? 0) - wantsSpentCents;

  const { visible: visibleAccounts, hasMore: hasMoreAccounts } = getAccountGridView(accounts, accountsExpanded);

  // A compact summary only — full loan cards/payment history live on the Loans tab (see
  // LoansTab.tsx), so this never overwhelms the main Money dashboard (per the Loans spec's
  // "give awareness of debt without making Loans overwhelm the main Money dashboard").
  const today = new Date();
  const loanRows = loans.map((loan) => {
    const remainingCents = calculateLoanRemainingBalance(loan.original_amount_cents, calculateLoanPaidAmount(loan.id, transactions));
    const progress = getLoanProgress(loan, transactions);
    const next = getNextUnpaidInstallment(progress);
    const dueStatus = getLoanDueStatus(progress, today);
    return { loan, remainingCents, next, dueStatus };
  });
  const activeLoanRows = loanRows.filter((r) => r.dueStatus !== 'paid-off');
  const totalDebtCents = activeLoanRows.reduce((sum, r) => sum + r.remainingCents, 0);
  const dueThisMonthLoanCents = activeLoanRows
    .filter((r) => r.next && isSameMonth(r.next.dueDate, today))
    .reduce((sum, r) => sum + (r.next?.remainingCents ?? 0), 0);

  // Spending (formerly the standalone Spend Log tab): everyday Expense transactions for the
  // selected month, filterable and grouped by day — see utils/spendLog.ts. This is a filter/group
  // view over the exact same transactions Budget itself reads, never a second spending source.
  const allExpensesThisMonth = useMemo(() => filterExpenses(transactions, { year, month }), [transactions, year, month]);
  const categoriesInMonth = useMemo(
    () => Array.from(new Set(allExpensesThisMonth.map((e) => e.category).filter((c): c is string => Boolean(c)))).sort(),
    [allExpensesThisMonth],
  );
  const spendingFilter: ExpenseFilter = { year, month, category, accountId, paidByUserId };
  const filteredExpenses = useMemo(() => filterExpenses(transactions, spendingFilter), [transactions, spendingFilter]);
  const dayGroups = useMemo(() => groupExpensesByDay(filteredExpenses), [filteredExpenses]);
  const hasAnyFilterApplied = category !== null || accountId !== null || paidByUserId !== null;

  const memberLabel = (userId: string) => members.find((m) => m.user_id === userId)?.display_name ?? 'Someone';
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? '—';

  return (
    <View className="gap-7">
      {/*
        Total balance: a slim, secondary line — not a competing hero. It's a plain sum of
        calculateAccountBalance (a Transfer's two legs cancel out across the whole couple), not a
        new stored/synced figure, same "derive at read time" approach as everything below. Kept
        deliberately quiet so the Budget hero below remains the page's one dominant number.
      */}
      {accounts.length > 0 ? (
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-medium uppercase tracking-wider text-textMuted">Total Balance</Text>
          <Text className="text-sm font-semibold text-textPrimary">{formatMoney(totalBalanceCents, currency)}</Text>
        </View>
      ) : null}

      {/* Month selector: a plain, compact nav row — drives everything below (Budget amount, spending, category totals, Recent Spending) for whichever month is selected here. */}
      <View className="flex-row items-center justify-center gap-6">
        <Pressable onPress={() => onChangeMonth(-1)} hitSlop={8} accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={20} color="#7186A3" />
        </Pressable>
        <Text className="text-sm font-semibold text-textPrimary">{monthFormatter.format(new Date(year, month - 1))}</Text>
        <Pressable onPress={() => onChangeMonth(1)} hitSlop={8} accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={20} color="#7186A3" />
        </Pressable>
      </View>

      {/* Budget hero: the dashboard leads with "how am I doing", not "where's my money" — Remaining is the dominant figure, everything else beneath it in decreasing weight. */}
      {categoryBudgets.length > 0 || hasAllocationPlan ? (
        <Card className="gap-3 p-5">
          <MoneyStat label="Remaining" value={formatMoney(remainingCents, currency)} size="lg" valueClassName={tone.text} />
          <Text className="text-sm text-textSecondary">
            {formatMoney(spentThisMonthCents, currency)} spent of {formatMoney(totalBudgetCents, currency)} budget
          </Text>
          {totalBudgetCents > 0 ? (
            <View className="gap-1.5 pt-1">
              <ProgressBar percent={percentUsed} tone={tone.bar} />
              <Text className="text-xs text-textMuted">{Math.max(0, percentUsed)}% used</Text>
            </View>
          ) : null}
        </Card>
      ) : (
        <EmptyState
          title="No budgets yet"
          description="Set a monthly budget, or use the Calculator to plan your whole income."
        />
      )}

      {/* Category spending: compact bordered rows, grouped in one card — never a card per category. */}
      {categoryBudgets.length > 0 ? (
        <View className="gap-2">
          <MoneySectionHeader label="Spending" />
          <Card className="p-4">
            {categoryBudgets.map((budget, index) => (
              <BudgetProgressRow
                key={budget.id}
                category={budget.category}
                spentCents={categorySpending[budget.category] ?? 0}
                budgetCents={budget.amount_cents}
                currency={budget.currency}
                onPress={() => router.push(`/budgets/${budget.id}`)}
                showDivider={index < categoryBudgets.length - 1}
              />
            ))}
          </Card>
        </View>
      ) : hasAllocationPlan ? (
        <Text className="text-sm text-textSecondary">Set category budgets below to track finer-grained spending within this.</Text>
      ) : null}

      {/*
        Quick Log is the actual day-to-day action now (amount + category + account, logged in
        seconds — see app/transactions/quick-log.tsx) and stays the one primary button; Detailed
        Expense (the existing full form) and Add Budget are both secondary — reached less often.
      */}
      <View className="gap-2">
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button label="+ Quick Log" onPress={() => router.push('/transactions/quick-log')} />
          </View>
          <View className="flex-1">
            <Button label="+ Expense" variant="secondary" onPress={() => router.push('/transactions/new?type=Expense')} />
          </View>
        </View>
        <Pressable onPress={() => router.push('/budgets/new')} className="items-center py-1">
          <Text className="text-sm font-semibold text-accent">+ Add Budget</Text>
        </Pressable>
      </View>

      {/* Wants: its own small envelope, separate from Budget — see the module doc comment. */}
      {wantsAmountCents !== null ? (
        <View className="gap-2">
          <MoneySectionHeader label="Wants" />
          <Card className="flex-row justify-between">
            <MoneyStat label="Spent" value={formatMoney(wantsSpentCents, currency)} size="sm" />
            <MoneyStat label="Allocated" value={formatMoney(wantsAmountCents, currency)} size="sm" />
            <MoneyStat
              label="Remaining"
              value={formatMoney(wantsRemainingCents, currency)}
              size="sm"
              valueClassName={wantsRemainingCents < 0 ? 'text-error' : 'text-textPrimary'}
            />
          </Card>
          <Pressable onPress={() => router.push('/transactions/new?type=Expense')} className="items-center py-1">
            <Text className="text-sm font-semibold text-accent">+ Log a Want</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Loans: a compact summary card — full loan cards/payment history/Pay live on the Loans tab. */}
      {loans.length > 0 ? (
        <View className="gap-2">
          <MoneySectionHeader label="Loans" />
          <Card className="flex-row justify-between">
            <MoneyStat label="Total Debt" value={formatMoney(totalDebtCents, currency)} size="sm" />
            <MoneyStat label="Due This Month" value={formatMoney(dueThisMonthLoanCents, currency)} size="sm" />
          </Card>
          <Pressable onPress={onViewLoans} className="items-center py-1">
            <Text className="text-sm font-semibold text-accent">View Loans →</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Accounts: a 2-column grid, previewed rather than dumped in full */}
      <View className="gap-2">
        <MoneySectionHeader label="Accounts" />
        {accounts.length === 0 ? (
          <EmptyState
            title="Where do you keep your money?"
            description="Add your first account to get started."
            action={<Button label="Add Account" onPress={() => router.push('/accounts/new')} />}
          />
        ) : (
          <View className="gap-2">
            <View style={{ position: 'relative' }}>
              {/*
                Explicit row chunking (chunkIntoRows), not flex-wrap — a wrapping row
                reflows to however many cards fit a given screen width, which is exactly
                the "responsive grid that increases columns" this must never become. Every
                row here always has at most 2 cards, on any screen size, collapsed or expanded.
              */}
              <View className="gap-3">
                {chunkIntoRows(visibleAccounts).map((row, rowIndex) => (
                  <View key={rowIndex} className="flex-row gap-3">
                    {row.map((account) => (
                      <AccountCard
                        key={account.id}
                        account={account}
                        fill
                        balanceCents={calculateAccountBalance(account.opening_balance_cents, account.id, transactions)}
                        onPress={() => router.push(`/accounts/${account.id}`)}
                      />
                    ))}
                    {/* An odd trailing account gets a same-size empty spacer so its card doesn't stretch across both columns. */}
                    {row.length === 1 ? <View className="flex-1" /> : null}
                  </View>
                ))}
              </View>
              {!accountsExpanded && hasMoreAccounts ? (
                // Purely a visual preview cue — every card above remains fully tappable.
                <View pointerEvents="none" className="absolute inset-x-0 bottom-0 h-16" style={{ backgroundColor: 'rgba(234,241,251,0.85)' }} />
              ) : null}
            </View>

            {hasMoreAccounts ? (
              <Pressable onPress={() => setAccountsExpanded((v) => !v)} className="items-center py-1">
                <Text className="text-sm font-semibold text-accent">{accountsExpanded ? 'Show less ↑' : 'See All Accounts ↓'}</Text>
              </Pressable>
            ) : null}

            <Button label="+ Add Account" variant="secondary" onPress={() => router.push('/accounts/new')} />
          </View>
        )}
      </View>

      {/*
        Filters: a compact chip row, each expanding its own chip list below when tapped — one at a
        time. Month already has its own always-visible selector above, so this only covers
        Category/Account/Paid By — the same filter predicate Spend Log used to use (see
        utils/spendLog.ts's filterExpenses).
      */}
      <View className="gap-2">
        <MoneySectionHeader label="Filters" />
        <View className="flex-row flex-wrap gap-2">
          <FilterChip label={category ?? 'Category'} active={expandedFilter === 'category' || category !== null} onPress={() => toggleFilter('category')} expandable />
          <FilterChip label={accountId ? accountName(accountId) : 'Account'} active={expandedFilter === 'account' || accountId !== null} onPress={() => toggleFilter('account')} expandable />
          {members.length > 0 ? (
            <FilterChip label={paidByUserId ? memberLabel(paidByUserId) : 'Paid By'} active={expandedFilter === 'paidBy' || paidByUserId !== null} onPress={() => toggleFilter('paidBy')} expandable />
          ) : null}
          {hasAnyFilterApplied ? (
            <Pressable
              onPress={() => {
                setCategory(null);
                setAccountId(null);
                setPaidByUserId(null);
              }}
              className="items-center justify-center px-2 py-1.5"
            >
              <Text className="text-xs font-semibold text-accent">Clear</Text>
            </Pressable>
          ) : null}
        </View>

        {expandedFilter === 'category' ? (
          <View className="flex-row flex-wrap gap-2">
            <FilterChip label="All" active={category === null} onPress={() => setCategory(null)} />
            {categoriesInMonth.map((c) => (
              <FilterChip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
            ))}
          </View>
        ) : null}

        {expandedFilter === 'account' ? (
          <View className="flex-row flex-wrap gap-2">
            <FilterChip label="All" active={accountId === null} onPress={() => setAccountId(null)} />
            {accounts.map((a) => (
              <FilterChip key={a.id} label={a.name} active={accountId === a.id} onPress={() => setAccountId(a.id)} />
            ))}
          </View>
        ) : null}

        {expandedFilter === 'paidBy' ? (
          <View className="flex-row flex-wrap gap-2">
            <FilterChip label="Everyone" active={paidByUserId === null} onPress={() => setPaidByUserId(null)} />
            {members.map((m) => (
              <FilterChip key={m.user_id} label={m.display_name} active={paidByUserId === m.user_id} onPress={() => setPaidByUserId(m.user_id)} />
            ))}
          </View>
        ) : null}
      </View>

      {/*
        Recent Spending: day-grouped Expense transactions only (formerly Spend Log's own list) —
        one flat list with hairline dividers (TransactionRow), not a shadowed card per expense.
        Non-Expense activity (income, transfers, loan payments) is still visible from its own
        account/transaction detail screens.
      */}
      <View className="gap-3">
        <MoneySectionHeader label="Recent Spending" />
        {dayGroups.length === 0 ? (
          <EmptyState
            title="No spending yet"
            description="Start tracking your spending to see where your money goes."
            action={<Button label="+ Quick Log" onPress={() => router.push('/transactions/quick-log')} />}
          />
        ) : (
          <View className="gap-4">
            {dayGroups.map((group) => (
              <View key={group.dateKey} className="gap-1">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-textSecondary">{group.label}</Text>
                  <Text className="text-xs font-semibold text-textSecondary">{formatMoney(group.totalCents, currency)}</Text>
                </View>
                <View>
                  {group.expenses.map((expense, index) => {
                    const description = describeTransaction(expense, accounts);
                    const detail = [
                      expense.description || null,
                      accountName(expense.account_id),
                      expense.paid_by_user_id ? memberLabel(expense.paid_by_user_id) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <TransactionRow
                        key={expense.id}
                        description={{ ...description, title: expense.category ?? description.title, subtitle: detail }}
                        amountCents={expense.amount_cents}
                        currency={expense.currency}
                        onPress={() => router.push(`/transactions/${expense.id}`)}
                        showDivider={index < group.expenses.length - 1}
                      />
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
