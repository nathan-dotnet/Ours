import { useRouter } from 'expo-router';
import { useState } from 'react';
import { LoanForm } from '@/components/LoanForm';
import { Screen } from '@/components/Screen';
import { useActiveAccounts } from '@/hooks/useAccounts';
import { useLocalCouple } from '@/hooks/useCouple';
import { useCreateLoan } from '@/hooks/useLoans';
import { useAuthStore } from '@/stores/authStore';
import { toLocalDateString } from '@/utils/date';
import { parseAmountInputToCents } from '@/utils/money';
import type { LoanFormValues } from '@/validation/loan';

export default function NewLoanScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const { data } = useLocalCouple();
  const { data: accounts } = useActiveAccounts(data?.couple.id);
  const createLoan = useCreateLoan();
  const [accountId, setAccountId] = useState('');
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAccounts = accounts ?? [];
  const members = data?.members ?? [];

  const onSubmit = async (values: LoanFormValues) => {
    if (!data?.couple || !user) return;
    const originalAmountCents = parseAmountInputToCents(values.originalAmountText);
    const monthlyPaymentCents = parseAmountInputToCents(values.monthlyPaymentText);
    const feesAmountCents = values.feesAmountText.trim() === '' ? null : parseAmountInputToCents(values.feesAmountText);
    if (originalAmountCents === null || monthlyPaymentCents === null) {
      setError('Enter valid amounts.');
      return;
    }
    if (!accountId) {
      setError('Choose a payment account.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await createLoan(
        data.couple.id,
        {
          name: values.name,
          provider: values.provider.trim() === '' ? null : values.provider.trim(),
          originalAmountCents,
          monthlyPaymentCents,
          totalInstallments: Number(values.totalInstallmentsText),
          firstDueDate: toLocalDateString(values.firstDueDate),
          frequency: 'Monthly',
          feesAmountCents,
          currency: allAccounts.find((a) => a.id === accountId)?.currency ?? 'PHP',
          paymentAccountId: accountId,
          ownerUserId: ownerId,
        },
        user.id,
      );
      router.back();
    } catch {
      setError('Could not save this loan. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen scroll>
      <LoanForm
        initialValues={{
          name: '',
          provider: '',
          originalAmountText: '',
          monthlyPaymentText: '',
          totalInstallmentsText: '',
          firstDueDate: new Date(),
          feesAmountText: '',
        }}
        accounts={allAccounts}
        members={members}
        currentUserId={user?.id}
        paymentAccountId={accountId}
        onPaymentAccountChange={setAccountId}
        ownerUserId={ownerId}
        onOwnerChange={setOwnerId}
        submitLabel="Add loan"
        isSubmitting={isSubmitting}
        serverError={error}
        onSubmit={onSubmit}
      />
    </Screen>
  );
}
