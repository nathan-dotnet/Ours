import { ACCOUNT_ICON_OPTIONS, getAccountBrand } from '../accountBrand';

describe('getAccountBrand', () => {
  it('returns a known-brand badge (a real logo image, not a generic emoji) for recognized institutions', () => {
    for (const icon of ['bpi', 'gcash', 'maribank', 'bdo', 'gotyme']) {
      const brand = getAccountBrand(icon, 'Bank');
      expect(brand.isKnownBrand).toBe(true);
      expect(brand.logo).not.toBeNull();
    }
  });

  it('is case-insensitive', () => {
    expect(getAccountBrand('BPI', 'Bank').label).toBe('BPI');
    expect(getAccountBrand('Gcash', 'EWallet').label).toBe('GCash');
  });

  it('falls back to a generic emoji badge (not a known-brand logo) for cash', () => {
    const brand = getAccountBrand('cash', 'Cash');
    expect(brand.isKnownBrand).toBe(false);
    expect(brand.emoji).toBe('💵');
  });

  it('falls back to a generic emoji by account type for an unrecognized icon (a custom account name)', () => {
    expect(getAccountBrand('my-emergency-fund', 'Bank').emoji).toBe('🏦');
    expect(getAccountBrand('travel-money', 'EWallet').emoji).toBe('📱');
    expect(getAccountBrand('unknown-icon', 'Other').emoji).toBe('💰');
  });

  it('no longer recognizes the discontinued Metrobank/UnionBank brands', () => {
    expect(getAccountBrand('metrobank', 'Bank').isKnownBrand).toBe(false);
    expect(getAccountBrand('unionbank', 'Bank').isKnownBrand).toBe(false);
  });

  it('every preset icon option resolves to a brand without throwing', () => {
    for (const icon of ACCOUNT_ICON_OPTIONS) {
      expect(() => getAccountBrand(icon, 'Bank')).not.toThrow();
    }
  });
});
