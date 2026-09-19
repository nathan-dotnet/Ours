import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { AccountPickerField } from '@/components/AccountPickerField';
import { Button } from '@/components/Button';
import { LoanForm } from '@/components/LoanForm';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useActiveAccounts } from '@/hooks/useAccounts';
import { useLocalCouple } from '@/hooks/useCouple';
import { useDeleteLoan, useLoan, usePayLoan, useUpdateLoan } from '@/hooks/useLoans';
import { useTransactionsForCouple } from '@/hooks/useTransactions';
import { useAuthStore } from '@/stores/authStore';
import { softRaised } from '@/styles/neumorphism';
import { fromLocalDateString, toLocalDateString } from '@/utils/date';
import { getLoanDueStatus, getLoanProgress, getNextUnpaidInstallment } from '@/utils/loanSchedule';
import { calculateAccountBalance, calculateLoanPaidAmount, calculateLoanRemainingBalance } from '@/utils/moneyCalculations';
import { centsToAmountInput, formatMoney, parseAmountInputToCents } from '@/utils/money';
import { generateUuid } from '@/utils/uuid';
import type { LoanFormValues } from '@/validation/loan';

const shortDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/**
 * A loan's remaining balance/progress/status are never stored — they're derived from its
 * generated schedule (see utils/loanSchedule.ts) plus every LoanPayment transaction linked to it,
 * same "derive, don't store" reasoning as a savings goal's progress.
 */
