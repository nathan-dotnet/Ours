import { accountSchema } from '../account';

function values(overrides: Partial<Record<string, unknown>> = {}) {
  return { name: 'BPI', type: 'Bank', icon: 'bpi', openingBalanceText: '10000', currency: 'PHP', isActive: true, ...overrides };
}

describe('accountSchema', () => {
  it('accepts a well-formed account', () => {
    expect(accountSchema.safeParse(values()).success).toBe(true);
  });

  it('accepts an empty starting balance (zero)', () => {
    expect(accountSchema.safeParse(values({ openingBalanceText: '' })).success).toBe(true);
  });

  it('accepts a decimal starting balance', () => {
    expect(accountSchema.safeParse(values({ openingBalanceText: '1250.50' })).success).toBe(true);
  });

  it('rejects a blank name', () => {
    expect(accountSchema.safeParse(values({ name: '  ' })).success).toBe(false);
  });

  it('rejects an invalid account type', () => {
    expect(accountSchema.safeParse(values({ type: 'Crypto' })).success).toBe(false);
  });

  it('accepts every controlled account type', () => {
    for (const type of ['Bank', 'EWallet', 'Cash', 'Other']) {
      expect(accountSchema.safeParse(values({ type })).success).toBe(true);
    }
  });

  it('rejects a malformed currency code', () => {
    expect(accountSchema.safeParse(values({ currency: 'PH' })).success).toBe(false);
  });

  it('normalizes currency to uppercase', () => {
    const result = accountSchema.safeParse(values({ currency: 'php' }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.currency).toBe('PHP');
  });

  it('rejects invalid starting balance text', () => {
    expect(accountSchema.safeParse(values({ openingBalanceText: 'abc' })).success).toBe(false);
  });
});
