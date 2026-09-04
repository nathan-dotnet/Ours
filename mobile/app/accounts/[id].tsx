import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { AccountForm } from '@/components/AccountForm';
import { Screen } from '@/components/Screen';
import { useAccount, useUpdateAccount } from '@/hooks/useAccounts';
import { useTransactionsForAccount } from '@/hooks/useTransactions';
import { useAuthStore } from '@/stores/authStore';
import { getAccountBrand } from '@/utils/accountBrand';
import { calculateAccountBalance } from '@/utils/moneyCalculations';
import { centsToAmountInput, formatMoney } from '@/utils/money';
import type { AccountFormValues } from '@/validation/account';

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const { data: account, isLoading } = useAccount(id);
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
          <ActivityIndicator color="#C97C6D" />
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
  const brand = getAccountBrand(account.icon, account.type);
  const history = (transactions ?? []).slice(0, 20);

  return (
    <Screen scroll>
      <View className="items-center gap-2 py-4">
        <Text className="text-3xl">{brand.emoji}</Text>
        <Text className="text-2xl font-semibold text-ink">{account.name}</Text>
        <Text className="text-3xl font-semibold text-ink">{formatMoney(balanceCents, account.currency)}</Text>
        <Text className="text-sm text-clay">
          {account.type} · {account.currency}
          {!account.is_active ? ' · Inactive' : ''}
        </Text>
      </View>

      <View className="flex-row gap-3 pb-4">
        <Pressable onPress={() => setIsEditing(true)} className="flex-1 items-center rounded-2xl bg-blush px-5 py-4">
          <Text className="text-base font-semibold text-rose">Edit Account</Text>
        </Pressable>
        {account.is_active ? (
          <Pressable onPress={onDeactivate} className="flex-1 items-center rounded-2xl bg-blush px-5 py-4">
            <Text className="text-base font-semibold text-rose">Deactivate</Text>
          </Pressable>
        ) : null}
      </View>

      <Text className="pb-2 text-sm font-semibold text-clay">Recent</Text>
      {history.length === 0 ? (
        <Text className="text-clay">No transactions on this account yet.</Text>
      ) : (
        <View className="gap-2">
          {history.map((transaction) => {
            const isTransfer = transaction.type === 'Transfer';
            const isOutgoing = transaction.type === 'Expense' || (isTransfer && transaction.account_id === account.id);
            return (
              <Pressable
                key={transaction.id}
                onPress={() => router.push(`/transactions/${transaction.id}`)}
                className="flex-row items-center justify-between rounded-2xl bg-blush p-4"
              >
                <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={1}>
                  {transaction.description || transaction.category || transaction.type}
                </Text>
                <Text className="text-base font-semibold text-ink">
                  {isOutgoing ? '-' : '+'}
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
