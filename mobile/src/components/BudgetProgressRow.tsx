import { Pressable, Text, View } from 'react-native';
import { ProgressBar, type ProgressTone } from './ProgressBar';
import { StatusBadge, type StatusTone } from './StatusBadge';
import { getCategoryIcon } from '../utils/moneyActivity';
import { formatMoney } from '../utils/money';

interface BudgetProgressRowProps {
  category: string;
  spentCents: number;
  budgetCents: number;
  currency: string;
  onPress: () => void;
  showDivider?: boolean;
}

/** Subtle spending status per category — never a loud badge, just a small label + dot (see StatusBadge). */
function statusFor(percent: number): { label: string; tone: StatusTone; barTone: ProgressTone } {
  if (percent >= 100) return { label: 'Over budget', tone: 'error', barTone: 'error' };
  if (percent >= 80) return { label: 'Almost at limit', tone: 'warning', barTone: 'warning' };
  return { label: 'On track', tone: 'success', barTone: 'accent' };
}

/** One category's spending, as a compact row — icon, name, amounts, a progress bar, and a subtle status — no card of its own; a parent list groups a whole set of these with hairline dividers. */
export function BudgetProgressRow({ category, spentCents, budgetCents, currency, onPress, showDivider = true }: BudgetProgressRowProps) {
  const percent = budgetCents > 0 ? Math.round((spentCents / budgetCents) * 100) : 0;
  const status = statusFor(percent);

  return (
    <Pressable onPress={onPress} className={`gap-1.5 py-3 ${showDivider ? 'border-b border-border' : ''}`}>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Text className="text-base">{getCategoryIcon(category)}</Text>
          <Text className="text-sm font-medium text-textPrimary">{category}</Text>
        </View>
        <Text className="text-sm font-medium text-textSecondary">
          {formatMoney(spentCents, currency)} / {formatMoney(budgetCents, currency)}
        </Text>
      </View>
      <ProgressBar percent={percent} tone={status.barTone} />
      <StatusBadge label={status.label} tone={status.tone} />
    </Pressable>
  );
}
