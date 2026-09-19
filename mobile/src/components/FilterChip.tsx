import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface FilterChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  /** Shows a small caret — for a chip that expands/toggles a sub-list of options (Category/Account/Paid By), not a plain single-state chip. */
  expandable?: boolean;
}

/**
 * The one shared pill-toggle chip for Money — selected/expanded reads as a filled accent pill,
 * unselected as a bordered outline chip. Replaces the duplicated inline chip implementations that
 * used to live separately in BudgetTab.tsx and LoanForm.tsx.
 */
export function FilterChip({ label, active, onPress, expandable = false }: FilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-1 rounded-full px-3 py-1.5 ${active ? 'bg-accent' : 'border border-border bg-surface'}`}
    >
      <Text className={`text-xs font-medium ${active ? 'text-white' : 'text-textSecondary'}`} numberOfLines={1}>
        {label}
      </Text>
      {expandable ? (
        <Ionicons name="chevron-down" size={12} color={active ? '#FFFFFF' : '#7186A3'} />
      ) : null}
    </Pressable>
  );
}
