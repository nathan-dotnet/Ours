import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { AccountPickerField } from '@/components/AccountPickerField';
import { Button } from '@/components/Button';
import { CategoryPickerField } from '@/components/CategoryPickerField';
import { Screen } from '@/components/Screen';
import { useActiveAccounts } from '@/hooks/useAccounts';
import { useLocalCouple } from '@/hooks/useCouple';
import { useCreateTransaction, useTransactionsForCouple } from '@/hooks/useTransactions';
import { useAuthStore } from '@/stores/authStore';
import { softRaised } from '@/styles/neumorphism';
import { toLocalDateString } from '@/utils/date';
import { calculateAccountBalance } from '@/utils/moneyCalculations';
import { formatMoney, parseAmountInputToCents } from '@/utils/money';
import { getLastUsedExpenseDefaults } from '@/utils/spendLog';
import { EXPENSE_CATEGORIES, QUICK_LOG_CATEGORIES } from '@/validation/transaction';

/**
 * The fast path for an everyday expense — amount + category + account, nothing else (see the
 * Spend Log spec's "record a purchase in 3-5 seconds"). Creates the *exact same* Expense
 * transaction app/transactions/new.tsx's "Detailed Expense" path does, via the same
 * useCreateTransaction/transactionRepository.createLocally call — this is a simplified UI, never
 * a second write path. Category/account default to whichever were used on the most recent
 * expense (see utils/spendLog.ts's getLastUsedExpenseDefaults) — derived from existing history,
 * no new persistence.
 */
export default function QuickLogScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const { data: coupleData } = useLocalCouple();
  const { data: accounts } = useActiveAccounts(coupleData?.couple.id);
  const { data: transactions } = useTransactionsForCouple(coupleData?.couple.id);
  const createTransaction = useCreateTransaction();

  const allAccounts = accounts ?? [];
  const allTransactions = transactions ?? [];

  const [amountText, setAmountText] = useState('');
  const [category, setCategory] = useState('');
  const [accountId, setAccountId] = useState('');
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  useEffect(() => {
    // Accounts/transactions load asynchronously from the local mirror — this can't be a plain
    // useState initializer (it would only ever see the empty first-render data and never update
    // once the real data arrives), so it's a one-time effect instead, same pattern
    // app/loans/[id].tsx's own payment-amount prefill already uses. Only ever runs once real
    // account data exists, and never again after (so it can't stomp on what the user's typed).
    if (defaultsApplied || allAccounts.length === 0) return;

    const lastUsed = getLastUsedExpenseDefaults(allTransactions);
    const initialAccountId = lastUsed?.accountId && allAccounts.some((a) => a.id === lastUsed.accountId) ? lastUsed.accountId : allAccounts[0].id;
    const initialCategory = lastUsed?.category ?? 'Food';
    setAccountId(initialAccountId);
    setCategory(initialCategory);
    setShowAllCategories(!QUICK_LOG_CATEGORIES.includes(initialCategory as (typeof QUICK_LOG_CATEGORIES)[number]));
    setDefaultsApplied(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAccounts.length, allTransactions.length, defaultsApplied]);

  const amountCents = parseAmountInputToCents(amountText);
  const selectedAccount = allAccounts.find((a) => a.id === accountId);
  const accountBalanceCents = selectedAccount ? calculateAccountBalance(selectedAccount.opening_balance_cents, selectedAccount.id, allTransactions) : 0;

  if (allAccounts.length === 0) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3">
          <Text className="text-lg font-semibold text-ink">Add an account first</Text>
          <Text className="text-center text-clay">You need at least one account before logging an expense.</Text>
          <Pressable onPress={() => router.replace('/accounts/new')} className="rounded-full bg-rose px-5 py-3" style={softRaised}>
            <Text className="font-semibold text-cream">Add Account</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const onSubmit = async () => {
    if (!coupleData?.couple || !user) return;
    if (amountCents === null || amountCents <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (!category.trim()) {
      setError('Choose a category.');
      return;
    }
    if (!accountId) {
      setError('Choose an account.');
      return;
    }
    if (amountCents > accountBalanceCents) {
      setError(`Insufficient balance. Available: ${formatMoney(accountBalanceCents, selectedAccount?.currency ?? 'PHP')}.`);
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await createTransaction(
        coupleData.couple.id,
        {
          type: 'Expense',
          amountCents,
          currency: selectedAccount?.currency ?? 'PHP',
          accountId,
          category: category.trim(),
          description: null,
          transactionDate: toLocalDateString(new Date()),
          notes: null,
          paidByUserId: user.id,
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

  return (
    <Screen scroll>
      <View className="items-center gap-1 py-4">
        <Text className="text-sm font-semibold uppercase tracking-wider text-clay">Amount</Text>
        <View className="w-full flex-row items-baseline justify-center gap-1 rounded-2xl bg-blush px-4 py-6" style={softRaised}>
          <Text className="text-3xl font-bold text-ink">₱</Text>
          {/* A plain RN TextInput, not the labeled TextField — Quick Log's whole point is one huge, unmissable input, not a form field. */}
          <QuickAmountInput value={amountText} onChangeText={setAmountText} />
        </View>
      </View>

      <View className="gap-3 pt-2">
        <Text className="text-xs font-semibold uppercase tracking-wider text-clay">Category</Text>
        {!showAllCategories ? (
          <View className="flex-row flex-wrap gap-2">
            {QUICK_LOG_CATEGORIES.map((option) => (
              <Pressable
                key={option}
                onPress={() => setCategory(option)}
                className={`rounded-full px-4 py-2.5 ${option === category ? 'bg-rose' : 'bg-blush'}`}
              >
                <Text className={`text-sm font-medium ${option === category ? 'text-cream' : 'text-clay'}`}>{option}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setShowAllCategories(true)} className="rounded-full bg-blush px-4 py-2.5">
              <Text className="text-sm font-medium text-clay">More…</Text>
            </Pressable>
          </View>
        ) : (
          <CategoryPickerField label="" presets={EXPENSE_CATEGORIES} value={category} onChange={setCategory} />
        )}
      </View>

      <View className="gap-3 pt-4">
        <Text className="text-xs font-semibold uppercase tracking-wider text-clay">Account</Text>
        <AccountPickerField label="" accounts={allAccounts} value={accountId} onChange={setAccountId} />
        {selectedAccount ? (
          <Text className="text-xs text-clay">{selectedAccount.name}: {formatMoney(accountBalanceCents, selectedAccount.currency)} available</Text>
        ) : null}
      </View>

      {error ? <Text className="pt-3 text-sm text-rose">{error}</Text> : null}

      <View className="pt-6">
        <Button label="Log Expense" onPress={onSubmit} loading={isSubmitting} />
      </View>
    </Screen>
  );
}

/**
 * A bare numeric input, deliberately not wrapped in TextField's label+error chrome — Quick Log
 * wants one oversized, unmissable amount field, not a labeled form row. Still the same
 * `decimal-pad` keyboard and the same parseAmountInputToCents parsing every other money input in
 * this app uses.
 */
function QuickAmountInput({ value, onChangeText }: { value: string; onChangeText: (text: string) => void }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      keyboardType="decimal-pad"
      placeholder="0.00"
      placeholderTextColor="#B9A9A0"
      autoFocus
      className="min-w-[80px] flex-1 text-4xl font-bold text-ink"
      style={{ paddingVertical: 0 }}
    />
  );
}
