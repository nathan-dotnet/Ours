import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { ExpenseTransactionForm, IncomeTransactionForm, TransferTransactionForm } from '@/components/TransactionForms';
import { Screen } from '@/components/Screen';
import { useActiveAccounts } from '@/hooks/useAccounts';
import { useLocalCouple } from '@/hooks/useCouple';
import { useDeleteTransaction, useTransaction, useUpdateTransaction } from '@/hooks/useTransactions';
import { useAuthStore } from '@/stores/authStore';
import { fromLocalDateString, toLocalDateString } from '@/utils/date';
import { centsToAmountInput, parseAmountInputToCents } from '@/utils/money';
import type { ExpenseTransactionFormValues, IncomeTransactionFormValues, TransferTransactionFormValues } from '@/validation/transaction';

export default function EditTransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const { data: coupleData } = useLocalCouple();
  const { data: accounts } = useActiveAccounts(coupleData?.couple.id);
  const { data: transaction, isLoading } = useTransaction(id);
  const updateTransaction = useUpdateTransaction();
  const deleteTransaction = useDeleteTransaction();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAccounts = accounts ?? [];
  const members = coupleData?.members ?? [];

  const performDelete = async () => {
    if (!transaction) return;
    setIsDeleting(true);
    try {
      await deleteTransaction(transaction);
      router.back();
    } catch {
      setError('Could not delete this transaction. Please try again.');
      setIsDeleting(false);
    }
  };

  const onDelete = () => {
    Alert.alert('Delete this transaction?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: performDelete },
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

  if (!transaction || !user) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-2">
          <Text className="text-lg font-semibold text-ink">Transaction not found</Text>
          <Text className="text-center text-clay">It may have already been deleted — pull to sync to catch up.</Text>
        </View>
      </Screen>
    );
  }

  const onSubmitExpenseOrIncome = async (values: ExpenseTransactionFormValues | IncomeTransactionFormValues) => {
    const amountCents = parseAmountInputToCents(values.amountText);
    if (amountCents === null) {
      setError('Enter a valid amount.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await updateTransaction(
        transaction,
        {
          type: transaction.type,
          amountCents,
          currency: allAccounts.find((a) => a.id === values.accountId)?.currency ?? transaction.currency,
          accountId: values.accountId,
          category: values.category,
          description: values.description?.trim() || null,
          transactionDate: toLocalDateString(values.transactionDate),
          notes: values.notes?.trim() || null,
          paidByUserId: 'paidByUserId' in values ? values.paidByUserId ?? null : null,
        },
        user.id,
      );
      router.back();
    } catch {
      setError('Could not save these changes. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmitTransfer = async (values: TransferTransactionFormValues) => {
    const amountCents = parseAmountInputToCents(values.amountText);
    if (amountCents === null) {
      setError('Enter a valid amount.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await updateTransaction(
        transaction,
        {
          type: 'Transfer',
          amountCents,
          currency: allAccounts.find((a) => a.id === values.accountId)?.currency ?? transaction.currency,
          accountId: values.accountId,
          destinationAccountId: values.destinationAccountId,
          category: null,
          description: null,
          transactionDate: toLocalDateString(values.transactionDate),
          notes: values.notes?.trim() || null,
        },
        user.id,
      );
      router.back();
    } catch {
      setError('Could not save these changes. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen scroll>
      {transaction.type === 'Expense' ? (
        <ExpenseTransactionForm
          accounts={allAccounts}
          members={members}
          initialValues={{
            amountText: centsToAmountInput(transaction.amount_cents),
            category: transaction.category ?? 'Other',
            accountId: transaction.account_id,
            description: transaction.description ?? '',
            transactionDate: fromLocalDateString(transaction.transaction_date),
            notes: transaction.notes ?? '',
            paidByUserId: transaction.paid_by_user_id,
          }}
          submitLabel="Save changes"
          isSubmitting={isSubmitting}
          serverError={error}
          onSubmit={onSubmitExpenseOrIncome}
          onDelete={onDelete}
          isDeleting={isDeleting}
        />
      ) : transaction.type === 'Income' ? (
        <IncomeTransactionForm
          accounts={allAccounts}
          initialValues={{
            amountText: centsToAmountInput(transaction.amount_cents),
            category: (transaction.category as IncomeTransactionFormValues['category'] | null) ?? 'Other',
            accountId: transaction.account_id,
            description: transaction.description ?? '',
            transactionDate: fromLocalDateString(transaction.transaction_date),
            notes: transaction.notes ?? '',
          }}
          submitLabel="Save changes"
          isSubmitting={isSubmitting}
          serverError={error}
          onSubmit={onSubmitExpenseOrIncome}
          onDelete={onDelete}
          isDeleting={isDeleting}
        />
      ) : (
        <TransferTransactionForm
          accounts={allAccounts}
          initialValues={{
            amountText: centsToAmountInput(transaction.amount_cents),
            accountId: transaction.account_id,
            destinationAccountId: transaction.destination_account_id ?? '',
            transactionDate: fromLocalDateString(transaction.transaction_date),
            notes: transaction.notes ?? '',
          }}
          submitLabel="Save changes"
          isSubmitting={isSubmitting}
          serverError={error}
          onSubmit={onSubmitTransfer}
          onDelete={onDelete}
          isDeleting={isDeleting}
        />
      )}
    </Screen>
  );
}
