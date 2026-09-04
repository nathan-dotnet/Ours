/**
 * Local, static brand mapping (see the Money spec's "real brand logos, never an external image
 * URL or a remote logo API"). Known Philippine banks/e-wallets get a colored wordmark badge in
 * that brand's real public color — a lightweight "brand mark" rendered entirely from bundled
 * code (no image asset, no network fetch), which is what stays recognizable without shipping or
 * fetching actual trademarked artwork. An account's `icon` field is just a lookup key into this
 * map; adding a new bank/e-wallet later is a one-line addition here, no migration needed. An icon
 * this map doesn't recognize (a custom account name someone typed) falls back to a generic emoji
 * badge by account type instead of breaking the UI.
 */

export interface AccountBrand {
  /** True for a known institution — rendered as a colored wordmark badge (see BrandLogo.tsx); false renders as a plain emoji instead. */
  isKnownBrand: boolean;
  /** Short text shown on the badge for a known brand, e.g. "BPI", "GCash". Unused when isKnownBrand is false. */
  wordmark: string;
  /** Badge background color (the brand's real public color) — only meaningful when isKnownBrand. */
  backgroundColor: string;
  textColor: string;
  /** Used when isKnownBrand is false (Cash, generic fallbacks). */
  emoji: string;
  label: string;
}

const KNOWN_BRANDS: Record<string, AccountBrand> = {
  bpi: { isKnownBrand: true, wordmark: 'BPI', backgroundColor: '#C8102E', textColor: '#FFFFFF', emoji: '🏦', label: 'BPI' },
  bdo: { isKnownBrand: true, wordmark: 'BDO', backgroundColor: '#003DA5', textColor: '#FFFFFF', emoji: '🏦', label: 'BDO' },
  metrobank: { isKnownBrand: true, wordmark: 'MB', backgroundColor: '#00205B', textColor: '#FFD100', emoji: '🏦', label: 'Metrobank' },
  unionbank: { isKnownBrand: true, wordmark: 'UB', backgroundColor: '#F26522', textColor: '#FFFFFF', emoji: '🏦', label: 'UnionBank' },
  gcash: { isKnownBrand: true, wordmark: 'GCash', backgroundColor: '#0072CE', textColor: '#FFFFFF', emoji: '📱', label: 'GCash' },
  maya: { isKnownBrand: true, wordmark: 'maya', backgroundColor: '#00D639', textColor: '#052224', emoji: '📱', label: 'Maya' },
  maribank: { isKnownBrand: true, wordmark: 'Mari', backgroundColor: '#0F7173', textColor: '#FFFFFF', emoji: '🏦', label: 'MariBank' },
  cash: { isKnownBrand: false, wordmark: '', backgroundColor: '', textColor: '', emoji: '💵', label: 'Cash' },
};

const GENERIC_BY_TYPE: Record<string, AccountBrand> = {
  Bank: { isKnownBrand: false, wordmark: '', backgroundColor: '', textColor: '', emoji: '🏦', label: 'Bank' },
  EWallet: { isKnownBrand: false, wordmark: '', backgroundColor: '', textColor: '', emoji: '📱', label: 'E-Wallet' },
  Cash: { isKnownBrand: false, wordmark: '', backgroundColor: '', textColor: '', emoji: '💵', label: 'Cash' },
  Other: { isKnownBrand: false, wordmark: '', backgroundColor: '', textColor: '', emoji: '💰', label: 'Other' },
};

/** Preset choices shown when creating/editing an account — recognizable local brands (the spec's examples) plus a generic option per type. Not a restriction: an account's `icon` can be any string, this list is just what the picker offers. */
export const ACCOUNT_ICON_OPTIONS = ['bpi', 'gcash', 'maribank', 'maya', 'bdo', 'unionbank', 'metrobank', 'cash', 'generic'] as const;

export function getAccountBrand(icon: string, accountType: string): AccountBrand {
  return KNOWN_BRANDS[icon.toLowerCase()] ?? GENERIC_BY_TYPE[accountType] ?? GENERIC_BY_TYPE.Other;
}
