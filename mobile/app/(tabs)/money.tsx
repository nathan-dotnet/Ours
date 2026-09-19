import { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, Text, View } from 'react-native';
import { BudgetTab } from '@/components/money/BudgetTab';
import { CalculatorTab } from '@/components/money/CalculatorTab';
import { LoansTab } from '@/components/money/LoansTab';
import { SavingsTab } from '@/components/money/SavingsTab';
import { Button } from '@/components/Button';
import { MoneyTabs, type MoneyTab } from '@/components/MoneyTabs';
import { Screen } from '@/components/Screen';
import { SyncStatusBadge } from '@/components/SyncStatusBadge';
import { useActiveAccounts } from '@/hooks/useAccounts';
import { useBudgetsForMonth } from '@/hooks/useBudgets';
import { useLocalCouple } from '@/hooks/useCouple';
import { useLoans } from '@/hooks/useLoans';
import { useSavingsGoals } from '@/hooks/useSavingsGoals';
import { useTransactionsForCouple } from '@/hooks/useTransactions';
import { triggerSync } from '@/sync';

const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

/**
 * Money's own 3-way segmented control (Budget / Savings / Calculator) — see MoneyTabs.tsx. This
 * screen stays a thin host: each tab's actual content lives in its own component under
 * src/components/money/, all reading from the same couple-wide data fetched once here.
 */
export default function MoneyScreen() {
  const { data: coupleData } = useLocalCouple();
  const coupleId = coupleData?.couple.id;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<MoneyTab>('Budget');

  const now = useMemo(() => new Date(), []);
  // Budget's month selector (merged in from the old Spend Log tab) needs to actually change what's
  // displayed, so this is stateful rather than fixed to "now" — everything month-scoped (budgets,
  // spending, category totals, recent spending) re-derives from Expense/Budget rows for whichever
  // year/month is selected here, same "derive, don't store" approach as everywhere else in Money.
  const [year, setYear] = useState(() => now.getFullYear());
  const [month, setMonth] = useState(() => now.getMonth() + 1);

  const changeMonth = (delta: number) => {
    const next = new Date(year, month - 1 + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth() + 1);
  };

  const { data: accounts, isLoading: accountsLoading, isError: accountsError, refetch: refetchAccounts } = useActiveAccounts(coupleId);
  const { data: transactions, isLoading: transactionsLoading } = useTransactionsForCouple(coupleId);
  const { data: budgets, isLoading: budgetsLoading } = useBudgetsForMonth(coupleId, year, month);
  const { data: savingsGoals, isLoading: goalsLoading } = useSavingsGoals(coupleId);
  const { data: loans, isLoading: loansLoading } = useLoans(coupleId);

  const allAccounts = accounts ?? [];
  const allTransactions = transactions ?? [];
  const allBudgets = budgets ?? [];
  const allGoals = savingsGoals ?? [];
  const allLoans = loans ?? [];

  const isLoading = accountsLoading || transactionsLoading || budgetsLoading || goalsLoading || loansLoading;

  const onRefresh = async () => {
    setIsRefreshing(true);
    try {
      await triggerSync();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#5B7FBE" />}>
      <View className="pb-1 pt-4">
        <Text className="text-3xl font-semibold text-ink">💰 Money</Text>
        <Text className="text-sm text-clay">{monthFormatter.format(now)}</Text>
      </View>

      <View className="mt-3">
        <SyncStatusBadge />
      </View>

      <View className="mt-4">
        <MoneyTabs active={activeTab} onChange={setActiveTab} />
      </View>

      {isLoading ? (
        <View className="items-center py-16">
          <ActivityIndicator color="#5B7FBE" />
        </View>
      ) : accountsError ? (
        <View className="mt-8 items-center gap-3">
          <Text className="text-lg font-semibold text-ink">Couldn't load your Money data</Text>
          <Text className="text-center text-clay">This is a local issue, not a connection one — try again.</Text>
          <Button label="Try again" variant="secondary" onPress={() => refetchAccounts()} />
        </View>
      ) : (
        <View className="mt-4">
          {activeTab === 'Budget' ? (
            <BudgetTab
              couple={coupleData?.couple ?? null}
              members={coupleData?.members ?? []}
              accounts={allAccounts}
              transactions={allTransactions}
              budgets={allBudgets}
              loans={allLoans}
              year={year}
              month={month}
              onChangeMonth={changeMonth}
              onViewLoans={() => setActiveTab('Loans')}
            />
          ) : activeTab === 'Savings' ? (
            <SavingsTab
              couple={coupleData?.couple ?? null}
              members={coupleData?.members ?? []}
              goals={allGoals}
              transactions={allTransactions}
              currency={allAccounts[0]?.currency ?? 'PHP'}
            />
          ) : activeTab === 'Loans' ? (
            <LoansTab members={coupleData?.members ?? []} accounts={allAccounts} loans={allLoans} transactions={allTransactions} />
          ) : coupleData?.couple ? (
            <CalculatorTab couple={coupleData.couple} members={coupleData.members} accounts={allAccounts} goals={allGoals} loans={allLoans} transactions={allTransactions} />
          ) : null}
        </View>
      )}
    </Screen>
  );
}
