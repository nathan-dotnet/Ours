import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from 'react-native';
import { AccountCard } from '@/components/AccountCard';
import { BrandLogo } from '@/components/BrandLogo';
import { BudgetProgressRow } from '@/components/BudgetProgressRow';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { SyncStatusBadge } from '@/components/SyncStatusBadge';
import { useActiveAccounts } from '@/hooks/useAccounts';
import { useBudgetsForMonth } from '@/hooks/useBudgets';
import { useLocalCouple } from '@/hooks/useCouple';
import { useTransactionsForMonth } from '@/hooks/useTransactions';
import { triggerSync } from '@/sync';
import { getAccountGridView } from '@/utils/accountGrid';
import { calculateAccountBalance, calculateBudgetRemaining, calculateCategorySpending, calculateMonthlySpending } from '@/utils/moneyCalculations';
import { describeTransaction, getRecentActivity } from '@/utils/moneyActivity';
import { formatMoney } from '@/utils/money';

const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

export default function MoneyScreen() {
  const router = useRouter();
  const { data: coupleData } = useLocalCouple();
  const coupleId = coupleData?.couple.id;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [accountsExpanded, setAccountsExpanded] = useState(false);

  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const { data: accounts, isLoading: accountsLoading, isError: accountsError, refetch: refetchAccounts } = useActiveAccounts(coupleId);
  const { data: transactions, isLoading: transactionsLoading } = useTransactionsForMonth(coupleId, year, month);
  const { data: budgets, isLoading: budgetsLoading } = useBudgetsForMonth(coupleId, year, month);

  const allAccounts = accounts ?? [];
  const allTransactions = transactions ?? [];
  const allBudgets = budgets ?? [];
  const currency = allAccounts[0]?.currency ?? 'PHP';

  const spentThisMonthCents = calculateMonthlySpending(allTransactions, year, month);
  const totalBudgetCents = allBudgets.reduce((sum, b) => sum + b.amount_cents, 0);
  const remainingCents = calculateBudgetRemaining(totalBudgetCents, spentThisMonthCents);
  const categorySpending = calculateCategorySpending(allTransactions, year, month);

  const { visible: visibleAccounts, hasMore: hasMoreAccounts } = getAccountGridView(allAccounts, accountsExpanded);
  const recentActivity = getRecentActivity(allAccounts, allTransactions);

  const isLoading = accountsLoading || transactionsLoading || budgetsLoading;

  const onRefresh = async () => {
    setIsRefreshing(true);
    try {
      await triggerSync();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#C97C6D" />}>
      <View className="pb-1 pt-4">
        <Text className="text-3xl font-semibold text-ink">Money</Text>
        <Text className="text-sm text-clay">{monthFormatter.format(now)}</Text>
      </View>

      <View className="mt-3">
        <SyncStatusBadge />
      </View>

      {isLoading ? (
        <View className="items-center py-16">
          <ActivityIndicator color="#C97C6D" />
        </View>
      ) : accountsError ? (
        <View className="mt-8 items-center gap-3">
          <Text className="text-lg font-semibold text-ink">Couldn't load your Money data</Text>
          <Text className="text-center text-clay">This is a local issue, not a connection one — try again.</Text>
          <Button label="Try again" variant="secondary" onPress={() => refetchAccounts()} />
        </View>
      ) : (
        <View className="mt-4 gap-8">
          {/* --- Budget first: the dashboard leads with "how am I doing", not "where's my money" --- */}
          <View className="gap-3">
            <Text className="text-sm font-semibold text-clay">Budget</Text>

            {allBudgets.length > 0 ? (
              <>
                <View className="flex-row gap-3">
                  <View className="flex-1 gap-0.5 rounded-xl bg-blush/60 p-3">
                    <Text className="text-xs text-clay">Spent</Text>
                    <Text className="text-base font-semibold text-ink">{formatMoney(spentThisMonthCents, currency)}</Text>
                  </View>
                  <View className="flex-1 gap-0.5 rounded-xl bg-blush/60 p-3">
                    <Text className="text-xs text-clay">Budget</Text>
                    <Text className="text-base font-semibold text-ink">{formatMoney(totalBudgetCents, currency)}</Text>
                  </View>
                  <View className="flex-1 gap-0.5 rounded-xl bg-blush/60 p-3">
                    <Text className="text-xs text-clay">Remaining</Text>
                    <Text className={`text-base font-semibold ${remainingCents < 0 ? 'text-rose' : 'text-ink'}`}>
                      {formatMoney(remainingCents, currency)}
                    </Text>
                  </View>
                </View>

                <View className="gap-2">
                  {allBudgets.map((budget) => (
                    <BudgetProgressRow
                      key={budget.id}
                      category={budget.category}
                      spentCents={categorySpending[budget.category] ?? 0}
                      budgetCents={budget.amount_cents}
                      currency={budget.currency}
                      onPress={() => router.push(`/budgets/${budget.id}`)}
                    />
                  ))}
                </View>
              </>
            ) : (
              <View className="items-center gap-3 rounded-2xl bg-blush/60 py-8">
                <Text className="text-lg font-semibold text-ink">No budgets yet</Text>
                <Text className="text-center text-clay">Set a monthly budget to keep track of your spending.</Text>
              </View>
            )}

            {/* Budgets never block spending — this pairs "plan" with "actually spend" so that isn't a dead end. */}
            <View className="flex-row gap-3">
              <Button label="+ Add Budget" variant="secondary" onPress={() => router.push('/budgets/new')} />
              <Button label="+ Add Expense" onPress={() => router.push('/transactions/new?type=Expense')} />
            </View>
          </View>

          {/* --- Accounts: a 2-column grid, previewed rather than dumped in full --- */}
          <View className="gap-2">
            <Text className="text-sm font-semibold text-clay">Accounts</Text>
            {allAccounts.length === 0 ? (
              <View className="items-center gap-3 rounded-2xl bg-blush/60 py-8">
                <Text className="text-lg font-semibold text-ink">Where do you keep your money? ❤️</Text>
                <Text className="text-center text-clay">Add your first account to get started.</Text>
                <Button label="Add Account" onPress={() => router.push('/accounts/new')} />
              </View>
            ) : (
              <View className="gap-2">
                <View style={{ position: 'relative' }}>
                  <View className="flex-row flex-wrap gap-3">
                    {visibleAccounts.map((account) => (
                      <AccountCard
                        key={account.id}
                        account={account}
                        fill
                        balanceCents={calculateAccountBalance(account.opening_balance_cents, account.id, allTransactions)}
                        onPress={() => router.push(`/accounts/${account.id}`)}
                      />
                    ))}
                    {/* Grid rows are 2-wide — pad an odd trailing card so it doesn't stretch full width. */}
                    {visibleAccounts.length % 2 === 1 ? <View className="flex-1" /> : null}
                  </View>
                  {!accountsExpanded && hasMoreAccounts ? (
                    // Purely a visual preview cue — every card above remains fully tappable.
                    <View
                      pointerEvents="none"
                      className="absolute inset-x-0 bottom-0 h-16"
                      style={{ backgroundColor: 'rgba(251,246,242,0.85)' }}
                    />
                  ) : null}
                </View>

                {hasMoreAccounts ? (
                  <Pressable onPress={() => setAccountsExpanded((v) => !v)} className="items-center py-1">
                    <Text className="text-sm font-semibold text-rose">{accountsExpanded ? 'Show less ↑' : 'See All Accounts ↓'}</Text>
                  </Pressable>
                ) : null}

                <Button label="+ Add Account" variant="secondary" onPress={() => router.push('/accounts/new')} />
              </View>
            )}
          </View>

          {/* --- Recent activity: transactions plus (never as a fake transaction) new accounts --- */}
          <View className="gap-2">
            <Text className="text-sm font-semibold text-clay">Recent Transactions</Text>
            {recentActivity.length === 0 ? (
              <View className="items-center gap-3 rounded-2xl bg-blush/60 py-8">
                <Text className="text-lg font-semibold text-ink">No transactions yet ❤️</Text>
                <Text className="text-center text-clay">Add an expense, income, or transfer.</Text>
              </View>
            ) : (
              recentActivity.map((item) => {
                if (item.kind === 'account_created') {
                  return (
                    <Pressable
                      key={`account-${item.id}`}
                      onPress={() => router.push(`/accounts/${item.account.id}`)}
                      className="flex-row items-center gap-3 rounded-2xl bg-blush p-4"
                    >
                      <BrandLogo icon={item.account.icon} accountType={item.account.type} size={32} />
                      <View className="flex-1 gap-0.5">
                        <Text className="text-base font-semibold text-ink">{item.account.name} account added</Text>
                        <Text className="text-sm text-clay">
                          Starting balance {formatMoney(item.account.opening_balance_cents, item.account.currency)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                }

                const description = describeTransaction(item.transaction, allAccounts);
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => router.push(`/transactions/${item.transaction.id}`)}
                    className="flex-row items-center justify-between rounded-2xl bg-blush p-4"
                  >
                    <View className="flex-1 gap-1 pr-2">
                      <Text className="text-base font-semibold text-ink">
                        {description.icon} {description.title}
                      </Text>
                      <Text className="text-sm text-clay">{description.subtitle}</Text>
                    </View>
                    <Text className="text-base font-semibold text-ink">
                      {description.amountText}
                      {formatMoney(item.transaction.amount_cents, item.transaction.currency)}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </View>
        </View>
      )}
    </Screen>
  );
}
