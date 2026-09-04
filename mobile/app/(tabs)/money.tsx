import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { AccountCard } from '@/components/AccountCard';
import { BudgetProgressRow } from '@/components/BudgetProgressRow';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { SyncStatusBadge } from '@/components/SyncStatusBadge';
import { useActiveAccounts } from '@/hooks/useAccounts';
import { useBudgetsForMonth } from '@/hooks/useBudgets';
import { useLocalCouple } from '@/hooks/useCouple';
import { useTransactionsForMonth } from '@/hooks/useTransactions';
import { triggerSync } from '@/sync';
import { getAccountBrand } from '@/utils/accountBrand';
import {
  calculateAccountBalance,
  calculateBudgetRemaining,
  calculateCategorySpending,
  calculateMonthlySpending,
  calculateTotalBalance,
} from '@/utils/moneyCalculations';
import { formatMoney } from '@/utils/money';

const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

export default function MoneyScreen() {
  const router = useRouter();
  const { data: coupleData } = useLocalCouple();
  const coupleId = coupleData?.couple.id;
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const totalBalanceCents = calculateTotalBalance(allAccounts, allTransactions);
  const spentThisMonthCents = calculateMonthlySpending(allTransactions, year, month);
  const totalBudgetCents = allBudgets.reduce((sum, b) => sum + b.amount_cents, 0);
  const remainingCents = calculateBudgetRemaining(totalBudgetCents, spentThisMonthCents);
  const categorySpending = calculateCategorySpending(allTransactions, year, month);

  const recentTransactions = [...allTransactions]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10);

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
      <View className="flex-row items-center justify-between pb-1 pt-4">
        <View>
          <Text className="text-3xl font-semibold text-ink">Money</Text>
          <Text className="text-sm text-clay">{monthFormatter.format(now)}</Text>
        </View>
        <Pressable onPress={() => router.push('/transactions/new')} className="rounded-full bg-rose px-4 py-2">
          <Text className="font-semibold text-cream">+ Add</Text>
        </Pressable>
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
        <View className="mt-4 gap-6">
          <View className="gap-1 rounded-2xl bg-blush p-4">
            <Text className="text-sm font-medium text-clay">Total Balance</Text>
            <Text className="text-3xl font-semibold text-ink">{formatMoney(totalBalanceCents, currency)}</Text>
          </View>

          <View className="gap-2">
            <Text className="text-sm font-semibold text-clay">Accounts</Text>
            {allAccounts.length === 0 ? (
              <View className="items-center gap-3 rounded-2xl bg-blush/60 py-8">
                <Text className="text-lg font-semibold text-ink">Where do you keep your money? ❤️</Text>
                <Text className="text-center text-clay">Add your first account to get started.</Text>
                <Button label="Add Account" onPress={() => router.push('/accounts/new')} />
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {allAccounts.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    balanceCents={calculateAccountBalance(account.opening_balance_cents, account.id, allTransactions)}
                    onPress={() => router.push(`/accounts/${account.id}`)}
                  />
                ))}
                <Pressable
                  onPress={() => router.push('/accounts/new')}
                  className="w-24 items-center justify-center rounded-2xl border border-dashed border-clay/40"
                >
                  <Text className="text-2xl text-clay">+</Text>
                  <Text className="text-xs text-clay">Add</Text>
                </Pressable>
              </ScrollView>
            )}
          </View>

          {allBudgets.length > 0 ? (
            <View className="gap-3">
              <Text className="text-sm font-semibold text-clay">This Month</Text>
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
              <Button label="Add Budget" variant="secondary" onPress={() => router.push('/budgets/new')} />
            </View>
          ) : (
            <View className="items-center gap-3 rounded-2xl bg-blush/60 py-8">
              <Text className="text-lg font-semibold text-ink">No budgets yet</Text>
              <Text className="text-center text-clay">Set a monthly budget to keep track of your spending.</Text>
              <Button label="Add Budget" onPress={() => router.push('/budgets/new')} />
            </View>
          )}

          <View className="gap-2">
            <Text className="text-sm font-semibold text-clay">Recent Transactions</Text>
            {recentTransactions.length === 0 ? (
              <View className="items-center gap-3 rounded-2xl bg-blush/60 py-8">
                <Text className="text-lg font-semibold text-ink">No transactions yet ❤️</Text>
                <Text className="text-center text-clay">Add an expense, income, or transfer.</Text>
              </View>
            ) : (
              recentTransactions.map((transaction) => {
                const account = allAccounts.find((a) => a.id === transaction.account_id);
                const destination = allAccounts.find((a) => a.id === transaction.destination_account_id);
                const brand = getAccountBrand(account?.icon ?? 'generic', account?.type ?? 'Other');
                const isTransfer = transaction.type === 'Transfer';
                const sign = transaction.type === 'Income' ? '+' : transaction.type === 'Expense' ? '-' : '';

                return (
                  <Pressable
                    key={transaction.id}
                    onPress={() => router.push(`/transactions/${transaction.id}`)}
                    className="flex-row items-center justify-between rounded-2xl bg-blush p-4"
                  >
                    <View className="flex-1 gap-1 pr-2">
                      <Text className="text-base font-semibold text-ink">
                        {isTransfer ? '🔄' : brand.emoji} {transaction.description || transaction.category || transaction.type}
                      </Text>
                      <Text className="text-sm text-clay">{isTransfer ? `${account?.name ?? '—'} → ${destination?.name ?? '—'}` : account?.name}</Text>
                    </View>
                    <Text className={`text-base font-semibold ${transaction.type === 'Income' ? 'text-ink' : 'text-ink'}`}>
                      {sign}
                      {formatMoney(transaction.amount_cents, transaction.currency)}
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
