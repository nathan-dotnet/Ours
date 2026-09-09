import { ActivityIndicator, Pressable, Text } from 'react-native';
import { softRaised, softRaisedAccent } from '../styles/neumorphism';

interface ButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

export function Button({ label, onPress, loading = false, disabled = false, variant = 'primary' }: ButtonProps) {
  const isPrimary = variant === 'primary';
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`items-center justify-center rounded-2xl px-5 py-4 ${isPrimary ? 'bg-rose' : 'bg-blush'} ${isDisabled ? 'opacity-50' : ''}`}
      style={isDisabled ? undefined : isPrimary ? softRaisedAccent : softRaised}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#EAF1FB' : '#5B7FBE'} />
      ) : (
        <Text className={`text-base font-semibold ${isPrimary ? 'text-cream' : 'text-rose'}`}>{label}</Text>
      )}
    </Pressable>
  );
}
