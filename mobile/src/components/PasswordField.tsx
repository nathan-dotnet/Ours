import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

interface PasswordFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string;
}

/** A TextField-alike with a 👁 toggle to show/hide what's currently being typed — not the reveal-after-save flow (see vaultReveal.ts), just normal compose-time visibility for a field you're actively entering. */
export function PasswordField({ label, value, onChangeText, placeholder, error }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-ink">{label}</Text>
      <View className={`flex-row items-center rounded-xl border ${error ? 'border-rose' : 'border-clay/30'}`}>
        <TextInput
          className="flex-1 px-4 py-3 text-base text-ink"
          placeholderTextColor="#7186A3"
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable onPress={() => setVisible((v) => !v)} className="px-4 py-3" accessibilityLabel={visible ? 'Hide password' : 'Show password'}>
          <Text className="text-base">{visible ? '🙈' : '👁'}</Text>
        </Pressable>
      </View>
      {error ? <Text className="text-xs text-rose">{error}</Text> : null}
    </View>
  );
}
