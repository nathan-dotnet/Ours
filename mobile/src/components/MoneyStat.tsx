import { Text, View } from 'react-native';

interface MoneyStatProps {
  label: string;
  value: string;
  /** Larger for a lone hero figure; compact for a stat sitting alongside siblings in a row. */
  size?: 'lg' | 'md' | 'sm';
  /** Tailwind text color class for the value only, e.g. 'text-error' when over budget. Defaults to the primary text color. */
  valueClassName?: string;
  align?: 'left' | 'center';
}

const VALUE_SIZE: Record<NonNullable<MoneyStatProps['size']>, string> = {
  lg: 'text-5xl font-bold',
  md: 'text-xl font-bold',
  sm: 'text-base font-semibold',
};

/**
 * "Value dominant, label beneath" — the redesign's own hierarchy rule (₱11,550 / Remaining, not
 * the reverse). Used for the Budget hero figure, Savings/Loans stat rows, Calculator's Combined
 * Income, etc. — a single reusable stat block instead of re-typing this pairing everywhere.
 */
export function MoneyStat({ label, value, size = 'md', valueClassName = 'text-textPrimary', align = 'left' }: MoneyStatProps) {
  return (
    <View className={`gap-0.5 ${align === 'center' ? 'items-center' : 'items-start'}`}>
      <Text className={`${VALUE_SIZE[size]} ${valueClassName}`} numberOfLines={1}>
        {value}
      </Text>
      <Text className="text-xs text-textSecondary">{label}</Text>
    </View>
  );
}
