import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { BudgetForm } from '@/components/BudgetForm';
import { Screen } from '@/components/Screen';
import { useBudget, useDeleteBudget, useUpdateBudget } from '@/hooks/useBudgets';
import { useAuthStore } from '@/stores/authStore';
import { centsToAmountInput, parseAmountInputToCents } from '@/utils/money';
import type { BudgetFormValues } from '@/validation/budget';

export default function EditBudgetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const { data: budget, isLoading } = useBudget(id);
  const updateBudget = useUpdateBudget();
  const deleteBudget = useDeleteBudget();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (values: BudgetFormValues) => {
    if (!budget || !user) return;
    const amountCents = parseAmountInputToCents(values.amountText);
    if (amountCents === null) {
      setError('Enter a valid amount.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await updateBudget(budget, { category: budget.category, year: budget.year, month: budget.month, amountCents, currency: budget.currency }, user.id);
      router.back();
    } catch {
      setError('Could not save these changes. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const performDelete = async () => {
    if (!budget) return;
    setIsDeleting(true);
    try {
      await deleteBudget(budget);
      router.back();
    } catch {
      setError('Could not delete this budget. Please try again.');
      setIsDeleting(false);
    }
  };

  const onDelete = () => {
    Alert.alert('Delete this budget?', undefined, [
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

  if (!budget) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-2">
          <Text className="text-lg font-semibold text-ink">Budget not found</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <BudgetForm
        initialValues={{ category: budget.category, amountText: centsToAmountInput(budget.amount_cents) }}
        categoryLocked
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
