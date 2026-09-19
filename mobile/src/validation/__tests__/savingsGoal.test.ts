import { savingsGoalSchema } from '../savingsGoal';

function values(overrides: Partial<Record<string, unknown>> = {}) {
  return { name: 'Emergency Fund', targetAmountText: '50000', allocationPercentText: '', ...overrides };
}

describe('savingsGoalSchema', () => {
  it('accepts a well-formed goal with no automatic allocation', () => {
    expect(savingsGoalSchema.safeParse(values()).success).toBe(true);
  });

  it('accepts a goal with an allocation percentage', () => {
    expect(savingsGoalSchema.safeParse(values({ allocationPercentText: '30' })).success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(savingsGoalSchema.safeParse(values({ name: '' })).success).toBe(false);
    expect(savingsGoalSchema.safeParse(values({ name: '   ' })).success).toBe(false);
  });

  it('rejects a zero or negative target amount', () => {
    expect(savingsGoalSchema.safeParse(values({ targetAmountText: '0' })).success).toBe(false);
    expect(savingsGoalSchema.safeParse(values({ targetAmountText: '-100' })).success).toBe(false);
  });

  it('rejects an invalid allocation percentage', () => {
    expect(savingsGoalSchema.safeParse(values({ allocationPercentText: '150' })).success).toBe(false);
    expect(savingsGoalSchema.safeParse(values({ allocationPercentText: 'abc' })).success).toBe(false);
  });
});
