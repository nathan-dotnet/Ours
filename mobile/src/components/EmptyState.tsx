import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

/** A plain, flat empty-state block — heading, description, optional CTA — replacing the near-identical shadowed empty states previously repeated across Budget/Savings/Loans. */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <View className="items-center gap-3 rounded-xl border border-dashed border-border py-10">
      <Text className="text-base font-semibold text-textPrimary">{title}</Text>
      <Text className="max-w-xs text-center text-sm text-textSecondary">{description}</Text>
      {action}
    </View>
  );
}
