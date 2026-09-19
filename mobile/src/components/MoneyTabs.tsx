import { Pressable, ScrollView, Text } from 'react-native';

export type MoneyTab = 'Budget' | 'Savings' | 'Calculator' | 'Loans';

const TABS: MoneyTab[] = ['Budget', 'Savings', 'Calculator', 'Loans'];

interface MoneyTabsProps {
  active: MoneyTab;
  onChange: (tab: MoneyTab) => void;
}

/**
 * The Money screen's own segmented control — a bordered track with an accent-filled pill for the
 * active tab, same modern-fintech language as the rest of Money (border for grouping, not a
 * shadowed/tinted block). Horizontally scrollable rather than a `flex-1`-per-chip equal split so
 * long labels never wrap or truncate at phone width.
 */
export function MoneyTabs({ active, onChange }: MoneyTabsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="flex-row gap-1 rounded-full border border-border bg-surface p-1"
    >
      {TABS.map((tab) => {
        const selected = tab === active;
        return (
          <Pressable
            key={tab}
            onPress={() => onChange(tab)}
            className={`items-center rounded-full px-4 py-2 ${selected ? 'bg-accent' : ''}`}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-textSecondary'}`} numberOfLines={1}>
              {tab}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
