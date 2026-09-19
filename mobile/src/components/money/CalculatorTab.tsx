import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { AccountPickerField } from '../AccountPickerField';
import { AllocationBar } from '../AllocationBar';
import { Button } from '../Button';
import { Card } from '../Card';
import { MoneySectionHeader } from '../MoneySectionHeader';
import { MoneyStat } from '../MoneyStat';
import { StatusBadge } from '../StatusBadge';
import { TextField } from '../TextField';
import type { Account, Couple, CoupleMember, Loan, SavingsGoal, Transaction } from '../../types/entities';
import type { MemberWantsAllocationEdit } from '../../repositories/coupleRepository';
import { useUpdateCoupleProfile } from '../../hooks/useCouple';
import { useDistributeMoney, useDistributionStatus } from '../../hooks/useDistribution';
import { useUpdateSavingsGoal } from '../../hooks/useSavingsGoals';
import { useAuthStore } from '../../stores/authStore';
import {
  calculateCombinedIncomeCents,
  parsePercentInput,
  reexpressAsPercentOf,
  splitExactly,
  splitProportionally,
  sumsToExactly100,
  sumsToExactlyPercent,
} from '../../utils/allocationCalculations';
import { getLoanProgress, getNextUnpaidInstallment } from '../../utils/loanSchedule';
import { centsToAmountInput, formatMoney, parseAmountInputToCents } from '../../utils/money';
import type { DistributeMoneyRequestDto, SavingsGoalAllocationInputDto, WantsAllocationInputDto } from '../../types/api';

const BUCKET_COLORS = { budget: '#5B7FBE', savings: '#3FA66B', wants: '#E0A44C' };

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface CalculatorTabProps {
  couple: Couple;
  members: CoupleMember[];
  accounts: Account[];
  goals: SavingsGoal[];
  loans: Loan[];
  transactions: Transaction[];
}

/**
 * "Combined income → choose our plan → let the app do the math." One scrollable form rather than
 * a paginated wizard (see the Money Calculator spec's "don't overcomplicate") — the sections
 * below correspond 1:1 to the spec's STEP 1-6, just all visible at once. Every peso amount shown
 * is computed here for *preview* purposes only; DistributionService re-derives and validates all
 * of it server-side before anything is actually recorded (see useDistribution.ts).
 *
 * Ours never talks to a real bank — the account pickers below choose which of *this app's*
 * tracked accounts each bucket's share is credited to. Distributing genuinely moves the ledger:
 * each account's balance updates for real (see DistributionService's doc comment), while the
 * couple still does the actual real-world transfer between their real banks/e-wallets themselves.
 *
 * Wants has no single pooled account of its own (unlike Budget/Savings) — it's split between the
 * couple's members instead, each with their own percent-of-income share and their own destination
 * account (e.g. "Mine 12% → GCash, Hers 8% → Maya" of a 20% Wants bucket). Every member's share is
 * expressed on the same 0-100 "percent of combined income" scale as Budget/Savings/Wants, so
 * Mine%+Hers% must sum to exactly the Wants percent above — see the "Split Wants between you"
 * section below.
 *
 * Visually: Combined Income leads as the dominant figure (see MoneyStat), every grouped section
 * sits on a bordered Card instead of a shadowed block, and the 100%-allocated checks below use a
 * small StatusBadge instead of plain colored text — none of that changes what's being validated.
 */
