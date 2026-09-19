import { Text, View } from 'react-native';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'error';

const TONE_TEXT: Record<StatusTone, string> = {
  neutral: 'text-textSecondary',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
};

const TONE_DOT: Record<StatusTone, string> = {
  neutral: 'bg-textMuted',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
};

interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
}

/**
 * A small, subtle status indicator — a colored dot plus a text label, never a big filled pill.
 * The label always carries the meaning on its own (see the redesign's "status isn't communicated
 * only through color") — color is a secondary reinforcement, not the only signal.
 */
export function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
      <Text className={`text-xs font-medium ${TONE_TEXT[tone]}`}>{label}</Text>
    </View>
  );
}
