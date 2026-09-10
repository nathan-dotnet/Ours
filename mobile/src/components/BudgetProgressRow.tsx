import { Pressable, Text, View } from 'react-native';
import { formatMoney } from '../utils/money';

interface BudgetProgressRowProps {
  category: string;
  spentCents: number;
  budgetCents: number;
  currency: string;
  onPress: () => void;
  /**
   * False for the last row. These rows carry no card/shadow of their own — one budget category
   * sitting in its own separately-shadowed card, directly under the Spent/Budget/Remaining
   * card, read as two near-identical stacked cards. money.tsx now wraps the whole list in one
   * shared card, same "one container, divided rows" treatment as that stats strip.
   */
  showDivider?: boolean;
}

/** A simple progress bar per category budget — no charts, per the Phase 3 spec's "Do not build advanced charts". */
export function BudgetProgressRow({ category, spentCents, budgetCents, currency, onPress, showDivider = true }: BudgetProgressRowProps) {
  const percent = budgetCents > 0 ? Math.round((spentCents / budgetCents) * 100) : 0;
  const isOverBudget = spentCents > budgetCents;
  const barWidth = Math.min(percent, 100);

  return (
    <Pressable onPress={onPress} className={`gap-1.5 px-4 py-3 ${showDivider ? 'border-b border-ink/10' : ''}`}>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-medium text-ink">{category}</Text>
        <Text className={`text-sm font-medium ${isOverBudget ? 'text-warning' : 'text-clay'}`}>
          {formatMoney(spentCents, currency)} / {formatMoney(budgetCents, currency)}
        </Text>
      </View>
      {/* bg-cream was nearly invisible against this card's own bg-blush/60 fill — bg-ink/10 keeps a visible groove at any fill level, including 0%. */}
      <View className="h-2 overflow-hidden rounded-full bg-ink/10">
        <View className={`h-2 rounded-full ${isOverBudget ? 'bg-warning' : 'bg-rose'}`} style={{ width: `${barWidth}%` }} />
      </View>
      {isOverBudget ? <Text className="text-xs font-medium text-warning">Over budget by {formatMoney(spentCents - budgetCents, currency)}</Text> : null}
    </Pressable>
  );
}
