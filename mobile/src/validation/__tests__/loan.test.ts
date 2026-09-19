import { loanSchema } from '../loan';

function values(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: 'Shopee PayLater',
    provider: 'Shopee',
    originalAmountText: '10200',
    monthlyPaymentText: '1700',
    totalInstallmentsText: '6',
    firstDueDate: new Date(2026, 8, 15),
    feesAmountText: '',
    ...overrides,
  };
}

describe('loanSchema', () => {
  it('accepts a well-formed loan matching the spec worked example', () => {
    expect(loanSchema.safeParse(values()).success).toBe(true);
  });

  it('accepts a loan with no provider and with fees', () => {
    expect(loanSchema.safeParse(values({ provider: '', feesAmountText: '250' })).success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(loanSchema.safeParse(values({ name: '' })).success).toBe(false);
    expect(loanSchema.safeParse(values({ name: '   ' })).success).toBe(false);
  });

  it('rejects a zero or negative original amount', () => {
    expect(loanSchema.safeParse(values({ originalAmountText: '0' })).success).toBe(false);
    expect(loanSchema.safeParse(values({ originalAmountText: '-100' })).success).toBe(false);
  });

  it('rejects a zero or negative monthly payment', () => {
    expect(loanSchema.safeParse(values({ monthlyPaymentText: '0' })).success).toBe(false);
    expect(loanSchema.safeParse(values({ monthlyPaymentText: '-100' })).success).toBe(false);
  });

  it('rejects zero or non-integer installments', () => {
    expect(loanSchema.safeParse(values({ totalInstallmentsText: '0' })).success).toBe(false);
    expect(loanSchema.safeParse(values({ totalInstallmentsText: '6.5' })).success).toBe(false);
    expect(loanSchema.safeParse(values({ totalInstallmentsText: 'abc' })).success).toBe(false);
  });

  it('rejects a non-Date firstDueDate', () => {
    expect(loanSchema.safeParse(values({ firstDueDate: '2026-09-15' })).success).toBe(false);
    expect(loanSchema.safeParse(values({ firstDueDate: undefined })).success).toBe(false);
  });

  it('rejects an invalid fees amount when provided', () => {
    expect(loanSchema.safeParse(values({ feesAmountText: 'abc' })).success).toBe(false);
  });
});
