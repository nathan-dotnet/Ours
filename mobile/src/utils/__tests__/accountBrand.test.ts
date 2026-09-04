import { ACCOUNT_ICON_OPTIONS, getAccountBrand } from '../accountBrand';

describe('getAccountBrand', () => {
  it('returns a known-brand badge (colored wordmark, not a generic emoji) for recognized institutions', () => {
    for (const icon of ['bpi', 'gcash', 'maribank', 'maya', 'bdo', 'unionbank', 'metrobank']) {
      const brand = getAccountBrand(icon, 'Bank');
      expect(brand.isKnownBrand).toBe(true);
      expect(brand.wordmark.length).toBeGreaterThan(0);
      expect(brand.backgroundColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('is case-insensitive', () => {
    expect(getAccountBrand('BPI', 'Bank').wordmark).toBe('BPI');
    expect(getAccountBrand('Gcash', 'EWallet').wordmark).toBe('GCash');
  });

  it('falls back to a generic emoji badge (not a known-brand color) for cash', () => {
    const brand = getAccountBrand('cash', 'Cash');
    expect(brand.isKnownBrand).toBe(false);
    expect(brand.emoji).toBe('💵');
  });

  it('falls back to a generic emoji by account type for an unrecognized icon (a custom account name)', () => {
    expect(getAccountBrand('my-emergency-fund', 'Bank').emoji).toBe('🏦');
    expect(getAccountBrand('travel-money', 'EWallet').emoji).toBe('📱');
    expect(getAccountBrand('unknown-icon', 'Other').emoji).toBe('💰');
  });

  it('every preset icon option resolves to a brand without throwing', () => {
    for (const icon of ACCOUNT_ICON_OPTIONS) {
      expect(() => getAccountBrand(icon, 'Bank')).not.toThrow();
    }
  });
});
