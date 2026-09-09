import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { AccountForm } from '@/components/AccountForm';
import { BrandLogo } from '@/components/BrandLogo';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { useAccount, useActiveAccounts, useUpdateAccount } from '@/hooks/useAccounts';
import { useLocalCouple } from '@/hooks/useCouple';
import { useTransactionsForAccount } from '@/hooks/useTransactions';
import { useAuthStore } from '@/stores/authStore';
import { calculateAccountBalance } from '@/utils/moneyCalculations';
import { softRaised } from '@/styles/neumorphism';
import { describeTransaction } from '@/utils/moneyActivity';
import { centsToAmountInput, formatMoney } from '@/utils/money';
import type { AccountFormValues } from '@/validation/account';

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const { data: coupleData } = useLocalCouple();
  const { data: account, isLoading } = useAccount(id);
  const { data: allAccounts } = useActiveAccounts(coupleData?.couple.id);
  const { data: transactions } = useTransactionsForAccount(id);
  const updateAccount = useUpdateAccount();
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (values: AccountFormValues) => {
    if (!account || !user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await updateAccount(account, { name: values.name, type: values.type, icon: values.icon, currency: values.currency, isActive: values.isActive }, user.id);
      setIsEditing(false);
    } catch {
      setError('Could not save these changes. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const onDeactivate = () => {
    if (!account || !user) return;
    Alert.alert('Deactivate this account?', 'Its history stays visible, but it will leave the active dashboard and totals.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Deactivate',
        style: 'destructive',
        onPress: async () => {
          await updateAccount(account, { name: account.name, type: account.type, icon: account.icon, currency: account.currency, isActive: false }, user.id);
          router.back();
        },
      },
    ]);
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

  if (!account) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-2">
          <Text className="text-lg font-semibold text-ink">Account not found</Text>
        </View>
      </Screen>
    );
  }

  if (isEditing) {
    return (
      <Screen scroll>
        <AccountForm
          initialValues={{
            name: account.name,
            type: account.type as AccountFormValues['type'],
            icon: account.icon,
            openingBalanceText: centsToAmountInput(account.opening_balance_cents),
            currency: account.currency,
            isActive: Boolean(account.is_active),
          }}
          openingBalanceLocked
          submitLabel="Save changes"
          isSubmitting={isSubmitting}
          serverError={error}
          onSubmit={onSubmit}
        />
      </Screen>
    );
  }

  const balanceCents = calculateAccountBalance(account.opening_balance_cents, account.id, transactions ?? []);
  const history = (transactions ?? []).slice(0, 20);

  return (
    <Screen scroll>
      <View className="items-center gap-2 py-4">
        <BrandLogo icon={account.icon} accountType={account.type} size={56} />
        <Text className="text-2xl font-semibold text-ink">{account.name}</Text>
        <Text className="text-sm text-clay">Current Balance</Text>
        <Text className="text-3xl font-semibold text-ink">{formatMoney(balanceCents, account.currency)}</Text>
        <Text className="text-sm text-clay">
          {account.type} · {account.currency}
          {!account.is_active ? ' · Inactive' : ''}
        </Text>
      </View>

      <View className="gap-3 pb-4">
        <View className="flex-row gap-3">
          <Button label="Transfer Money" variant="secondary" onPress={() => router.push(`/transactions/new?type=Transfer&accountId=${account.id}`)} />
          <Button label="Add Expense" variant="secondary" onPress={() => router.push(`/transactions/new?type=Expense&accountId=${account.id}`)} />
        </View>
        <View className="flex-row gap-3">
          <Button label="Add Income" variant="secondary" onPress={() => router.push(`/transactions/new?type=Income&accountId=${account.id}`)} />
          <Button label="Edit Account" variant="secondary" onPress={() => setIsEditing(true)} />
        </View>
        {account.is_active ? <Button label="Deactivate Account" variant="secondary" onPress={onDeactivate} /> : null}
      </View>

      <Text className="pb-2 text-sm font-semibold text-clay">Transactions</Text>
      {history.length === 0 ? (
        <Text className="text-clay">No transactions on this account yet.</Text>
      ) : (
        <View className="gap-2">
          {history.map((transaction) => {
            const description = describeTransaction(transaction, allAccounts ?? [], account.id);
            return (
              <Pressable
                key={transaction.id}
                onPress={() => router.push(`/transactions/${transaction.id}`)}
                className="flex-row items-center justify-between rounded-2xl bg-blush p-4"
                style={softRaised}
              >
                <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={1}>
                  {description.icon} {description.title}
                </Text>
                <Text className="text-base font-semibold text-ink">
                  {description.amountText}
                  {formatMoney(transaction.amount_cents, transaction.currency)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
