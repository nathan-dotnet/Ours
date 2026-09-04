import { resetDatabaseHandleForTests } from '../../database/db';
import { syncQueueRepository } from '../../sync/syncQueue';
import { accountRepository } from '../accountRepository';

const COUPLE_ID = 'couple-1';
const USER_ID = 'user-alice';

function input(overrides: Partial<Parameters<typeof accountRepository.createLocally>[1]> = {}) {
  return { name: 'BPI', type: 'Bank', icon: 'bpi', currency: 'PHP', isActive: true, ...overrides };
}

describe('accountRepository', () => {
  beforeEach(() => {
    resetDatabaseHandleForTests();
  });

  it('createLocally writes SQLite immediately with the opening balance, and queues a CREATE sync op', async () => {
    const account = await accountRepository.createLocally(COUPLE_ID, input(), 1_000_000, USER_ID);

    const stored = await accountRepository.getById(account.id);
    expect(stored).toMatchObject({ name: 'BPI', type: 'Bank', opening_balance_cents: 1_000_000, couple_id: COUPLE_ID, is_active: 1, version: 1 });

    const pending = await syncQueueRepository.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ entity_type: 'account', entity_id: account.id, operation: 'CREATE' });
    expect(JSON.parse(pending[0].payload)).toMatchObject({ name: 'BPI', openingBalance: 10000 });
  });

  it('does not create an artificial transaction for the starting balance', async () => {
    const account = await accountRepository.createLocally(COUPLE_ID, input(), 1_000_000, USER_ID);
    // Only the account CREATE is queued — nothing else, and definitely no transaction row.
    const pending = await syncQueueRepository.getPending();
    expect(pending.filter((p) => p.entity_type === 'money_transaction')).toHaveLength(0);
    expect(account).not.toHaveProperty('transactionId');
  });

  it('supports an unlimited number of accounts for one couple — no artificial cap anywhere in the repository', async () => {
    const names = ['BPI', 'GCash', 'MariBank', 'Cash', 'BDO', 'Maya', 'UnionBank', 'CIMB', 'Emergency Fund'];
    for (const name of names) {
      await accountRepository.createLocally(COUPLE_ID, input({ name }), 0, USER_ID);
    }

    const accounts = await accountRepository.getAllForCouple(COUPLE_ID);

    expect(accounts).toHaveLength(names.length);
  });

  it('getAllForCouple returns only that couple\'s non-deleted accounts', async () => {
    const mine = await accountRepository.createLocally(COUPLE_ID, input(), 0, USER_ID);
    await accountRepository.createLocally('some-other-couple', input({ name: 'Not mine' }), 0, USER_ID);

    const accounts = await accountRepository.getAllForCouple(COUPLE_ID);

    expect(accounts.map((a) => a.id)).toEqual([mine.id]);
  });

  it('getActiveForCouple excludes deactivated accounts', async () => {
    const active = await accountRepository.createLocally(COUPLE_ID, input({ name: 'Active' }), 0, USER_ID);
    const inactiveInput = input({ name: 'Inactive', isActive: false });
    await accountRepository.createLocally(COUPLE_ID, inactiveInput, 0, USER_ID);

    const accounts = await accountRepository.getActiveForCouple(COUPLE_ID);

    expect(accounts.map((a) => a.id)).toEqual([active.id]);
  });

  it('updateLocally changes editable fields but never the opening balance', async () => {
    const account = await accountRepository.createLocally(COUPLE_ID, input(), 1_000_000, USER_ID);
    const [createRow] = await syncQueueRepository.getPending();
    await syncQueueRepository.markSynced(createRow.id);

    await accountRepository.updateLocally(account, input({ name: 'BPI Savings' }), USER_ID);

    const updated = await accountRepository.getById(account.id);
    expect(updated).toMatchObject({ name: 'BPI Savings', opening_balance_cents: 1_000_000 });

    const pending = await syncQueueRepository.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ entity_type: 'account', operation: 'UPDATE' });
  });

  it('updateLocally with isActive: false deactivates the account', async () => {
    const account = await accountRepository.createLocally(COUPLE_ID, input(), 0, USER_ID);

    await accountRepository.updateLocally(account, input({ isActive: false }), USER_ID);

    expect(await accountRepository.getById(account.id)).toMatchObject({ is_active: 0 });
  });

  it('there is no deleteLocally — deactivation is the only way to retire an account', () => {
    expect((accountRepository as Record<string, unknown>).deleteLocally).toBeUndefined();
  });

  it('applyRemoteChange inserts a new account from the partner, converting the decimal opening balance to exact cents', async () => {
    await accountRepository.applyRemoteChange(
      COUPLE_ID,
      'partner-account-1',
      { name: 'GCash', type: 'EWallet', icon: 'gcash', openingBalance: 1250.5, currency: 'PHP', isActive: true },
      new Date().toISOString(),
      'user-bob',
      1,
    );

    const stored = await accountRepository.getById('partner-account-1');
    expect(stored).toMatchObject({ name: 'GCash', opening_balance_cents: 125050, couple_id: COUPLE_ID });
  });

  it('applyRemoteChange on an existing account updates fields but never re-applies the opening balance', async () => {
    const account = await accountRepository.createLocally(COUPLE_ID, input(), 1_000_000, USER_ID);

    await accountRepository.applyRemoteChange(
      COUPLE_ID,
      account.id,
      { name: 'BPI Renamed', type: 'Bank', icon: 'bpi', openingBalance: 999_999, currency: 'PHP', isActive: true },
      new Date().toISOString(),
      'user-bob',
      2,
    );

    const stored = await accountRepository.getById(account.id);
    expect(stored).toMatchObject({ name: 'BPI Renamed', opening_balance_cents: 1_000_000, version: 2 });
  });
});
