import { ActivityIndicator, Pressable, Text } from 'react-native';
import { softRaisedAccent } from '../styles/neumorphism';

interface ButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

/**
 * Primary is a flat accent-filled pill with a subtle lift (the one thing to tap); secondary is a
 * bordered outline, no shadow at all — the modern-fintech redesign's "no shadow for normal
 * elements, subtle elevation only for the one primary surface that needs it" rule applied to the
 * app's single shared button. Same `variant`/`loading`/`disabled` API as before, so every existing
 * call site keeps working unchanged.
 */
export function Button({ label, onPress, loading = false, disabled = false, variant = 'primary' }: ButtonProps) {
  const isPrimary = variant === 'primary';
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`items-center justify-center rounded-xl px-5 py-3.5 ${
        isPrimary ? 'bg-accent' : 'border border-border bg-surface'
      } ${isDisabled ? 'opacity-50' : ''}`}
      style={isDisabled || !isPrimary ? undefined : softRaisedAccent}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#FFFFFF' : '#5B7FBE'} />
      ) : (
        <Text className={`text-base font-semibold ${isPrimary ? 'text-white' : 'text-textPrimary'}`}>{label}</Text>
      )}
    </Pressable>
  );
}
