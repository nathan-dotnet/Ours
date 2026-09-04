/**
 * Local, static brand -> icon mapping (see Phase 3 spec's "Account Logos") — never an external
 * image URL or a scraped/fetched logo. An account's `icon` field is just an identifier the app
 * looks up here; adding a new bank/e-wallet later is a one-line addition to this map, no
 * migration needed. An icon this map doesn't recognize (a custom account name someone typed)
 * falls back to a generic icon based on the account's type instead of breaking the UI.
 */

export interface AccountBrand {
  emoji: string;
  label: string;
}

const KNOWN_BRANDS: Record<string, AccountBrand> = {
  bpi: { emoji: '🏦', label: 'BPI' },
  bdo: { emoji: '🏦', label: 'BDO' },
  metrobank: { emoji: '🏦', label: 'Metrobank' },
  gcash: { emoji: '📱', label: 'GCash' },
  maya: { emoji: '📱', label: 'Maya' },
  maribank: { emoji: '🏦', label: 'MariBank' },
  cash: { emoji: '💵', label: 'Cash' },
};

const GENERIC_BY_TYPE: Record<string, AccountBrand> = {
  Bank: { emoji: '🏦', label: 'Bank' },
  EWallet: { emoji: '📱', label: 'E-Wallet' },
  Cash: { emoji: '💵', label: 'Cash' },
  Other: { emoji: '💰', label: 'Other' },
};

/** Preset choices shown when creating/editing an account — covers the common cases from the spec, plus a generic option per type. */
export const ACCOUNT_ICON_OPTIONS = ['bpi', 'bdo', 'metrobank', 'gcash', 'maya', 'maribank', 'cash', 'generic'] as const;

export function getAccountBrand(icon: string, accountType: string): AccountBrand {
  return KNOWN_BRANDS[icon.toLowerCase()] ?? GENERIC_BY_TYPE[accountType] ?? GENERIC_BY_TYPE.Other;
}
