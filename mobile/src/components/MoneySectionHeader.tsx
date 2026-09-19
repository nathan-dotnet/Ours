import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

interface MoneySectionHeaderProps {
  label: string;
  /** A right-aligned link/action, e.g. "See All Accounts". */
  action?: ReactNode;
}

/** The small uppercase section label repeated throughout Money (Budget/Spending/Filters/Recent Spending/etc.), with an optional right-aligned action slot. */
export function MoneySectionHeader({ label, action }: MoneySectionHeaderProps) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-xs font-semibold uppercase tracking-wider text-textSecondary">{label}</Text>
      {action}
    </View>
  );
}
