import { Pressable, Text, View } from 'react-native';
import type { Account } from '../types/entities';
import { softRaised } from '../styles/neumorphism';
import { BrandLogo } from './BrandLogo';
import { formatMoney } from '../utils/money';

interface AccountCardProps {
  account: Account;
  balanceCents: number;
  onPress: () => void;
  /** Fills its row in a grid (see the Money dashboard's 2-column layout) instead of a fixed width for a horizontal scroller. */
  fill?: boolean;
}

/** A visual card (not a plain row) for one account — logo/icon, name, balance, type. */
export function AccountCard({ account, balanceCents, onPress, fill = false }: AccountCardProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`${fill ? 'flex-1' : 'w-44'} h-36 justify-between gap-1.5 rounded-2xl bg-blush p-4`}
      style={softRaised}
    >
      <BrandLogo icon={account.icon} accountType={account.type} size={36} />
      <View className="gap-0.5">
        <Text className="text-base font-semibold text-ink" numberOfLines={1}>
          {account.name}
        </Text>
        <Text className="text-lg font-semibold text-ink" numberOfLines={1}>
          {formatMoney(balanceCents, account.currency)}
        </Text>
        <Text className="text-xs text-clay">{account.type}</Text>
      </View>
    </Pressable>
  );
}
