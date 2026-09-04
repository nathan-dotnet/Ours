import { useRouter } from 'expo-router';
import { useState } from 'react';
import { BudgetForm } from '@/components/BudgetForm';
import { Screen } from '@/components/Screen';
import { useCreateBudget } from '@/hooks/useBudgets';
import { useLocalCouple } from '@/hooks/useCouple';
import { useAuthStore } from '@/stores/authStore';
import { parseAmountInputToCents } from '@/utils/money';
import type { BudgetFormValues } from '@/validation/budget';

export default function NewBudgetScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const { data } = useLocalCouple();
  const createBudget = useCreateBudget();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();

  const onSubmit = async (values: BudgetFormValues) => {
    if (!data?.couple || !user) return;
    const amountCents = parseAmountInputToCents(values.amountText);
    if (amountCents === null) {
      setError('Enter a valid amount.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await createBudget(
        data.couple.id,
        { category: values.category, year: now.getFullYear(), month: now.getMonth() + 1, amountCents, currency: 'PHP' },
        user.id,
      );
      router.back();
    } catch {
      // A duplicate-for-this-slot rejection surfaces later via sync, not here (local writes never
      // fail for that reason) — this catch is for genuine unexpected local errors.
      setError('Could not save this budget. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen scroll>
      <BudgetForm
        initialValues={{ category: 'Food', amountText: '' }}
        categoryLocked={false}
        submitLabel="Add budget"
        isSubmitting={isSubmitting}
        serverError={error}
        onSubmit={onSubmit}
      />
    </Screen>
  );
}
