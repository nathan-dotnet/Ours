import { Text, TextInput, View, type TextInputProps } from 'react-native';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export function TextField({ label, error, ...inputProps }: TextFieldProps) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-ink">{label}</Text>
      <TextInput
        className={`rounded-xl border px-4 py-3 text-base text-ink ${error ? 'border-rose' : 'border-clay/30'}`}
        placeholderTextColor="#7186A3"
        {...inputProps}
      />
      {error ? <Text className="text-xs text-rose">{error}</Text> : null}
    </View>
  );
}
