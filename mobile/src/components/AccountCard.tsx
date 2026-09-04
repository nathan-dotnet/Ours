import { Pressable, Text, View } from 'react-native';
import type { Account } from '../types/entities';
import { getAccountBrand } from '../utils/accountBrand';
import { formatMoney } from '../utils/money';

interface AccountCardProps {
  account: Account;
  balanceCents: number;
  onPress: () => void;
}

/** A visual card (not a plain row) for one account — logo/icon, name, balance, type. See Phase 3 spec's "Account Card UI". */
export function AccountCard({ account, balanceCents, onPress }: AccountCardProps) {
  const brand = getAccountBrand(account.icon, account.type);

  return (
    <Pressable onPress={onPress} className="w-44 gap-2 rounded-2xl bg-blush p-4">
      <Text className="text-2xl">{brand.emoji}</Text>
      <Text className="text-base font-semibold text-ink" numberOfLines={1}>
        {account.name}
      </Text>
      <Text className="text-lg font-semibold text-ink">{formatMoney(balanceCents, account.currency)}</Text>
      <Text className="text-xs text-clay">{account.type}</Text>
    </Pressable>
  );
}
