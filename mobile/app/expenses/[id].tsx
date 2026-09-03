import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { ExpenseForm } from '@/components/ExpenseForm';
import { Screen } from '@/components/Screen';
import { useDeleteExpense, useExpense, useUpdateExpense } from '@/hooks/useExpenses';
import { useAuthStore } from '@/stores/authStore';
import { fromLocalDateString, toLocalDateString } from '@/utils/date';
import { centsToAmountInput, parseAmountInputToCents } from '@/utils/money';
import type { ExpenseFormValues } from '@/validation/expense';

export default function EditExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const { data: expense, isLoading } = useExpense(id);
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (values: ExpenseFormValues) => {
    if (!expense || !user) return;
    const amountCents = parseAmountInputToCents(values.amountText);
    if (amountCents === null) {
      setError('Enter a valid amount.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await updateExpense(
        expense,
        {
          amountCents,
          currency: values.currency,
          description: values.description?.trim() || null,
          category: values.category,
          expenseDate: toLocalDateString(values.expenseDate),
          notes: values.notes?.trim() || null,
          paidByUserId: expense.paid_by_user_id,
        },
        user.id,
      );
      router.back();
    } catch {
      setError('Could not save this expense. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const performDelete = async () => {
    if (!expense) return;
    setIsDeleting(true);
    try {
      await deleteExpense(expense);
      router.back();
    } catch {
      setError('Could not delete this expense. Please try again.');
      setIsDeleting(false);
    }
  };

  /** Destructive action — always confirm before a single tap removes the expense. */
  const onDelete = () => {
    Alert.alert('Delete this expense?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: performDelete },
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

  if (!expense) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-2">
          <Text className="text-lg font-semibold text-ink">Expense not found</Text>
          <Text className="text-center text-clay">It may have already been deleted — pull to sync to catch up.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <ExpenseForm
        initialValues={{
          amountText: centsToAmountInput(expense.amount_cents),
          currency: expense.currency,
          category: (expense.category as ExpenseFormValues['category']) ?? 'Other',
          description: expense.description ?? '',
          expenseDate: fromLocalDateString(expense.expense_date),
          notes: expense.notes ?? '',
        }}
        submitLabel="Save changes"
        isSubmitting={isSubmitting}
        serverError={error}
        onSubmit={onSubmit}
        onDelete={onDelete}
        isDeleting={isDeleting}
      />
    </Screen>
  );
}