export function CalculatorTab({ couple, members, accounts, goals, loans, transactions }: CalculatorTabProps) {
  const user = useAuthStore((s) => s.session?.user);
  const me = members.find((m) => m.user_id === user?.id);
  const partner = members.find((m) => m.user_id !== user?.id);

  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const currency = accounts[0]?.currency ?? 'PHP';

  const [yourIncomeText, setYourIncomeText] = useState(
    me?.monthly_income_cents != null ? centsToAmountInput(me.monthly_income_cents) : '',
  );
  const [budgetPercentText, setBudgetPercentText] = useState(couple.budget_allocation_percent != null ? String(couple.budget_allocation_percent) : '');
  const [savingsPercentText, setSavingsPercentText] = useState(couple.savings_allocation_percent != null ? String(couple.savings_allocation_percent) : '');
  const [wantsPercentText, setWantsPercentText] = useState(couple.wants_allocation_percent != null ? String(couple.wants_allocation_percent) : '');
  const [budgetAccountId, setBudgetAccountId] = useState(couple.budget_account_id ?? '');
  const [savingsAccountId, setSavingsAccountId] = useState(couple.savings_account_id ?? '');

  // Each member's own share of the Wants bucket — "Mine %"/partner's % — plus their own
  // destination account. Keyed by user_id so it stays correct regardless of member order.
  const [memberWantsPercentTexts, setMemberWantsPercentTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(members.map((m) => [m.user_id, m.wants_allocation_percent != null ? String(m.wants_allocation_percent) : ''])),
  );
  const [memberWantsAccountIds, setMemberWantsAccountIds] = useState<Record<string, string>>(() =>
    Object.fromEntries(members.map((m) => [m.user_id, m.wants_account_id ?? ''])),
  );

  const [splitMode, setSplitMode] = useState<'percent' | 'amount'>('percent');
  const [goalInputTexts, setGoalInputTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(goals.map((g) => [g.id, g.allocation_percent != null ? String(g.allocation_percent) : ''])),
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isDistributing, setIsDistributing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateCoupleProfile = useUpdateCoupleProfile();
  const updateSavingsGoal = useUpdateSavingsGoal();
  const distributeMoney = useDistributeMoney();
  const { data: status } = useDistributionStatus(couple.id, year, month);

  const yourIncomeCents = parseAmountInputToCents(yourIncomeText) ?? 0;
  const partnerIncomeCents = partner?.monthly_income_cents ?? 0;
  const combinedIncomeCents = calculateCombinedIncomeCents(yourIncomeCents, partnerIncomeCents);

  const budgetPercent = parsePercentInput(budgetPercentText);
  const savingsPercent = parsePercentInput(savingsPercentText);
  const wantsPercent = parsePercentInput(wantsPercentText);
  const allBucketPercentsEntered = budgetPercent !== null && savingsPercent !== null && wantsPercent !== null;
  const bucketPercentsSumTo100 = sumsToExactly100([budgetPercent, savingsPercent, wantsPercent]);
  const bucketAmounts = allBucketPercentsEntered && bucketPercentsSumTo100 ? splitExactly(combinedIncomeCents, [budgetPercent!, savingsPercent!, wantsPercent!]) : null;
  const savingsAmountCents = bucketAmounts?.[1] ?? 0;
  const wantsAmountCents = bucketAmounts?.[2] ?? 0;

  // Existing loan obligations, shown for awareness only — never subtracted from or added into
  // the allocation above (see this section's own doc comment in the JSX below).
  const upcomingLoanPaymentsCents = loans.reduce((sum, loan) => {
    const next = getNextUnpaidInstallment(getLoanProgress(loan, transactions));
    return sum + (next?.remainingCents ?? 0);
  }, 0);

  /** The goal's share for *this* distribution, in percent, regardless of which unit the field is currently showing. */
  function effectiveGoalPercent(goalId: string): number | null {
    const text = goalInputTexts[goalId] ?? '';
    if (text.trim() === '') return null;
    if (splitMode === 'percent') return parsePercentInput(text);
    const cents = parseAmountInputToCents(text);
    if (cents === null || savingsAmountCents <= 0) return null;
    return Math.round((cents / savingsAmountCents) * 10000) / 100;
  }

  const includedGoals = goals.filter((g) => (goalInputTexts[g.id] ?? '').trim() !== '');
  const goalPercents = includedGoals.map((g) => effectiveGoalPercent(g.id));
  const goalsSumTo100 = includedGoals.length > 0 && sumsToExactly100(goalPercents);

  // Every member currently on the couple must have their own share (of income, same scale as
  // Budget/Savings/Wants above) and their own destination account — Wants is never pooled, so
  // there's no single account this could otherwise fall back to.
  const memberWantsPercents = members.map((m) => parsePercentInput(memberWantsPercentTexts[m.user_id] ?? ''));
  const wantsSplitSumsToTotal = wantsPercent !== null && sumsToExactlyPercent(memberWantsPercents, wantsPercent);
  const everyMemberHasWantsAccount = members.length > 0 && members.every((m) => Boolean(memberWantsAccountIds[m.user_id]));
  const memberWantsAmounts =
    wantsSplitSumsToTotal && wantsPercent! > 0
      ? splitProportionally(wantsAmountCents, memberWantsPercents as number[], wantsPercent!)
      : wantsSplitSumsToTotal
        ? members.map(() => 0)
        : null;

  const canDistribute =
    combinedIncomeCents > 0 &&
    allBucketPercentsEntered &&
    bucketPercentsSumTo100 &&
    Boolean(budgetAccountId) &&
    Boolean(savingsAccountId) &&
    goalsSumTo100 &&
    wantsSplitSumsToTotal &&
    everyMemberHasWantsAccount;

  function toggleSplitMode() {
    const nextMode = splitMode === 'percent' ? 'amount' : 'percent';
    const converted: Record<string, string> = {};
    for (const goal of goals) {
      const percent = effectiveGoalPercent(goal.id);
      if (percent === null) {
        converted[goal.id] = '';
      } else if (nextMode === 'amount') {
        converted[goal.id] = centsToAmountInput(Math.round((savingsAmountCents * percent) / 100));
      } else {
        converted[goal.id] = String(percent);
      }
    }
    setGoalInputTexts(converted);
    setSplitMode(nextMode);
  }

  const onSaveAllocation = async (myMonthlyIncomeCents?: number) => {
    if (!user) return;
    setIsSaving(true);
    setError(null);
    try {
      const memberWantsAllocations: MemberWantsAllocationEdit[] = members.map((m, i) => ({
        userId: m.user_id,
        wantsAllocationPercent: memberWantsPercents[i],
        wantsAccountId: memberWantsAccountIds[m.user_id] || null,
      }));

      await updateCoupleProfile(
        couple,
        {
          nickname: couple.nickname,
          anniversaryDate: couple.anniversary_date,
          budgetAllocationPercent: budgetPercent,
          savingsAllocationPercent: savingsPercent,
          wantsAllocationPercent: wantsPercent,
          budgetAccountId: budgetAccountId || null,
          savingsAccountId: savingsAccountId || null,
          myMonthlyIncomeCents,
          memberWantsAllocations,
        },
        user.id,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const performDistribute = async (force: boolean) => {
    if (!user || !bucketAmounts || !memberWantsAmounts) return;
    setIsDistributing(true);
    setError(null);
    try {
      const savingsGoalAllocations: SavingsGoalAllocationInputDto[] = includedGoals.map((goal) => ({
        savingsGoalId: goal.id,
        allocationPercent: effectiveGoalPercent(goal.id) ?? 0,
      }));

      // The wire DTO needs each member's share expressed as a percent *of the Wants bucket*
      // (summing to exactly 100) — see WantsAllocationInputDto and DistributionService, which
      // splits the already-computed Wants amount by these percents. The Calculator itself works
      // in percent-of-income terms (Mine%+Hers%=Wants%) purely for display, so it's re-expressed
      // here at the last possible moment, right before building the request.
      const wantsRelativePercents = reexpressAsPercentOf(memberWantsPercents as number[], wantsPercent!);
      const wantsAllocations: WantsAllocationInputDto[] = members.map((m, i) => ({
        userId: m.user_id,
        allocationPercent: wantsRelativePercents[i],
        accountId: memberWantsAccountIds[m.user_id],
      }));

      const request: DistributeMoneyRequestDto = {
        year,
        month,
        combinedIncome: combinedIncomeCents / 100,
        currency,
        budgetPercent: budgetPercent!,
        budgetAccountId,
        savingsPercent: savingsPercent!,
        savingsAccountId,
        savingsGoalAllocations,
        wantsPercent: wantsPercent!,
        wantsAllocations,
        force,
      };

      await distributeMoney(request);

      // Remember this plan for next time — the shared allocation plan, each member's Wants
      // share/account, and each included goal's own default share, so the Calculator (and each
      // goal's screen) reopens prefilled.
      await onSaveAllocation(yourIncomeCents);
      await Promise.all(
        includedGoals.map((goal) => {
          const percent = effectiveGoalPercent(goal.id);
          if (percent === goal.allocation_percent || !user) return Promise.resolve();
          return updateSavingsGoal(goal, { name: goal.name, targetAmountCents: goal.target_amount_cents, currency: goal.currency, allocationPercent: percent, isActive: true }, user.id);
        }),
      );

      Alert.alert('Distributed! 💰', `${formatMoney(combinedIncomeCents, currency)} has been distributed for ${monthNames[month - 1]} ${year}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not distribute right now. Please try again.');
    } finally {
      setIsDistributing(false);
    }
  };

  const onPressDistribute = () => {
    if (!bucketAmounts || !memberWantsAmounts) return;
    const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? '—';
    const memberLabel = (m: CoupleMember) => (m.user_id === user?.id ? 'You' : m.display_name);
    const alreadyDistributed = status?.alreadyDistributed ?? false;

    const wantsBreakdown = members
      .map((m, i) => `    ${memberLabel(m)}  ${memberWantsPercents[i]}%  ${formatMoney(memberWantsAmounts[i], currency)} → ${accountName(memberWantsAccountIds[m.user_id])}`)
      .join('\n');

    const summary =
      `Combined Income\n${formatMoney(combinedIncomeCents, currency)}\n\n` +
      `Budget  ${budgetPercent}%  ${formatMoney(bucketAmounts[0], currency)} → ${accountName(budgetAccountId)}\n` +
      `Savings  ${savingsPercent}%  ${formatMoney(bucketAmounts[1], currency)} → ${accountName(savingsAccountId)}\n` +
      `Wants  ${wantsPercent}%  ${formatMoney(bucketAmounts[2], currency)}\n${wantsBreakdown}`;

    Alert.alert(
      alreadyDistributed ? `${monthNames[month - 1]} ${year} was already distributed` : 'Ready to distribute?',
      alreadyDistributed ? `${summary}\n\nDistributing again records a second, separate distribution for this month.` : summary,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: alreadyDistributed ? 'Distribute Again' : 'Distribute',
          style: alreadyDistributed ? 'destructive' : 'default',
          onPress: () => performDistribute(alreadyDistributed),
        },
      ],
    );
  };

  return (
    <View className="gap-8">
      <Text className="text-lg font-semibold text-textPrimary">How should we divide our income?</Text>

      {/* STEP 1 — Combined Income */}
      <View className="gap-3">
        <MoneySectionHeader label="Combined Income" />
        <TextField label="Your Income" value={yourIncomeText} onChangeText={setYourIncomeText} keyboardType="decimal-pad" placeholder="0.00" />
        <TextField
          label="Partner Income"
          value={partner?.monthly_income_cents != null ? centsToAmountInput(partner.monthly_income_cents) : ''}
          editable={false}
          placeholder="Not entered yet"
        />
        {!partner ? <Text className="text-xs text-textMuted">Waiting for your partner to join.</Text> : null}
        <MoneyStat label="Combined Income" value={formatMoney(combinedIncomeCents, currency)} size="lg" />
      </View>

      {/* STEP 2 — Allocation percentages */}
      <View className="gap-3">
        <MoneySectionHeader label="How do you want to divide it?" />
        <TextField label="Budget %" value={budgetPercentText} onChangeText={setBudgetPercentText} keyboardType="decimal-pad" placeholder="e.g. 50" />
        <TextField label="Savings %" value={savingsPercentText} onChangeText={setSavingsPercentText} keyboardType="decimal-pad" placeholder="e.g. 30" />
        <TextField label="Wants %" value={wantsPercentText} onChangeText={setWantsPercentText} keyboardType="decimal-pad" placeholder="e.g. 20" />
        {allBucketPercentsEntered ? (
          <StatusBadge
            label={bucketPercentsSumTo100 ? `${(budgetPercent! + savingsPercent! + wantsPercent!).toFixed(2)}% allocated ✓` : `Total: ${(budgetPercent! + savingsPercent! + wantsPercent!).toFixed(2)}% — must equal 100%`}
            tone={bucketPercentsSumTo100 ? 'success' : 'error'}
          />
        ) : null}
      </View>

      {/* Visual allocation */}
      {bucketAmounts ? (
        <View className="gap-3">
          <AllocationBar label="Budget" percent={budgetPercent!} amountCents={bucketAmounts[0]} currency={currency} color={BUCKET_COLORS.budget} />
          <AllocationBar label="Savings" percent={savingsPercent!} amountCents={bucketAmounts[1]} currency={currency} color={BUCKET_COLORS.savings} />
          <AllocationBar label="Wants" percent={wantsPercent!} amountCents={bucketAmounts[2]} currency={currency} color={BUCKET_COLORS.wants} />
        </View>
      ) : null}

      {/*
        Loan obligations, shown for awareness only — never folded into the Budget/Savings/Wants
        split above. Loans are existing obligations, not part of this month's allocation plan;
        see the Loans tab for the actual "Pay" flow.
      */}
      {upcomingLoanPaymentsCents > 0 ? (
        <Card className="flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-textPrimary">Upcoming Loan Payments</Text>
          <Text className="text-sm font-semibold text-textPrimary">{formatMoney(upcomingLoanPaymentsCents, currency)}</Text>
        </Card>
      ) : null}

      {/* STEP 3 — Where should each amount go? */}
      <View className="gap-3">
        <MoneySectionHeader label="Where should each amount go?" />
        <AccountPickerField label="Budget Account" accounts={accounts} value={budgetAccountId} onChange={setBudgetAccountId} />
        <AccountPickerField label="Savings Account" accounts={accounts} value={savingsAccountId} onChange={setSavingsAccountId} />
      </View>

      {/* STEP 4 — Split Wants between you */}
      <View className="gap-3">
        <MoneySectionHeader label="Split Wants between you" />
        {members.length === 0 ? (
          <Text className="text-sm text-textSecondary">Waiting for your couple's membership to load.</Text>
        ) : (
          <View className="gap-3">
            {members.map((m, i) => {
              const label = m.user_id === user?.id ? 'You' : m.display_name;
              const amount = memberWantsAmounts?.[i] ?? null;
              return (
                <Card key={m.user_id} className="gap-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-semibold text-textPrimary">{label}</Text>
                    {amount !== null ? <Text className="text-sm font-semibold text-textPrimary">{formatMoney(amount, currency)}</Text> : null}
                  </View>
                  <TextField
                    label={`${label}'s % of income`}
                    value={memberWantsPercentTexts[m.user_id] ?? ''}
                    onChangeText={(text) => setMemberWantsPercentTexts((prev) => ({ ...prev, [m.user_id]: text }))}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 10"
                  />
                  <AccountPickerField
                    label={`${label}'s Wants Account`}
                    accounts={accounts}
                    value={memberWantsAccountIds[m.user_id] ?? ''}
                    onChange={(accountId) => setMemberWantsAccountIds((prev) => ({ ...prev, [m.user_id]: accountId }))}
                  />
                </Card>
              );
            })}
          </View>
        )}
        {members.length > 0 && wantsPercent !== null ? (
          <StatusBadge
            label={wantsSplitSumsToTotal ? 'Adds up to your Wants allocation ✓' : `Must add up to exactly ${wantsPercent}% (the Wants allocation above)`}
            tone={wantsSplitSumsToTotal ? 'success' : 'error'}
          />
        ) : null}
      </View>

      {/* STEP 5 — Savings sub-allocation */}
      <View className="gap-3">
        <MoneySectionHeader
          label="How should Savings be split?"
          action={
            <Pressable onPress={toggleSplitMode}>
              <Text className="text-xs font-semibold text-accent">{splitMode === 'percent' ? 'Switch to ₱' : 'Switch to %'}</Text>
            </Pressable>
          }
        />
        {goals.length === 0 ? (
          <Text className="text-sm text-textSecondary">Add a savings goal on the Savings tab first, then come back here to include it.</Text>
        ) : (
          <View className="gap-2">
            {goals.map((goal) => (
              <TextField
                key={goal.id}
                label={goal.name}
                value={goalInputTexts[goal.id] ?? ''}
                onChangeText={(text) => setGoalInputTexts((prev) => ({ ...prev, [goal.id]: text }))}
                keyboardType="decimal-pad"
                placeholder={splitMode === 'percent' ? 'e.g. 30' : '0.00'}
              />
            ))}
          </View>
        )}
        {includedGoals.length > 0 ? (
          <StatusBadge
            label={goalsSumTo100 ? 'Adds up to 100% of Savings ✓' : 'Must add up to exactly 100% of the Savings allocation'}
            tone={goalsSumTo100 ? 'success' : 'error'}
          />
        ) : null}
      </View>

      {/* STEP 6 — Review */}
      {bucketAmounts && includedGoals.length > 0 ? (
        <Card className="gap-2">
          <Text className="text-sm font-semibold text-textPrimary">Savings distribution</Text>
          {includedGoals.map((goal) => {
            const percent = effectiveGoalPercent(goal.id) ?? 0;
            const amountCents = Math.round((savingsAmountCents * percent) / 100);
            return (
              <View key={goal.id} className="flex-row items-center justify-between">
                <Text className="text-sm text-textPrimary">{goal.name}</Text>
                <Text className="text-sm text-textSecondary">
                  {percent}% ≈ {formatMoney(amountCents, currency)}
                </Text>
              </View>
            );
          })}
        </Card>
      ) : null}

      {error ? <Text className="text-sm text-error">{error}</Text> : null}

      <View className="gap-2">
        <Button label="Save my allocation" variant="secondary" onPress={() => onSaveAllocation(yourIncomeCents)} loading={isSaving} />
        <Button label="💰 Distribute Money" onPress={onPressDistribute} loading={isDistributing} disabled={!canDistribute} />
      </View>

      {/* Distribution history */}
      {status && status.recentHistory.length > 0 ? (
        <View className="gap-2">
          <MoneySectionHeader label="Distribution History" />
          {status.recentHistory.map((d) => (
            <Card key={d.id} className="gap-1">
              <Text className="text-sm font-semibold text-textPrimary">
                {monthNames[d.month - 1]} {d.year} · {formatMoney(Math.round(d.combinedIncome * 100), d.currency)}
              </Text>
              <Text className="text-xs text-textSecondary">
                Budget {formatMoney(Math.round(d.budgetAmount * 100), d.currency)} · Savings {formatMoney(Math.round(d.savingsAmount * 100), d.currency)} · Wants{' '}
                {formatMoney(Math.round(d.wantsAmount * 100), d.currency)}
              </Text>
              <StatusBadge label="Completed" tone="success" />
            </Card>
          ))}
        </View>
      ) : null}
    </View>
  );
}
