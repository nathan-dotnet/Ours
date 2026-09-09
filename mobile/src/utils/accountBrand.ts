/**
 * Local, bundled brand mapping — never an external image URL or a remote logo API. Known
 * Philippine banks/e-wallets get their real logo, shipped as a static asset under
 * assets/brands/ and resolved through Metro's `require` (bundled at build time, no network
 * fetch). An account's `icon` field is just a lookup key into this map; adding a new
 * bank/e-wallet later means dropping a PNG into assets/brands/ and adding one line here — no
 * migration needed. An icon this map doesn't recognize (a custom account name someone typed)
 * falls back to a generic emoji badge by account type instead of breaking the UI.
 */

export interface AccountBrand {
  /** True for a known institution — rendered as its real logo image (see BrandLogo.tsx); false renders as a plain emoji instead. */
  isKnownBrand: boolean;
  /** The bundled logo image, from `require('../../assets/brands/...')`. Unused when isKnownBrand is false. */
  logo: number | null;
  /** Used when isKnownBrand is false (Cash, generic fallbacks). */
  emoji: string;
  label: string;
}

const KNOWN_BRANDS: Record<string, AccountBrand> = {
  bpi: { isKnownBrand: true, logo: require('../../assets/brands/bpi.png'), emoji: '🏦', label: 'BPI' },
  bdo: { isKnownBrand: true, logo: require('../../assets/brands/bdo.png'), emoji: '🏦', label: 'BDO' },
  gotyme: { isKnownBrand: true, logo: require('../../assets/brands/gotyme.png'), emoji: '🏦', label: 'GoTyme' },
  gcash: { isKnownBrand: true, logo: require('../../assets/brands/gcash.png'), emoji: '📱', label: 'GCash' },
  maribank: { isKnownBrand: true, logo: require('../../assets/brands/maribank.png'), emoji: '🏦', label: 'MariBank' },
  cash: { isKnownBrand: false, logo: null, emoji: '💵', label: 'Cash' },
};

const GENERIC_BY_TYPE: Record<string, AccountBrand> = {
  Bank: { isKnownBrand: false, logo: null, emoji: '🏦', label: 'Bank' },
  EWallet: { isKnownBrand: false, logo: null, emoji: '📱', label: 'E-Wallet' },
  Cash: { isKnownBrand: false, logo: null, emoji: '💵', label: 'Cash' },
  Other: { isKnownBrand: false, logo: null, emoji: '💰', label: 'Other' },
};

/**
 * Preset choices shown when creating/editing an account — the supported real-logo brands plus a
 * generic option per type. Not a restriction: an account's `icon` can be any string, this list is
 * just what the picker offers.
 */
export const ACCOUNT_ICON_OPTIONS = ['maribank', 'bpi', 'bdo', 'gotyme', 'gcash', 'cash', 'generic'] as const;

export function getAccountBrand(icon: string, accountType: string): AccountBrand {
  return KNOWN_BRANDS[icon.toLowerCase()] ?? GENERIC_BY_TYPE[accountType] ?? GENERIC_BY_TYPE.Other;
}
