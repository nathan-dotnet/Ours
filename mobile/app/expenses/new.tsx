import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ExpenseForm } from '@/components/ExpenseForm';
import { Screen } from '@/components/Screen';
import { useCreateExpense } from '@/hooks/useExpenses';
import { useLocalCouple } from '@/hooks/useCouple';
import { useAuthStore } from '@/stores/authStore';
import { toLocalDateString } from '@/utils/date';
import { parseAmountInputToCents } from '@/utils/money';
import type { ExpenseFormValues } from '@/validation/expense';

const DEFAULT_CURRENCY = 'PHP';

export default function NewExpenseScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const { data } = useLocalCouple();
  const createExpense = useCreateExpense();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (values: ExpenseFormValues) => {
    if (!data?.couple || !user) return;
    const amountCents = parseAmountInputToCents(values.amountText);
    if (amountCents === null) {
      setError('Enter a valid amount.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await createExpense(
        data.couple.id,
        {
          amountCents,
          currency: values.currency,
          description: values.description?.trim() || null,
          category: values.category,
          expenseDate: toLocalDateString(values.expenseDate),
          notes: values.notes?.trim() || null,
        },
        user.id,
      );
      router.back();
    } catch {
      // Local writes don't fail for network reasons (they're pure SQLite) — this is a genuine
      // unexpected error, so keep the form open and show it.
      setError('Could not save this expense. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen scroll>
      <ExpenseForm
        initialValues={{
          amountText: '',
          currency: DEFAULT_CURRENCY,
          category: 'Other',
          description: '',
          expenseDate: new Date(),
          notes: '',
        }}
        submitLabel="Add expense"
        isSubmitting={isSubmitting}
        serverError={error}
        onSubmit={onSubmit}
      />
    </Screen>
  );
}
