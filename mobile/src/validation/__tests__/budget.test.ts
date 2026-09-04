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

  it('rejects an invalid category', () => {
    expect(budgetSchema.safeParse(values({ category: 'NotACategory' })).success).toBe(false);
  });

  it('rejects an income-only category (budgets are always for expense categories)', () => {
    expect(budgetSchema.safeParse(values({ category: 'Salary' })).success).toBe(false);
  });
});