export default function LoanDetailScreen() {
  const { id, pay } = useLocalSearchParams<{ id: string; pay?: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const { data: coupleData } = useLocalCouple();
  const { data: loan, isLoading } = useLoan(id);
  const { data: accounts } = useActiveAccounts(coupleData?.couple.id);
  const { data: transactions } = useTransactionsForCouple(coupleData?.couple.id);
  const updateLoan = useUpdateLoan();
  const deleteLoan = useDeleteLoan();
  const payLoan = usePayLoan();

  const [isEditing, setIsEditing] = useState(false);
  const [formAccountId, setFormAccountId] = useState('');
  const [formOwnerId, setFormOwnerId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isPaying, setIsPaying] = useState(pay === '1');
  const [payAmountText, setPayAmountText] = useState('');
  const [payAccountId, setPayAccountId] = useState('');
  const [payError, setPayError] = useState<string | null>(null);
  const [isPaySubmitting, setIsPaySubmitting] = useState(false);

  const allAccounts = accounts ?? [];
  const allTransactions = transactions ?? [];
  const members = coupleData?.members ?? [];

  const progress = loan ? getLoanProgress(loan, allTransactions) : [];
  const next = getNextUnpaidInstallment(progress);

  useEffect(() => {
    if (loan && payAmountText === '') {
      // Defaults to what's actually left of the *next* installment — which may be less than the
      // full monthly payment if it was already partially paid (see the Loans spec's partial
      // payment requirement) — never a flat monthly-payment default.
      setPayAmountText(centsToAmountInput(next?.remainingCents ?? loan.monthly_payment_cents));
      setPayAccountId(loan.payment_account_id);
    }
    // Only prefill once, when the loan first loads — never overwrite what the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loan?.id]);

  if (isLoading) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#5B7FBE" />
        </View>
      </Screen>
    );
  }

  if (!loan) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-2">
          <Text className="text-lg font-semibold text-ink">Loan not found</Text>
        </View>
      </Screen>
    );
  }

  const paidAmountCents = calculateLoanPaidAmount(loan.id, allTransactions);
  const remainingCents = calculateLoanRemainingBalance(loan.original_amount_cents, paidAmountCents);
  const installmentsPaid = progress.filter((p) => p.isFullyPaid).length;
  const remainingInstallments = Math.max(0, loan.total_installments - installmentsPaid);
  const percentPaid = loan.original_amount_cents > 0 ? Math.min(paidAmountCents / loan.original_amount_cents, 1) : 0;
  const dueStatus = getLoanDueStatus(progress, new Date());
  const isPaidOff = dueStatus === 'paid-off';
  const paymentAccount = allAccounts.find((a) => a.id === loan.payment_account_id);
  const ownerLabel = loan.owner_user_id === null ? 'Joint' : loan.owner_user_id === user?.id ? 'You' : members.find((m) => m.user_id === loan.owner_user_id)?.display_name ?? 'Partner';

  const history = allTransactions.filter((t) => t.loan_id === loan.id).sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1));

  const startEditing = () => {
    setFormAccountId(loan.payment_account_id);
    setFormOwnerId(loan.owner_user_id);
    setError(null);
    setIsEditing(true);
  };

  const onSubmit = async (values: LoanFormValues) => {
    if (!user) return;
    const originalAmountCents = parseAmountInputToCents(values.originalAmountText);
    const monthlyPaymentCents = parseAmountInputToCents(values.monthlyPaymentText);
    const feesAmountCents = values.feesAmountText.trim() === '' ? null : parseAmountInputToCents(values.feesAmountText);
    if (originalAmountCents === null || monthlyPaymentCents === null) {
      setError('Enter valid amounts.');
      return;
    }
    if (!formAccountId) {
      setError('Choose a payment account.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await updateLoan(
        loan,
        {
          name: values.name,
          provider: values.provider.trim() === '' ? null : values.provider.trim(),
          originalAmountCents,
          monthlyPaymentCents,
          totalInstallments: Number(values.totalInstallmentsText),
          firstDueDate: toLocalDateString(values.firstDueDate),
          frequency: loan.frequency,
          feesAmountCents,
          currency: loan.currency,
          paymentAccountId: formAccountId,
          ownerUserId: formOwnerId,
        },
        user.id,
      );
      setIsEditing(false);
    } catch {
      setError('Could not save these changes. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const performDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteLoan(loan);
      router.back();
    } catch {
      setError('Could not delete this loan. Please try again.');
      setIsDeleting(false);
    }
  };

  const onDelete = () => {
    Alert.alert('Delete this loan?', 'Its past payments stay in your transaction history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: performDelete },
    ]);
  };

  const performPay = async (amountCents: number) => {
    if (!user || !coupleData?.couple) return;
    setIsPaySubmitting(true);
    setPayError(null);
    try {
      await payLoan(
        coupleData.couple.id,
        loan,
        { paymentId: generateUuid(), amount: amountCents / 100, accountId: payAccountId },
        user.id,
      );
      setIsPaying(false);
      Alert.alert('Payment recorded 💰', `${formatMoney(amountCents, loan.currency)} was paid toward ${loan.name}.`);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Could not record this payment. Please try again.');
    } finally {
      setIsPaySubmitting(false);
    }
  };

  const onPressPay = () => {
    const amountCents = parseAmountInputToCents(payAmountText);
    if (amountCents === null || amountCents <= 0) {
      setPayError('Enter a valid amount.');
      return;
    }
    if (amountCents > remainingCents) {
      setPayError(`Payment cannot exceed the remaining balance of ${formatMoney(remainingCents, loan.currency)}.`);
      return;
    }
    if (!payAccountId) {
      setPayError('Choose an account.');
      return;
    }
    const account = allAccounts.find((a) => a.id === payAccountId);
    if (!account) {
      setPayError('Choose an account.');
      return;
    }
    const accountBalanceCents = calculateAccountBalance(account.opening_balance_cents, account.id, allTransactions);
    if (amountCents > accountBalanceCents) {
      setPayError(`Insufficient balance. Available: ${formatMoney(accountBalanceCents, account.currency)}, required: ${formatMoney(amountCents, account.currency)}.`);
      return;
    }
    setPayError(null);

    Alert.alert(
      `Pay ${loan.name}`,
      `Amount\n${formatMoney(amountCents, loan.currency)}\n\n` +
        `From account\n${account.name}\nAccount balance: ${formatMoney(accountBalanceCents, account.currency)}\nAfter payment: ${formatMoney(accountBalanceCents - amountCents, account.currency)}\n\n` +
        `Loan remaining\n${formatMoney(remainingCents, loan.currency)} → ${formatMoney(remainingCents - amountCents, loan.currency)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm Payment', onPress: () => performPay(amountCents) },
      ],
    );
  };

  if (isEditing) {
    return (
      <Screen scroll>
        <LoanForm
          initialValues={{
            name: loan.name,
            provider: loan.provider ?? '',
            originalAmountText: centsToAmountInput(loan.original_amount_cents),
            monthlyPaymentText: centsToAmountInput(loan.monthly_payment_cents),
            totalInstallmentsText: String(loan.total_installments),
            firstDueDate: fromLocalDateString(loan.first_due_date),
            feesAmountText: loan.fees_amount_cents != null ? centsToAmountInput(loan.fees_amount_cents) : '',
          }}
          accounts={allAccounts}
          members={members}
          currentUserId={user?.id}
          paymentAccountId={formAccountId}
          onPaymentAccountChange={setFormAccountId}
          ownerUserId={formOwnerId}
          onOwnerChange={setFormOwnerId}
          submitLabel="Save changes"
          isSubmitting={isSubmitting}
          serverError={error}
          onSubmit={onSubmit}
        />
      </Screen>
    );
  }

  if (isPaying) {
    return (
      <Screen scroll>
        <View className="gap-4 pt-2">
          <Text className="text-lg font-semibold text-ink">Pay {loan.name}</Text>
          <Text className="text-sm text-clay">Remaining: {formatMoney(remainingCents, loan.currency)}</Text>
          {next ? (
            <Text className="text-sm text-clay">
              Next payment: {formatMoney(next.remainingCents, loan.currency)}, due {shortDateFormatter.format(fromLocalDateString(next.dueDate))}
            </Text>
          ) : null}
          <TextField label="Amount" value={payAmountText} onChangeText={setPayAmountText} keyboardType="decimal-pad" placeholder="0.00" />
          <AccountPickerField label="From account" accounts={allAccounts} value={payAccountId} onChange={setPayAccountId} />
          {payError ? <Text className="text-sm text-rose">{payError}</Text> : null}
          <Button label={`Pay ${payAmountText ? formatMoney(parseAmountInputToCents(payAmountText) ?? 0, loan.currency) : ''}`} onPress={onPressPay} loading={isPaySubmitting} />
          <Button label="Cancel" variant="secondary" onPress={() => setIsPaying(false)} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View className="items-center gap-2 py-4">
        <Text className="text-2xl font-semibold text-ink">{loan.name}</Text>
        {loan.provider ? <Text className="text-sm text-clay">{loan.provider}</Text> : null}
        <Text className="text-3xl font-semibold text-ink">{formatMoney(remainingCents, loan.currency)}</Text>
        <Text className="text-sm text-clay">remaining of {formatMoney(loan.original_amount_cents, loan.currency)}</Text>

        <View className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-ink/10">
          <View className="h-full rounded-full bg-rose" style={{ width: `${Math.round(percentPaid * 100)}%` }} />
        </View>
        <Text className="text-xs text-clay">{Math.round(percentPaid * 100)}% paid</Text>

        <Text className="text-xs text-clay">
          {installmentsPaid} / {loan.total_installments} paid
        </Text>
        {!isPaidOff && next ? (
          <Text className="text-xs text-clay">
            Next: {formatMoney(next.remainingCents, loan.currency)} due {shortDateFormatter.format(fromLocalDateString(next.dueDate))}
          </Text>
        ) : null}
        {loan.fees_amount_cents ? <Text className="text-xs text-clay">Fees/interest: {formatMoney(loan.fees_amount_cents, loan.currency)}</Text> : null}
        <Text className="text-xs text-clay">
          {paymentAccount?.name ?? '—'} · {ownerLabel}
        </Text>
      </View>

      <View className="gap-3 pb-4">
        {!isPaidOff ? (
          <View className="flex-row gap-3">
            <Button label="Pay" onPress={() => setIsPaying(true)} />
            <Button label="Edit" variant="secondary" onPress={startEditing} />
          </View>
        ) : (
          <Button label="Edit" variant="secondary" onPress={startEditing} />
        )}
        <Button label="Delete Loan" variant="secondary" onPress={onDelete} loading={isDeleting} />
      </View>

      {error ? <Text className="text-sm text-rose">{error}</Text> : null}

      <Text className="pb-2 text-sm font-semibold text-clay">Payment Schedule</Text>
      <View className="mb-4 gap-2">
        {progress.map((p) => (
          <View key={p.installmentNumber} className="flex-row items-center justify-between rounded-2xl bg-blush p-4" style={softRaised}>
            <Text className="text-sm text-ink">
              {p.isFullyPaid ? '✓' : '○'} {shortDateFormatter.format(fromLocalDateString(p.dueDate))}
            </Text>
            <Text className="text-sm font-semibold text-ink">{formatMoney(p.scheduledAmountCents, loan.currency)}</Text>
            <Text className={`text-xs ${p.isFullyPaid ? 'text-clay' : p.paidTowardCents > 0 ? 'text-rose' : 'text-clay'}`}>
              {p.isFullyPaid ? 'Paid' : p.paidTowardCents > 0 ? `${formatMoney(p.paidTowardCents, loan.currency)} / ${formatMoney(p.scheduledAmountCents, loan.currency)}` : 'Upcoming'}
            </Text>
          </View>
        ))}
      </View>

      <Text className="pb-2 text-sm font-semibold text-clay">Payment History</Text>
      {history.length === 0 ? (
        <Text className="text-clay">No payments recorded yet.</Text>
      ) : (
        <View className="gap-2">
          {history.map((t) => (
            <View key={t.id} className="flex-row items-center justify-between rounded-2xl bg-blush p-4" style={softRaised}>
              <Text className="text-sm text-ink">{t.transaction_date}</Text>
              <Text className="text-base font-semibold text-ink">{formatMoney(t.amount_cents, t.currency)}</Text>
              <Text className="text-sm text-clay">{allAccounts.find((a) => a.id === t.account_id)?.name ?? '—'}</Text>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
