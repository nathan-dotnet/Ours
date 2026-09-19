import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { AccountPickerField } from '@/components/AccountPickerField';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { SavingsGoalForm } from '@/components/SavingsGoalForm';
import { TextField } from '@/components/TextField';
import { useActiveAccounts } from '@/hooks/useAccounts';
import { useLocalCouple } from '@/hooks/useCouple';
import { useCreateTransaction, useTransactionsForCouple } from '@/hooks/useTransactions';
import { useDeleteSavingsGoal, useSavingsGoal, useUpdateSavingsGoal } from '@/hooks/useSavingsGoals';
import { useAuthStore } from '@/stores/authStore';
import { softRaised } from '@/styles/neumorphism';
import { toLocalDateString } from '@/utils/date';
import { calculateSavingsGoalBalance } from '@/utils/moneyCalculations';
import { centsToAmountInput, formatMoney, parseAmountInputToCents } from '@/utils/money';
import { parsePercentInput } from '@/utils/allocationCalculations';
import type { SavingsGoalFormValues } from '@/validation/savingsGoal';

/** A goal's progress is never stored — it's the sum of every SavingsContribution/Withdrawal transaction linked to it (see calculateSavingsGoalBalance), which can be against any of the couple's accounts. */
export default function SavingsGoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const { data: coupleData } = useLocalCouple();
  const { data: goal, isLoading } = useSavingsGoal(id);
  const { data: accounts } = useActiveAccounts(coupleData?.couple.id);
  const updateGoal = useUpdateSavingsGoal();
  const deleteGoal = useDeleteSavingsGoal();
  const createTransaction = useCreateTransaction();

  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [moneyMode, setMoneyMode] = useState<'contribute' | 'withdraw' | null>(null);
  const [moneyAccountId, setMoneyAccountId] = useState('');
  const [moneyAmountText, setMoneyAmountText] = useState('');
  const [moneyError, setMoneyError] = useState<string | null>(null);
  const [isMoneySubmitting, setIsMoneySubmitting] = useState(false);

  const allAccounts = accounts ?? [];
  const { data: transactions } = useTransactionsForCouple(coupleData?.couple.id);
  const allTransactions = transactions ?? [];
  const currentAmountCents = goal ? calculateSavingsGoalBalance(goal.id, allTransactions) : 0;

  const onSubmit = async (values: SavingsGoalFormValues) => {
    if (!goal || !user) return;
    const targetAmountCents = parseAmountInputToCents(values.targetAmountText);
    if (targetAmountCents === null) {
      setError('Enter a valid target amount.');
      return;
    }
    const allocationPercent = values.allocationPercentText.trim() === '' ? null : parsePercentInput(values.allocationPercentText);
    setError(null);
    setIsSubmitting(true);
    try {
      await updateGoal(goal, { name: values.name, targetAmountCents, currency: goal.currency, allocationPercent, isActive: true }, user.id);
      setIsEditing(false);
    } catch {
      setError('Could not save these changes. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const performDelete = async () => {
    if (!goal) return;
    setIsDeleting(true);
    try {
      await deleteGoal(goal);
      router.back();
    } catch {
      setError('Could not delete this goal. Please try again.');
      setIsDeleting(false);
    }
  };

  const onDelete = () => {
    Alert.alert('Delete this goal?', 'Its past contributions stay in your transaction history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: performDelete },
    ]);
  };

  const openMoneyForm = (mode: 'contribute' | 'withdraw') => {
    setMoneyMode(mode);
    setMoneyAccountId(allAccounts[0]?.id ?? '');
    setMoneyAmountText('');
    setMoneyError(null);
  };

  const onSubmitMoney = async () => {
    if (!goal || !user || !coupleData?.couple || !moneyMode) return;
    const amountCents = parseAmountInputToCents(moneyAmountText);
    if (amountCents === null) {
      setMoneyError('Enter a valid amount.');
      return;
    }
    if (!moneyAccountId) {
      setMoneyError('Choose an account.');
      return;
    }
    setMoneyError(null);
    setIsMoneySubmitting(true);
    try {
      await createTransaction(
        coupleData.couple.id,
        {
          type: moneyMode === 'contribute' ? 'SavingsContribution' : 'SavingsWithdrawal',
          amountCents,
          currency: allAccounts.find((a) => a.id === moneyAccountId)?.currency ?? goal.currency,
          accountId: moneyAccountId,
          category: null,
          savingsGoalId: goal.id,
          description: `${moneyMode === 'contribute' ? 'Added to' : 'Withdrew from'} ${goal.name}`,
          transactionDate: toLocalDateString(new Date()),
          notes: null,
        },
        user.id,
      );
      setMoneyMode(null);
    } catch {
      setMoneyError('Could not save this. Please try again.');
    } finally {
      setIsMoneySubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#5B7FBE" />
        </View>
      </Screen>
    );
  }

  if (!goal) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-2">
          <Text className="text-lg font-semibold text-ink">Goal not found</Text>
        </View>
      </Screen>
    );
  }

  if (isEditing) {
    return (
      <Screen scroll>
        <SavingsGoalForm
          initialValues={{
            name: goal.name,
            targetAmountText: centsToAmountInput(goal.target_amount_cents),
            allocationPercentText: goal.allocation_percent === null ? '' : String(goal.allocation_percent),
          }}
          submitLabel="Save changes"
          isSubmitting={isSubmitting}
          serverError={error}
          onSubmit={onSubmit}
        />
      </Screen>
    );
  }

  const progress = goal.target_amount_cents > 0 ? Math.min(currentAmountCents / goal.target_amount_cents, 1) : 0;

  if (moneyMode) {
    return (
      <Screen scroll>
        <View className="gap-4 pt-2">
          <Text className="text-lg font-semibold text-ink">{moneyMode === 'contribute' ? `Add money to ${goal.name}` : `Withdraw from ${goal.name}`}</Text>
          <TextField label="Amount" value={moneyAmountText} onChangeText={setMoneyAmountText} keyboardType="decimal-pad" placeholder="0.00" />
          <AccountPickerField
            label={moneyMode === 'contribute' ? 'From account' : 'To account'}
            accounts={allAccounts}
            value={moneyAccountId}
            onChange={setMoneyAccountId}
          />
          {moneyError ? <Text className="text-sm text-rose">{moneyError}</Text> : null}
          <Button label={moneyMode === 'contribute' ? 'Add money' : 'Withdraw'} onPress={onSubmitMoney} loading={isMoneySubmitting} />
          <Button label="Cancel" variant="secondary" onPress={() => setMoneyMode(null)} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View className="items-center gap-2 py-4">
        <Text className="text-2xl font-semibold text-ink">{goal.name}</Text>
        <Text className="text-3xl font-semibold text-ink">{formatMoney(currentAmountCents, goal.currency)}</Text>
        <Text className="text-sm text-clay">of {formatMoney(goal.target_amount_cents, goal.currency)} target</Text>

        <View className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-ink/10">
          <View className="h-full rounded-full bg-rose" style={{ width: `${Math.round(progress * 100)}%` }} />
        </View>
        <Text className="text-xs text-clay">{Math.round(progress * 100)}% there</Text>

        {goal.allocation_percent !== null ? (
          <Text className="text-xs text-clay">Gets {goal.allocation_percent}% of your monthly Savings allocation</Text>
        ) : (
          <Text className="text-xs text-clay">Manual-only — not part of automatic distribution</Text>
        )}
      </View>

      <View className="gap-3 pb-4">
        <View className="flex-row gap-3">
          <Button label="+ Add Money" variant="secondary" onPress={() => openMoneyForm('contribute')} />
          <Button label="Withdraw" variant="secondary" onPress={() => openMoneyForm('withdraw')} />
        </View>
        <View className="flex-row gap-3">
          <Button label="Edit Goal" variant="secondary" onPress={() => setIsEditing(true)} />
          <Button label="Delete Goal" variant="secondary" onPress={onDelete} loading={isDeleting} />
        </View>
      </View>

      {error ? <Text className="text-sm text-rose">{error}</Text> : null}

      <Text className="pb-2 text-sm font-semibold text-clay">Recent activity</Text>
      {allTransactions.filter((t) => t.savings_goal_id === goal.id).length === 0 ? (
        <Text className="text-clay">No contributions or withdrawals yet.</Text>
      ) : (
        <View className="gap-2">
          {allTransactions
            .filter((t) => t.savings_goal_id === goal.id)
            .slice(0, 20)
            .map((t) => (
              <View key={t.id} className="flex-row items-center justify-between rounded-2xl bg-blush p-4" style={softRaised}>
                <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={1}>
                  {t.type === 'SavingsContribution' ? '↓ Added' : '↑ Withdrew'}
                </Text>
                <Text className="text-base font-semibold text-ink">
                  {t.type === 'SavingsContribution' ? '+' : '-'}
                  {formatMoney(t.amount_cents, t.currency)}
                </Text>
              </View>
            ))}
        </View>
      )}
    </Screen>
  );
}
