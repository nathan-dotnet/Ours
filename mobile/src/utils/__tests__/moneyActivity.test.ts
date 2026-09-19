import type { Account, Transaction } from '../../types/entities';
import { describeTransaction, getRecentActivity } from '../moneyActivity';

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'account-1',
    couple_id: 'couple-1',
    name: 'BPI',
    type: 'Bank',
    icon: 'bpi',
    opening_balance_cents: 1_000_000,
    currency: 'PHP',
    is_active: 1,
    created_by_user_id: 'user-1',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    updated_by_user_id: 'user-1',
    version: 1,
    is_deleted: 0,
    ...overrides,
  };
}

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    couple_id: 'couple-1',
    type: 'Expense',
    amount_cents: 50_000,
    currency: 'PHP',
    account_id: 'account-1',
    destination_account_id: null,
    category: 'Food',
    savings_goal_id: null,
    loan_id: null,
    description: 'Dinner',
    transaction_date: '2026-09-03',
    notes: null,
    paid_by_user_id: null,
    created_by_user_id: 'user-1',
    created_at: '2026-09-03T12:00:00.000Z',
    updated_at: '2026-09-03T12:00:00.000Z',
    updated_by_user_id: 'user-1',
    version: 1,
    is_deleted: 0,
    ...overrides,
  };
}

describe('getRecentActivity', () => {
  it('merges accounts and transactions, sorted newest first by created_at', () => {
    const oldAccount = account({ id: 'a1', created_at: '2026-09-01T00:00:00.000Z' });
    const newTransaction = transaction({ id: 't1', created_at: '2026-09-03T00:00:00.000Z' });
    const newestAccount = account({ id: 'a2', created_at: '2026-09-04T00:00:00.000Z' });

    const activity = getRecentActivity([oldAccount, newestAccount], [newTransaction]);

    expect(activity.map((item) => item.id)).toEqual(['a2', 't1', 'a1']);
  });

  it('never represents an account as a transaction (no Income/Expense row for opening balance)', () => {
    const activity = getRecentActivity([account()], []);
    expect(activity[0].kind).toBe('account_created');
    expect(activity.some((item) => item.kind === 'transaction')).toBe(false);
  });

  it('respects the limit', () => {
    const accounts = Array.from({ length: 5 }, (_, i) => account({ id: `a${i}`, created_at: `2026-09-0${i + 1}T00:00:00.000Z` }));
    expect(getRecentActivity(accounts, [], 3)).toHaveLength(3);
  });
});

describe('describeTransaction', () => {
  const bpi = account({ id: 'bpi', name: 'BPI' });
  const cash = account({ id: 'cash', name: 'Cash' });

  it('describes an expense as negative with category + account in the subtitle', () => {
    const description = describeTransaction(transaction({ type: 'Expense', category: 'Food', account_id: 'bpi' }), [bpi, cash]);
    expect(description.isNegative).toBe(true);
    expect(description.amountText).toBe('-');
    expect(description.subtitle).toContain('BPI');
  });

  it('describes income as positive', () => {
    const description = describeTransaction(transaction({ type: 'Income', category: 'Salary', account_id: 'bpi' }), [bpi, cash]);
    expect(description.isNegative).toBe(false);
    expect(description.amountText).toBe('+');
  });

  it('describes a transfer from its source perspective by default (no duplicate rows for one transfer)', () => {
    const description = describeTransaction(
      transaction({ type: 'Transfer', category: null, account_id: 'bpi', destination_account_id: 'cash' }),
      [bpi, cash],
    );
    expect(description.title).toBe('Transfer to Cash');
    expect(description.subtitle).toBe('BPI');
    expect(description.isNegative).toBe(true);
  });

  it('frames a transfer as outgoing (↗) when viewed from the source account\'s own perspective', () => {
    const description = describeTransaction(
      transaction({ type: 'Transfer', category: null, account_id: 'bpi', destination_account_id: 'cash' }),
      [bpi, cash],
      'bpi',
    );
    expect(description.icon).toBe('↗');
    expect(description.isNegative).toBe(true);
  });

  it('frames a transfer as incoming (↙) when viewed from the destination account\'s own perspective', () => {
    const description = describeTransaction(
      transaction({ type: 'Transfer', category: null, account_id: 'bpi', destination_account_id: 'cash' }),
      [bpi, cash],
      'cash',
    );
    expect(description.icon).toBe('↙');
    expect(description.title).toBe('Transfer from BPI');
    expect(description.isNegative).toBe(false);
  });
});
