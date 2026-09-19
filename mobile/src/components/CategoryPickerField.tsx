import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { TextField } from './TextField';

interface CategoryPickerFieldProps {
  label: string;
  /** Quick-pick presets — not exhaustive, see EXPENSE_CATEGORIES. */
  presets: readonly string[];
  value: string;
  onChange: (value: string) => void;
  /** Once set, a category can no longer change (same "locked after create" rule as everywhere else). */
  disabled?: boolean;
  error?: string;
  maxLength?: number;
}

/**
 * A chip picker for an *open* category vocabulary (see transaction.ts's EXPENSE_CATEGORIES
 * comment): the usual preset chips, plus a "+ Custom" chip that reveals a text field so a couple
 * can name a budget or expense after however they actually organize their spending (e.g. "Date
 * Night") instead of being limited to the presets. Reused by BudgetForm and
 * ExpenseTransactionForm so a typed custom category means the same string in both places —
 * budget progress matches by exact category text (see moneyCalculations.ts).
 */
export function CategoryPickerField({ label, presets, value, onChange, disabled = false, error, maxLength = 30 }: CategoryPickerFieldProps) {
  const isCustomValue = value.length > 0 && !presets.includes(value);
  const [isCustomOpen, setIsCustomOpen] = useState(isCustomValue);

  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-ink">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {presets.map((option) => {
          const selected = !isCustomOpen && option === value;
          return (
            <Pressable
              key={option}
              disabled={disabled}
              onPress={() => {
                setIsCustomOpen(false);
                onChange(option);
              }}
              className={`rounded-full px-3 py-2 ${selected ? 'bg-rose' : 'bg-blush'} ${disabled && !selected ? 'opacity-40' : ''}`}
            >
              <Text className={`text-xs font-medium ${selected ? 'text-cream' : 'text-clay'}`}>{option}</Text>
            </Pressable>
          );
        })}
        <Pressable
          disabled={disabled}
          onPress={() => {
            setIsCustomOpen(true);
            if (!isCustomValue) onChange('');
          }}
          className={`rounded-full px-3 py-2 ${isCustomOpen ? 'bg-rose' : 'bg-blush'} ${disabled && !isCustomOpen ? 'opacity-40' : ''}`}
        >
          <Text className={`text-xs font-medium ${isCustomOpen ? 'text-cream' : 'text-clay'}`}>+ Custom</Text>
        </Pressable>
      </View>
      {isCustomOpen ? (
        <TextField
          label="Custom category name"
          value={value}
          onChangeText={onChange}
          placeholder="e.g. Date Night"
          maxLength={maxLength}
          editable={!disabled}
          error={error}
        />
      ) : error ? (
        <Text className="text-xs text-rose">{error}</Text>
      ) : null}
    </View>
  );
}
