import { Pressable, Text, View } from 'react-native';
import { softRaisedSubtle } from '../styles/neumorphism';
import { formatMoney } from '../utils/money';

interface BudgetProgressRowProps {
  category: string;
  spentCents: number;
  budgetCents: number;
  currency: string;
  onPress: () => void;
}

/** A simple progress bar per category budget — no charts, per the Phase 3 spec's "Do not build advanced charts". */
export function BudgetProgressRow({ category, spentCents, budgetCents, currency, onPress }: BudgetProgressRowProps) {
  const percent = budgetCents > 0 ? Math.round((spentCents / budgetCents) * 100) : 0;
  const isOverBudget = spentCents > budgetCents;
  const barWidth = Math.min(percent, 100);

  return (
    <Pressable onPress={onPress} className="gap-1.5 rounded-xl bg-blush/60 px-4 py-3" style={softRaisedSubtle}>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-medium text-ink">{category}</Text>
        <Text className={`text-sm font-medium ${isOverBudget ? 'text-rose' : 'text-clay'}`}>
          {formatMoney(spentCents, currency)} / {formatMoney(budgetCents, currency)}
        </Text>
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-cream">
        <View className={`h-2 rounded-full ${isOverBudget ? 'bg-rose' : 'bg-ink/60'}`} style={{ width: `${barWidth}%` }} />
      </View>
      {isOverBudget ? <Text className="text-xs font-medium text-rose">Over budget by {formatMoney(spentCents - budgetCents, currency)}</Text> : null}
    </Pressable>
  );
}
