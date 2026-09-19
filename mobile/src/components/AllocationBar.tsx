import { Text, View } from 'react-native';
import { ProgressBar } from './ProgressBar';
import { formatMoney } from '../utils/money';

interface AllocationBarProps {
  label: string;
  percent: number;
  amountCents: number;
  currency: string;
  color: string;
}

/**
 * One row of the Calculator's visual allocation breakdown — a label, a filled percentage bar,
 * and the resulting peso amount. Deliberately just this, not a pie/donut chart — see the Money
 * Calculator spec's "a simple visual breakdown is enough". Uses the shared ProgressBar with an
 * explicit `color` override, since each bucket (Budget/Savings/Wants) has its own fixed identity
 * color rather than a health-status tone.
 */
export function AllocationBar({ label, percent, amountCents, currency, color }: AllocationBarProps) {
  return (
    <View className="gap-1.5">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-sm font-semibold text-textPrimary">{label}</Text>
        <Text className="text-xs text-textSecondary">{percent}%</Text>
      </View>
      <ProgressBar percent={percent} color={color} height={10} />
      <Text className="text-base font-semibold text-textPrimary">{formatMoney(amountCents, currency)}</Text>
    </View>
  );
}
