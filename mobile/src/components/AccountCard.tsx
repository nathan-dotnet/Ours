import { Pressable, Text, View } from 'react-native';
import type { Account } from '../types/entities';
import { BrandLogo } from './BrandLogo';
import { formatMoney } from '../utils/money';

interface AccountCardProps {
  account: Account;
  balanceCents: number;
  onPress: () => void;
  /** Fills its row in a grid (see the Money dashboard's 2-column layout) instead of a fixed width for a horizontal scroller. */
  fill?: boolean;
}

/**
 * A bordered, flat account card — logo/icon+name up top, then a prominent balance, then the
 * account type as a small caption. Same "value dominant, label/caption beneath" idiom as
 * MoneyStat, on a bordered (not shadowed) surface.
 */
export function AccountCard({ account, balanceCents, onPress, fill = false }: AccountCardProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`${fill ? 'flex-1' : 'w-44'} gap-2 rounded-xl border border-border bg-surface p-4`}
    >
      <View className="flex-row items-center gap-2">
        <BrandLogo icon={account.icon} accountType={account.type} size={24} />
        <Text className="flex-1 text-sm font-semibold text-textPrimary" numberOfLines={1}>
          {account.name}
        </Text>
      </View>
      <Text className="text-lg font-bold text-textPrimary" numberOfLines={1}>
        {formatMoney(balanceCents, account.currency)}
      </Text>
      <Text className="text-xs text-textSecondary">{account.type}</Text>
    </Pressable>
  );
}
