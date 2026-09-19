import { Pressable, Text, View } from 'react-native';
import { ProgressBar } from './ProgressBar';
import { formatMoney } from '../utils/money';

interface SavingsGoalCardProps {
  name: string;
  currentAmountCents: number;
  targetAmountCents: number;
  currency: string;
  onPress: () => void;
}

/** One savings goal's progress — a monogram, name, current/target, percent, and a filled bar, so progress reads at a glance on a bordered flat row. */
export function SavingsGoalCard({ name, currentAmountCents, targetAmountCents, currency, onPress }: SavingsGoalCardProps) {
  const progress = targetAmountCents > 0 ? Math.min(currentAmountCents / targetAmountCents, 1) : 0;
  const percent = Math.round(progress * 100);
  const isComplete = percent >= 100;

  return (
    <Pressable onPress={onPress} className="gap-2 rounded-xl border border-border bg-surface p-4">
      <View className="flex-row items-center gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-blush">
          <Text className="text-sm font-bold text-accent">{name.charAt(0).toUpperCase()}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-textPrimary" numberOfLines={1}>
            {name}
          </Text>
          <Text className="text-xs text-textSecondary">
            {formatMoney(currentAmountCents, currency)} / {formatMoney(targetAmountCents, currency)}
          </Text>
        </View>
        <Text className={`text-sm font-bold ${isComplete ? 'text-success' : 'text-textPrimary'}`}>{percent}%</Text>
      </View>
      <ProgressBar percent={percent} tone={isComplete ? 'success' : 'accent'} />
    </Pressable>
  );
}
