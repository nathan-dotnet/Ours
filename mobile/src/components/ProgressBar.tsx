import { View } from 'react-native';

export type ProgressTone = 'accent' | 'success' | 'warning' | 'error';

const TONE_CLASS: Record<ProgressTone, string> = {
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
};

interface ProgressBarProps {
  /** 0-100+; values above 100 still render a full track (never overflow visually). */
  percent: number;
  tone?: ProgressTone;
  /** Overrides `tone` with a raw color — for Calculator's Budget/Savings/Wants bucket colors, which are a fixed identity per bucket, not a health signal. */
  color?: string;
  /** Track thickness in px — defaults to a slim 8px line. */
  height?: number;
}

/**
 * The one shared progress-bar primitive for Money — a clean rounded-ends track that communicates
 * percentage and (via `tone`) health, replacing the ~4 previously hand-rolled bars
 * (BudgetProgressRow, SavingsGoalCard, AllocationBar, Budget's own %-used bar).
 */
export function ProgressBar({ percent, tone = 'accent', color, height = 8 }: ProgressBarProps) {
  const width = Math.min(100, Math.max(0, percent));
  return (
    <View className="overflow-hidden rounded-full bg-ink/10" style={{ height }}>
      <View
        className={`h-full rounded-full ${color ? '' : TONE_CLASS[tone]}`}
        style={{ width: `${width}%`, backgroundColor: color }}
      />
    </View>
  );
}
