import { View } from 'react-native';

interface SavingsProgressBarProps {
  allocatedCents: number;
  spentCents: number;
  targetCents: number;
}

/** Splits a goal's target into current saved funds, withdrawn funds, and unallocated target. */
export function SavingsProgressBar({ allocatedCents, spentCents, targetCents }: SavingsProgressBarProps) {
  const target = Math.max(0, targetCents);
  const remaining = Math.max(0, allocatedCents - spentCents);
  const savedWidth = target > 0 ? Math.min(remaining / target, 1) * 100 : 0;
  const spentWidth = target > 0 ? Math.min(Math.max(0, spentCents) / target, 1 - savedWidth / 100) * 100 : 0;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: target, now: Math.min(remaining, target) }}
      className="h-2.5 w-full flex-row overflow-hidden rounded-full bg-ink/10"
    >
      <View className="h-full bg-success" style={{ width: `${savedWidth}%` }} />
      <View className="h-full bg-rose" style={{ width: `${spentWidth}%` }} />
    </View>
  );
}