import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { SyncStatusBadge } from '@/components/SyncStatusBadge';
import { useExpensesForMonth, useExpenseTotals } from '@/hooks/useExpenses';
import { useLocalCouple } from '@/hooks/useCouple';
import { triggerSync } from '@/sync';
import { groupExpensesByDay } from '@/utils/expenseGrouping';
import { formatMoney } from '@/utils/money';

const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

const CATEGORY_ICONS: Record<string, string> = {
  Food: '🍔',
  Transportation: '🚗',
  Shopping: '🛍️',
  Bills: '💡',
  Entertainment: '🎬',
  Health: '💊',
  Travel: '✈️',
  Home: '🏠',
  Other: '💸',
};

export default function MoneyScreen() {
  const router = useRouter();
  const { data: coupleData } = useLocalCouple();
  const coupleId = coupleData?.couple.id;
  const [isRefreshing, setIsRefreshing] = useState(false);

  const displayedMonth = useMemo(() => new Date(), []);
  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth() + 1;

  const { data: expenses, isLoading, isError, refetch } = useExpensesForMonth(coupleId, year, month);
  const allExpenses = expenses ?? [];
  const { totalCents, categoryTotals } = useExpenseTotals(allExpenses);
  const groups = groupExpensesByDay(allExpenses);
  // All expenses for the month share one currency in this MVP (no multi-currency totals yet) —
  // fall back to PHP purely for an empty month with nothing to read a code from.
  const currency = allExpenses[0]?.currency ?? 'PHP';

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
          <Text className="text-sm text-clay">{monthFormatter.format(displayedMonth)}</Text>
        </View>
        <Pressable onPress={() => router.push('/expenses/new')} className="rounded-full bg-rose px-4 py-2">
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
      ) : isError ? (
        <View className="mt-8 items-center gap-3">
          <Text className="text-lg font-semibold text-ink">Couldn't load your expenses</Text>
          <Text className="text-center text-clay">This is a local issue, not a connection one — try again.</Text>
          <Button label="Try again" variant="secondary" onPress={() => refetch()} />
        </View>
      ) : (
        <View className="mt-4 gap-6">
          <View className="gap-1 rounded-2xl bg-blush p-4">
            <Text className="text-sm font-medium text-clay">Total this month</Text>
            <Text className="text-3xl font-semibold text-ink">{formatMoney(totalCents, currency)}</Text>
          </View>

          {categoryTotals.length > 0 ? (
            <View className="gap-2">
              <Text className="text-sm font-semibold text-clay">By category</Text>
              {categoryTotals.map(({ category, cents }) => (
                <View key={category} className="flex-row items-center justify-between rounded-xl bg-blush/60 px-4 py-2.5">
                  <Text className="text-sm text-ink">
                    {CATEGORY_ICONS[category] ?? '💸'} {category}
                  </Text>
                  <Text className="text-sm font-semibold text-ink">{formatMoney(cents, currency)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {groups.length === 0 ? (
            <View className="items-center gap-3 py-8">
              <Text className="text-lg font-semibold text-ink">No expenses yet</Text>
              <Text className="text-center text-clay">Log your first shared expense this month.</Text>
              <Button label="Add expense" onPress={() => router.push('/expenses/new')} />
            </View>
          ) : (
            <View className="gap-4">
              {groups.map((group) => (
                <View key={group.label} className="gap-2">
                  <Text className="text-sm font-semibold text-clay">{group.label}</Text>
                  {group.expenses.map((expense) => (
                    <Pressable
                      key={expense.id}
                      onPress={() => router.push(`/expenses/${expense.id}`)}
                      className="flex-row items-center justify-between rounded-2xl bg-blush p-4"
                    >
                      <View className="flex-1 gap-1 pr-2">
                        <Text className="text-base font-semibold text-ink">
                          {CATEGORY_ICONS[expense.category] ?? '💸'} {expense.description || expense.category}
                        </Text>
                        {expense.notes ? (
                          <Text className="text-sm text-clay" numberOfLines={1}>
                            {expense.notes}
                          </Text>
                        ) : null}
                      </View>
                      <Text className="text-base font-semibold text-ink">{formatMoney(expense.amount_cents, expense.currency)}</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </Screen>
  );
}
