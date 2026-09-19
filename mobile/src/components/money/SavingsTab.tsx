import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Button } from '../Button';
import { EmptyState } from '../EmptyState';
import { MoneySectionHeader } from '../MoneySectionHeader';
import { MoneyStat } from '../MoneyStat';
import { ProgressBar } from '../ProgressBar';
import { SavingsGoalCard } from '../SavingsGoalCard';
import type { Couple, CoupleMember, SavingsGoal, Transaction } from '../../types/entities';
import { calculateBucketAmountCents, calculateCombinedIncomeCents } from '../../utils/allocationCalculations';
import { calculateSavingsGoalBalance } from '../../utils/moneyCalculations';
import { formatMoney } from '../../utils/money';

interface SavingsTabProps {
  couple: Couple | null;
  members: CoupleMember[];
  goals: SavingsGoal[];
  transactions: Transaction[];
  currency: string;
}

/**
 * Multiple named savings goals, each with its own progress — separate from Budget, per the Money
 * Calculator spec. Every goal's "current amount" is derived, never stored (see
 * calculateSavingsGoalBalance) — the same "recompute from transactions" philosophy Account
 * balance already uses, applied to a second kind of bucket. Visually a modern goals dashboard:
 * a dominant "saved" figure up top (see MoneyStat), then a bordered list of goal rows.
 */
export function SavingsTab({ couple, members, goals, transactions, currency }: SavingsTabProps) {
  const router = useRouter();

  const totalSavingsCents = goals.reduce((sum, g) => sum + calculateSavingsGoalBalance(g.id, transactions), 0);
  const totalGoalsCents = goals.reduce((sum, g) => sum + g.target_amount_cents, 0);
  const overallPercent = totalGoalsCents > 0 ? Math.round((totalSavingsCents / totalGoalsCents) * 100) : 0;

  const combinedIncomeCents = calculateCombinedIncomeCents(members[0]?.monthly_income_cents ?? 0, members[1]?.monthly_income_cents ?? 0);
  const monthlyAllocationCents = couple?.savings_allocation_percent != null ? calculateBucketAmountCents(combinedIncomeCents, couple.savings_allocation_percent) : null;

  return (
    <View className="gap-7">
      <View className="gap-2">
        <MoneyStat label="Saved" value={formatMoney(totalSavingsCents, currency)} size="lg" />
        {goals.length > 0 ? (
          <>
            <Text className="text-sm text-textSecondary">
              {formatMoney(totalGoalsCents, currency)} total goals · {overallPercent}% overall progress
            </Text>
            <ProgressBar percent={overallPercent} tone={overallPercent >= 100 ? 'success' : 'accent'} />
          </>
        ) : null}
        {monthlyAllocationCents !== null ? (
          <Text className="text-xs text-textMuted">{formatMoney(monthlyAllocationCents, currency)} allocated this month</Text>
        ) : null}
      </View>

      <View className="gap-3">
        <MoneySectionHeader label="Goals" />
        {goals.length === 0 ? (
          <EmptyState title="No savings goals yet" description="Emergency Fund, MP2, Travel, a house — whatever you're saving toward." />
        ) : (
          <View className="gap-3">
            {goals.map((goal) => (
              <SavingsGoalCard
                key={goal.id}
                name={goal.name}
                currentAmountCents={calculateSavingsGoalBalance(goal.id, transactions)}
                targetAmountCents={goal.target_amount_cents}
                currency={goal.currency}
                onPress={() => router.push(`/savings-goals/${goal.id}`)}
              />
            ))}
          </View>
        )}
        <Button label="+ Add Savings Goal" variant="secondary" onPress={() => router.push('/savings-goals/new')} />
      </View>
    </View>
  );
}
