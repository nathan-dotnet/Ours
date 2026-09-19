import { Pressable, Text, View } from 'react-native';
import { Button } from './Button';
import { StatusBadge, type StatusTone } from './StatusBadge';
import { fromLocalDateString } from '../utils/date';
import type { LoanDueStatus } from '../utils/loanSchedule';
import { formatMoney } from '../utils/money';

// Relabeled to the redesign's own status vocabulary (Due soon/Overdue/Active/Paid) — a
// presentation-only remap; `LoanDueStatus` itself (loanSchedule.ts) is unchanged.
const DUE_STATUS_LABEL: Record<LoanDueStatus, string> = {
  'paid-off': 'Paid',
  overdue: 'Overdue',
  'due-today': 'Due soon',
  upcoming: 'Active',
};

const DUE_STATUS_TONE: Record<LoanDueStatus, StatusTone> = {
  'paid-off': 'success',
  overdue: 'error',
  'due-today': 'warning',
  upcoming: 'neutral',
};

const shortDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

interface LoanCardProps {
  name: string;
  remainingCents: number;
  installmentsPaid: number;
  totalInstallments: number;
  /** The next unpaid installment's remaining amount — may be less than the full scheduled amount if it was already partially paid. Null once paid off. */
  nextPaymentAmountCents: number | null;
  /** ISO "YYYY-MM-DD". Null once paid off. */
  nextPaymentDueDate: string | null;
  dueStatus: LoanDueStatus;
  accountName: string;
  ownerLabel: string;
  currency: string;
  onPressDetails: () => void;
  onPressPay: () => void;
}

/** One loan's compact summary — remaining/next payment/installments-left/account/owner, as a bordered flat row so a whole list can be scanned at once. */
export function LoanCard({
  name,
  remainingCents,
  installmentsPaid,
  totalInstallments,
  nextPaymentAmountCents,
  nextPaymentDueDate,
  dueStatus,
  accountName,
  ownerLabel,
  currency,
  onPressDetails,
  onPressPay,
}: LoanCardProps) {
  const remainingInstallments = Math.max(0, totalInstallments - installmentsPaid);
  const isPaidOff = dueStatus === 'paid-off';

  return (
    <Pressable onPress={onPressDetails} className="gap-2 rounded-xl border border-border bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-textPrimary">{name}</Text>
        <StatusBadge label={DUE_STATUS_LABEL[dueStatus]} tone={DUE_STATUS_TONE[dueStatus]} />
      </View>

      <Text className="text-2xl font-bold text-textPrimary">{formatMoney(remainingCents, currency)}</Text>
      <Text className="-mt-1.5 text-xs text-textSecondary">Remaining</Text>

      {!isPaidOff && nextPaymentAmountCents !== null && nextPaymentDueDate !== null ? (
        <Text className="text-sm text-textSecondary">
          {formatMoney(nextPaymentAmountCents, currency)} next · {remainingInstallments} payment{remainingInstallments === 1 ? '' : 's'} remaining · Due{' '}
          {shortDateFormatter.format(fromLocalDateString(nextPaymentDueDate))}
        </Text>
      ) : null}

      <Text className="text-xs text-textMuted">
        {accountName} · {ownerLabel}
      </Text>

      {!isPaidOff && nextPaymentAmountCents !== null ? (
        <View className="flex-row gap-2 pt-1">
          <Button label={`Pay ${formatMoney(nextPaymentAmountCents, currency)}`} onPress={onPressPay} />
          <Button label="Details" variant="secondary" onPress={onPressDetails} />
        </View>
      ) : null}
    </Pressable>
  );
}
