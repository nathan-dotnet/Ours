import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ExpenseTransactionForm, IncomeTransactionForm, TransferTransactionForm } from '@/components/TransactionForms';
import { Screen } from '@/components/Screen';
import { useActiveAccounts } from '@/hooks/useAccounts';
import { useLocalCouple } from '@/hooks/useCouple';
import { useCreateTransaction } from '@/hooks/useTransactions';
import { useAuthStore } from '@/stores/authStore';
import { toLocalDateString } from '@/utils/date';
import { parseAmountInputToCents } from '@/utils/money';
import type { ExpenseTransactionFormValues, IncomeTransactionFormValues, TransferTransactionFormValues } from '@/validation/transaction';

type Kind = 'Expense' | 'Income' | 'Transfer';

const KIND_OPTIONS: { kind: Kind; emoji: string; label: string }[] = [
  { kind: 'Expense', emoji: '💸', label: 'Expense' },
  { kind: 'Income', emoji: '💰', label: 'Income' },
  { kind: 'Transfer', emoji: '🔄', label: 'Transfer' },
];

const VALID_KINDS: readonly string[] = ['Expense', 'Income', 'Transfer'];

export default function NewTransactionScreen() {
  const router = useRouter();
  // Contextual actions (Money dashboard's "+ Add Expense", an account's "Transfer Money"/"Add
  // Income") deep-link straight past the kind picker and preselect the account they were
  // launched from — see accounts/[id].tsx and (tabs)/money.tsx.
  const params = useLocalSearchParams<{ type?: string; accountId?: string }>();
  const presetKind = VALID_KINDS.includes(params.type ?? '') ? (params.type as Kind) : null;
  const user = useAuthStore((s) => s.session?.user);
  const { data: coupleData } = useLocalCouple();
  const { data: accounts } = useActiveAccounts(coupleData?.couple.id);
  const createTransaction = useCreateTransaction();
  const [kind, setKind] = useState<Kind | null>(presetKind);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAccounts = accounts ?? [];
  const members = coupleData?.members ?? [];
  const presetAccountId = params.accountId && allAccounts.some((a) => a.id === params.accountId) ? params.accountId : allAccounts[0]?.id;

  if (allAccounts.length === 0) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3">
          <Text className="text-lg font-semibold text-ink">Add an account first</Text>
          <Text className="text-center text-clay">You need at least one account before recording a transaction.</Text>
          <Pressable onPress={() => router.replace('/accounts/new')} className="rounded-full bg-rose px-5 py-3">
            <Text className="font-semibold text-cream">Add Account</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (kind === null) {
    return (
      <Screen>
        <View className="gap-3 pt-4">
          {KIND_OPTIONS.map((option) => (
            <Pressable key={option.kind} onPress={() => setKind(option.kind)} className="flex-row items-center gap-3 rounded-2xl bg-blush p-5">
              <Text className="text-2xl">{option.emoji}</Text>
              <Text className="text-lg font-semibold text-ink">{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </Screen>
    );
  }

  const onSubmitExpenseOrIncome = async (values: ExpenseTransactionFormValues | IncomeTransactionFormValues, type: 'Expense' | 'Income') => {
    if (!coupleData?.couple || !user) return;
    const amountCents = parseAmountInputToCents(values.amountText);
    if (amountCents === null) {
      setError('Enter a valid amount.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await createTransaction(
        coupleData.couple.id,
        {
          type,
          amountCents,
          currency: allAccounts.find((a) => a.id === values.accountId)?.currency ?? 'PHP',
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
      setError('Could not save this transaction. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmitTransfer = async (values: TransferTransactionFormValues) => {
    if (!coupleData?.couple || !user) return;
    const amountCents = parseAmountInputToCents(values.amountText);
    if (amountCents === null) {
      setError('Enter a valid amount.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await createTransaction(
        coupleData.couple.id,
        {
          type: 'Transfer',
          amountCents,
          currency: allAccounts.find((a) => a.id === values.accountId)?.currency ?? 'PHP',
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
      setError('Could not save this transfer. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const today = new Date();

  return (
    <Screen scroll>
      {kind === 'Expense' ? (
        <ExpenseTransactionForm
          accounts={allAccounts}
          members={members}
          initialValues={{ amountText: '', category: 'Other', accountId: presetAccountId!, description: '', transactionDate: today, notes: '', paidByUserId: null }}
          submitLabel="Add expense"
          isSubmitting={isSubmitting}
          serverError={error}
          onSubmit={(values) => onSubmitExpenseOrIncome(values, 'Expense')}
        />
      ) : kind === 'Income' ? (
        <IncomeTransactionForm
          accounts={allAccounts}
          initialValues={{ amountText: '', category: 'Other', accountId: presetAccountId!, description: '', transactionDate: today, notes: '' }}
          submitLabel="Add income"
          isSubmitting={isSubmitting}
          serverError={error}
          onSubmit={(values) => onSubmitExpenseOrIncome(values, 'Income')}
        />
      ) : (
        <TransferTransactionForm
          accounts={allAccounts}
          initialValues={{
            amountText: '',
            accountId: presetAccountId!,
            destinationAccountId: allAccounts.find((a) => a.id !== presetAccountId)?.id ?? '',
            transactionDate: today,
            notes: '',
          }}
          submitLabel="Add transfer"
          isSubmitting={isSubmitting}
          serverError={error}
          onSubmit={onSubmitTransfer}
        />
      )}
    </Screen>
  );
}
