import { Pressable, Text, View } from 'react-native';
import type { Account } from '../types/entities';
import { getAccountBrand } from '../utils/accountBrand';

interface AccountPickerFieldProps {
  label: string;
  accounts: Account[];
  value: string;
  onChange: (accountId: string) => void;
  error?: string;
}

/** A chip selector for choosing an account — same visual pattern as the category chips elsewhere (CalendarEventForm, ExpenseForm before it). */
export function AccountPickerField({ label, accounts, value, onChange, error }: AccountPickerFieldProps) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-ink">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {accounts.map((account) => {
          const selected = account.id === value;
          const brand = getAccountBrand(account.icon, account.type);
          return (
            <Pressable
              key={account.id}
              onPress={() => onChange(account.id)}
              className={`flex-row items-center gap-1.5 rounded-full px-3 py-2 ${selected ? 'bg-rose' : 'bg-blush'}`}
            >
              <Text>{brand.emoji}</Text>
              <Text className={`text-xs font-medium ${selected ? 'text-cream' : 'text-clay'}`}>{account.name}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text className="text-xs text-rose">{error}</Text> : null}
    </View>
  );
}
