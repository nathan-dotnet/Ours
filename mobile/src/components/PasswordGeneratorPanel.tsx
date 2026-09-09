import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { DEFAULT_PASSWORD_OPTIONS, generatePassword, type PasswordGeneratorOptions } from '../utils/passwordGenerator';
import { softRaised } from '../styles/neumorphism';
import { Button } from './Button';

interface PasswordGeneratorPanelProps {
  onUsePassword: (password: string) => void;
}

const LENGTH_STEPS = [8, 12, 16, 20, 24, 32];

const TOGGLES: { key: keyof Omit<PasswordGeneratorOptions, 'length'>; label: string }[] = [
  { key: 'uppercase', label: 'Uppercase' },
  { key: 'lowercase', label: 'Lowercase' },
  { key: 'numbers', label: 'Numbers' },
  { key: 'symbols', label: 'Symbols' },
];

/** An inline expandable panel (not a separate screen) — a couple's shared vault should feel lightweight, not like a standalone password-manager app. */
export function PasswordGeneratorPanel({ onUsePassword }: PasswordGeneratorPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [options, setOptions] = useState<PasswordGeneratorOptions>(DEFAULT_PASSWORD_OPTIONS);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const regenerate = (nextOptions: PasswordGeneratorOptions) => {
    try {
      setPreview(generatePassword(nextOptions));
      setError(null);
    } catch {
      setPreview(null);
      setError('Enable at least one character type.');
    }
  };

  const toggleExpanded = () => {
    if (!expanded) regenerate(options);
    setExpanded((v) => !v);
  };

  const updateOptions = (next: Partial<PasswordGeneratorOptions>) => {
    const merged = { ...options, ...next };
    setOptions(merged);
    regenerate(merged);
  };

  if (!expanded) {
    return (
      <Pressable onPress={toggleExpanded} className="items-center py-1">
        <Text className="text-sm font-semibold text-rose">Generate Password</Text>
      </Pressable>
    );
  }

  return (
    <View className="gap-3 rounded-2xl bg-blush/60 p-4" style={softRaised}>
      <Text className="text-sm font-semibold text-ink">Generate Password</Text>

      <View className="rounded-xl bg-cream px-4 py-3">
        <Text className="text-base text-ink" selectable numberOfLines={1}>
          {preview ?? '—'}
        </Text>
      </View>
      {error ? <Text className="text-xs text-rose">{error}</Text> : null}

      <View className="gap-1.5">
        <Text className="text-sm font-medium text-ink">Length: {options.length}</Text>
        <View className="flex-row flex-wrap gap-2">
          {LENGTH_STEPS.map((length) => (
            <Pressable
              key={length}
              onPress={() => updateOptions({ length })}
              className={`rounded-full px-3 py-2 ${options.length === length ? 'bg-rose' : 'bg-cream'}`}
            >
              <Text className={`text-xs font-medium ${options.length === length ? 'text-cream' : 'text-clay'}`}>{length}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="flex-row flex-wrap gap-2">
        {TOGGLES.map(({ key, label }) => {
          const selected = options[key];
          return (
            <Pressable
              key={key}
              onPress={() => updateOptions({ [key]: !selected })}
              className={`rounded-full px-3 py-2 ${selected ? 'bg-rose' : 'bg-cream'}`}
            >
              <Text className={`text-xs font-medium ${selected ? 'text-cream' : 'text-clay'}`}>
                {selected ? '☑' : '☐'} {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button label="Regenerate" variant="secondary" onPress={() => regenerate(options)} />
        </View>
        <View className="flex-1">
          <Button
            label="Use this password"
            onPress={() => {
              if (preview) {
                onUsePassword(preview);
                setExpanded(false);
              }
            }}
            disabled={!preview}
          />
        </View>
      </View>
    </View>
  );
}
