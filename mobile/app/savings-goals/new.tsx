import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Screen } from '@/components/Screen';
import { SavingsGoalForm } from '@/components/SavingsGoalForm';
import { useCreateSavingsGoal } from '@/hooks/useSavingsGoals';
import { useLocalCouple } from '@/hooks/useCouple';
import { useAuthStore } from '@/stores/authStore';
import { parseAmountInputToCents } from '@/utils/money';
import { parsePercentInput } from '@/utils/allocationCalculations';
import type { SavingsGoalFormValues } from '@/validation/savingsGoal';

export default function NewSavingsGoalScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const { data } = useLocalCouple();
  const createSavingsGoal = useCreateSavingsGoal();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (values: SavingsGoalFormValues) => {
    if (!data?.couple || !user) return;
    const targetAmountCents = parseAmountInputToCents(values.targetAmountText);
    if (targetAmountCents === null) {
      setError('Enter a valid target amount.');
      return;
    }
    const allocationPercent = values.allocationPercentText.trim() === '' ? null : parsePercentInput(values.allocationPercentText);
    setError(null);
    setIsSubmitting(true);
    try {
      await createSavingsGoal(
        data.couple.id,
        { name: values.name, targetAmountCents, currency: 'PHP', allocationPercent, isActive: true },
        user.id,
      );
      router.back();
    } catch {
      setError('Could not save this goal. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen scroll>
      <SavingsGoalForm
        initialValues={{ name: '', targetAmountText: '', allocationPercentText: '' }}
        submitLabel="Add goal"
        isSubmitting={isSubmitting}
        serverError={error}
        onSubmit={onSubmit}
      />
    </Screen>
  );
}
