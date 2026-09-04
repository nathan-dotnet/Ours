import { useRouter } from 'expo-router';
import { useState } from 'react';
import { AccountForm } from '@/components/AccountForm';
import { Screen } from '@/components/Screen';
import { useCreateAccount } from '@/hooks/useAccounts';
import { useLocalCouple } from '@/hooks/useCouple';
import { useAuthStore } from '@/stores/authStore';
import { parseAmountInputToCents } from '@/utils/money';
import type { AccountFormValues } from '@/validation/account';

export default function NewAccountScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const { data } = useLocalCouple();
  const createAccount = useCreateAccount();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (values: AccountFormValues) => {
    if (!data?.couple || !user) return;
    const openingBalanceCents = values.openingBalanceText === '' ? 0 : parseAmountInputToCents(values.openingBalanceText);
    if (openingBalanceCents === null) {
      setError('Enter a valid starting balance.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await createAccount(
        data.couple.id,
        { name: values.name, type: values.type, icon: values.icon, currency: values.currency, isActive: true },
        openingBalanceCents,
        user.id,
      );
      router.back();
    } catch {
      // Local writes don't fail for network reasons (they're pure SQLite) — a genuine unexpected error.
      setError('Could not save this account. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen scroll>
      <AccountForm
        initialValues={{ name: '', type: 'Bank', icon: 'generic', openingBalanceText: '', currency: 'PHP', isActive: true }}
        openingBalanceLocked={false}
        submitLabel="Add account"
        isSubmitting={isSubmitting}
        serverError={error}
        onSubmit={onSubmit}
      />
    </Screen>
  );
}
