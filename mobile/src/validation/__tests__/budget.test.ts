import { budgetSchema } from '../budget';

function values(overrides: Partial<Record<string, unknown>> = {}) {
  return { category: 'Food', amountText: '5000', ...overrides };
}

describe('budgetSchema', () => {
  it('accepts a well-formed budget', () => {
    expect(budgetSchema.safeParse(values()).success).toBe(true);
  });

  it('rejects a zero or negative amount', () => {
    expect(budgetSchema.safeParse(values({ amountText: '0' })).success).toBe(false);
    expect(budgetSchema.safeParse(values({ amountText: '-100' })).success).toBe(false);
  });

  it('accepts a custom category not in the preset list — an open vocabulary, same as the backend', () => {
    expect(budgetSchema.safeParse(values({ category: 'Date Night' })).success).toBe(true);
  });

  it('rejects an empty category', () => {
    expect(budgetSchema.safeParse(values({ category: '' })).success).toBe(false);
    expect(budgetSchema.safeParse(values({ category: '   ' })).success).toBe(false);
  });

  it('rejects a category over the 30-character limit (mirrors the backend column)', () => {
    expect(budgetSchema.safeParse(values({ category: 'x'.repeat(31) })).success).toBe(false);
    expect(budgetSchema.safeParse(values({ category: 'x'.repeat(30) })).success).toBe(true);
  });
});
