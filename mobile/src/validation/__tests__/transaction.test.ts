import { expenseTransactionSchema, incomeTransactionSchema, transferTransactionSchema } from '../transaction';

describe('expenseTransactionSchema', () => {
  function values(overrides: Partial<Record<string, unknown>> = {}) {
    return { amountText: '500', category: 'Food', accountId: 'account-1', description: '', transactionDate: new Date(), notes: '', paidByUserId: null, ...overrides };
  }

  it('accepts a well-formed expense', () => {
    expect(expenseTransactionSchema.safeParse(values()).success).toBe(true);
  });

  it('rejects a zero or negative amount', () => {
    expect(expenseTransactionSchema.safeParse(values({ amountText: '0' })).success).toBe(false);
    expect(expenseTransactionSchema.safeParse(values({ amountText: '-50' })).success).toBe(false);
  });

  it('rejects an excessive amount', () => {
    expect(expenseTransactionSchema.safeParse(values({ amountText: '99999999999' })).success).toBe(false);
  });

  it('accepts a custom category not in the preset list — an open vocabulary, same as the backend', () => {
    expect(expenseTransactionSchema.safeParse(values({ category: 'Date Night' })).success).toBe(true);
  });

  it('rejects an empty or over-length category', () => {
    expect(expenseTransactionSchema.safeParse(values({ category: '' })).success).toBe(false);
    expect(expenseTransactionSchema.safeParse(values({ category: 'x'.repeat(31) })).success).toBe(false);
  });

  it('requires an account to be chosen', () => {
    expect(expenseTransactionSchema.safeParse(values({ accountId: '' })).success).toBe(false);
  });
});

describe('incomeTransactionSchema', () => {
  function values(overrides: Partial<Record<string, unknown>> = {}) {
    return { amountText: '20000', category: 'Salary', accountId: 'account-1', description: '', transactionDate: new Date(), notes: '', ...overrides };
  }

  it('accepts a well-formed income', () => {
    expect(incomeTransactionSchema.safeParse(values()).success).toBe(true);
  });

  it('rejects an expense-only category', () => {
    expect(incomeTransactionSchema.safeParse(values({ category: 'Food' })).success).toBe(false);
  });
});

describe('transferTransactionSchema', () => {
  function values(overrides: Partial<Record<string, unknown>> = {}) {
    return { amountText: '2000', accountId: 'bpi', destinationAccountId: 'cash', transactionDate: new Date(), notes: '', ...overrides };
  }

  it('accepts a well-formed transfer', () => {
    expect(transferTransactionSchema.safeParse(values()).success).toBe(true);
  });

  it('accepts any pair of accounts — the destination is never restricted to a specific account like Cash', () => {
    expect(transferTransactionSchema.safeParse(values({ accountId: 'maribank', destinationAccountId: 'gcash' })).success).toBe(true);
    expect(transferTransactionSchema.safeParse(values({ accountId: 'bpi', destinationAccountId: 'maribank' })).success).toBe(true);
    expect(transferTransactionSchema.safeParse(values({ accountId: 'gcash', destinationAccountId: 'cash' })).success).toBe(true);
  });

  it('rejects a transfer to the same account', () => {
    const result = transferTransactionSchema.safeParse(values({ accountId: 'bpi', destinationAccountId: 'bpi' }));
    expect(result.success).toBe(false);
  });

  it('rejects a zero amount', () => {
    expect(transferTransactionSchema.safeParse(values({ amountText: '0' })).success).toBe(false);
  });

  it('requires both a source and destination account', () => {
    expect(transferTransactionSchema.safeParse(values({ accountId: '' })).success).toBe(false);
    expect(transferTransactionSchema.safeParse(values({ destinationAccountId: '' })).success).toBe(false);
  });
});
