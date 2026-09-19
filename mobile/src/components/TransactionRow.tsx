import { Pressable, Text, View } from 'react-native';
import type { TransactionDescription } from '../utils/moneyActivity';
import { formatMoney } from '../utils/money';

interface TransactionRowProps {
  description: TransactionDescription;
  amountCents: number;
  currency: string;
  onPress: () => void;
  /** A bottom hairline divider between rows in a list — omit on the last row. */
  showDivider?: boolean;
}

/**
 * One transaction, as a flat row — icon, title, subtitle, right-aligned amount — no card shell
 * around it. Replaces the previous "every transaction is its own shadowed card" treatment; a list
 * of these reads as one coherent list via hairline dividers instead of stacked shadows.
 */
export function TransactionRow({ description, amountCents, currency, onPress, showDivider = true }: TransactionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center justify-between py-3 ${showDivider ? 'border-b border-border' : ''}`}
    >
      <View className="flex-1 flex-row items-center gap-3 pr-3">
        <Text className="text-xl">{description.icon}</Text>
        <View className="flex-1 gap-0.5">
          <Text className="text-sm font-semibold text-textPrimary" numberOfLines={1}>
            {description.title}
          </Text>
          <Text className="text-xs text-textMuted" numberOfLines={1}>
            {description.subtitle}
          </Text>
        </View>
      </View>
      <Text className={`text-sm font-semibold ${description.isNegative ? 'text-textPrimary' : 'text-success'}`}>
        {description.amountText}
        {formatMoney(amountCents, currency)}
      </Text>
    </Pressable>
  );
}
