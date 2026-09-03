import { expenseSchema } from '../expense';

function values(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    amountText: '100.00',
    currency: 'PHP',
    category: 'Food',
    description: '',
    expenseDate: new Date('2026-09-01T00:00:00.000Z'),
    notes: '',
    ...overrides,
  };
}

describe('expenseSchema', () => {
  it('accepts a well-formed expense', () => {
    expect(expenseSchema.safeParse(values()).success).toBe(true);
  });

  it('accepts decimal amounts with one or two decimal places', () => {
    expect(expenseSchema.safeParse(values({ amountText: '100.1' })).success).toBe(true);
    expect(expenseSchema.safeParse(values({ amountText: '0.99' })).success).toBe(true);
  });

  it('rejects a zero amount', () => {
    expect(expenseSchema.safeParse(values({ amountText: '0' })).success).toBe(false);
    expect(expenseSchema.safeParse(values({ amountText: '0.00' })).success).toBe(false);
  });

  it('rejects a negative amount', () => {
    expect(expenseSchema.safeParse(values({ amountText: '-50' })).success).toBe(false);
  });

  it('rejects an excessively large amount', () => {
    expect(expenseSchema.safeParse(values({ amountText: '99999999999' })).success).toBe(false);
  });

  it('rejects garbage amount text', () => {
    expect(expenseSchema.safeParse(values({ amountText: 'abc' })).success).toBe(false);
    expect(expenseSchema.safeParse(values({ amountText: '' })).success).toBe(false);
  });

  it('rejects an invalid category', () => {
    expect(expenseSchema.safeParse(values({ category: 'NotACategory' })).success).toBe(false);
  });

  it('accepts every category in the controlled set', () => {
    for (const category of ['Food', 'Transportation', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Travel', 'Home', 'Other']) {
      expect(expenseSchema.safeParse(values({ category })).success).toBe(true);
    }
  });

  it('rejects a malformed currency code', () => {
    expect(expenseSchema.safeParse(values({ currency: 'PH' })).success).toBe(false);
    expect(expenseSchema.safeParse(values({ currency: 'PESO' })).success).toBe(false);
    expect(expenseSchema.safeParse(values({ currency: '123' })).success).toBe(false);
  });

  it('normalizes currency to uppercase', () => {
    const result = expenseSchema.safeParse(values({ currency: 'php' }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.currency).toBe('PHP');
  });

  it('accepts optional description and notes', () => {
    expect(expenseSchema.safeParse(values({ description: undefined, notes: undefined })).success).toBe(true);
  });
});
