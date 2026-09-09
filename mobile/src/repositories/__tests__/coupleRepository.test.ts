import { resetDatabaseHandleForTests } from '../../database/db';
import { syncQueueRepository } from '../../sync/syncQueue';
import type { CoupleDto } from '../../types/api';
import { accountRepository } from '../accountRepository';
import { budgetRepository } from '../budgetRepository';
import { calendarEventRepository } from '../calendarEventRepository';
import { coupleRepository } from '../coupleRepository';
import { transactionRepository } from '../transactionRepository';

const accountInput = { name: 'BPI', type: 'Bank', icon: 'bpi', currency: 'PHP', isActive: true };

function transactionInput(accountId: string, overrides: Partial<Parameters<typeof transactionRepository.createLocally>[1]> = {}) {
  return {
    type: 'Expense',
    amountCents: 25000,
    currency: 'PHP',
    accountId,
    category: 'Food',
    description: 'Dinner',
    transactionDate: '2026-01-01',
    notes: null,
    ...overrides,
  };
}

const budgetInput = { category: 'Food', year: 2026, month: 1, amountCents: 500000, currency: 'PHP' };

const serverCouple: CoupleDto = {
  id: 'couple-1',
  inviteCode: 'OURS-TEST',
  nickname: null,
  anniversaryDate: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
  updatedByUserId: 'user-alice',
  version: 1,
  members: [
    { userId: 'user-alice', displayName: 'Alice', joinedAt: '2026-01-01T00:00:00.000Z' },
    { userId: 'user-bob', displayName: 'Bob', joinedAt: '2026-01-02T00:00:00.000Z' },
  ],
};

describe('coupleRepository', () => {
  beforeEach(() => {
    resetDatabaseHandleForTests();
  });

  it('upsertFromServer inserts the couple and both members', async () => {
    await coupleRepository.upsertFromServer(serverCouple);

    const couple = await coupleRepository.getLocalCouple();
    expect(couple).toMatchObject({ id: 'couple-1', invite_code: 'OURS-TEST', version: 1 });

    const members = await coupleRepository.getLocalMembers('couple-1');
    expect(members.map((m) => m.display_name)).toEqual(['Alice', 'Bob']);
  });

  it('upsertFromServer replaces stale membership on a second call rather than duplicating rows', async () => {
    await coupleRepository.upsertFromServer(serverCouple);
    await coupleRepository.upsertFromServer({ ...serverCouple, version: 2, nickname: 'Us Two' });

    const couple = await coupleRepository.getLocalCouple();
    expect(couple?.nickname).toBe('Us Two');
    expect(couple?.version).toBe(2);

    const members = await coupleRepository.getLocalMembers('couple-1');
    expect(members).toHaveLength(2);
  });

  it('updateProfileLocally writes SQLite immediately and queues a sync op', async () => {
    await coupleRepository.upsertFromServer(serverCouple);
    const couple = (await coupleRepository.getLocalCouple())!;

    await coupleRepository.updateProfileLocally(couple, { nickname: 'Us Two', anniversaryDate: '2020-06-15' }, 'user-alice');

    // The UI must be able to read the change back immediately (offline-first: SQLite first, sync later).
    const updated = await coupleRepository.getLocalCouple();
    expect(updated?.nickname).toBe('Us Two');
    expect(updated?.anniversary_date).toBe('2020-06-15');

    const pending = await syncQueueRepository.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ entity_type: 'couple_profile', entity_id: 'couple-1', operation: 'UPDATE' });
    expect(JSON.parse(pending[0].payload)).toEqual({ nickname: 'Us Two', anniversaryDate: '2020-06-15' });
  });

  it('applyRemoteProfileChange mirrors a pulled server change onto the existing local row', async () => {
    await coupleRepository.upsertFromServer(serverCouple);

    await coupleRepository.applyRemoteProfileChange(
      'couple-1',
      { nickname: 'From Partner', anniversaryDate: null },
      '2026-02-01T00:00:00.000Z',
      'user-bob',
      2,
    );

    const couple = await coupleRepository.getLocalCouple();
    expect(couple).toMatchObject({ nickname: 'From Partner', updated_by_user_id: 'user-bob', version: 2 });
  });

  it('applyRemoteProfileChange with a members list adds a partner who just joined — the "waiting for your partner" bug', async () => {
    // Alice's own device, right after she creates the couple: only she is a local member yet.
    await coupleRepository.upsertFromServer({ ...serverCouple, members: [serverCouple.members[0]] });
    expect(await coupleRepository.getLocalMembers('couple-1')).toHaveLength(1);

    // Bob joins; Alice's next sync pull delivers the couple_profile change the server now
    // includes his membership in (see backend SyncService.PullAsync).
    await coupleRepository.applyRemoteProfileChange(
      'couple-1',
      { nickname: null, anniversaryDate: null, members: serverCouple.members },
      '2026-01-02T00:00:00.000Z',
      'user-bob',
      2,
    );

    const members = await coupleRepository.getLocalMembers('couple-1');
    expect(members.map((m) => m.display_name).sort()).toEqual(['Alice', 'Bob']);
  });

  it('applyRemoteProfileChange without a members field leaves existing local membership untouched', async () => {
    // A push-originated echo (e.g. this device's own nickname edit reflected back) never carries
    // members — must not wipe out membership that's already correct locally.
    await coupleRepository.upsertFromServer(serverCouple);

    await coupleRepository.applyRemoteProfileChange('couple-1', { nickname: 'Us Two', anniversaryDate: null }, '2026-02-01T00:00:00.000Z', 'user-alice', 2);

    expect(await coupleRepository.getLocalMembers('couple-1')).toHaveLength(2);
  });

  it('applyRemoteProfileChange with a null payload fully removes the couple (not just the couples row)', async () => {
    await coupleRepository.upsertFromServer(serverCouple);
    await calendarEventRepository.createLocally(
      'couple-1',
      { title: 'Anniversary dinner', description: null, startAt: new Date().toISOString(), endAt: new Date().toISOString(), reminderAt: null },
      'user-alice',
    );
    const account = await accountRepository.createLocally('couple-1', accountInput, 0, 'user-alice');
    await transactionRepository.createLocally('couple-1', transactionInput(account.id), 'user-alice');
    await budgetRepository.createLocally('couple-1', budgetInput, 'user-alice');

    await coupleRepository.applyRemoteProfileChange('couple-1', null, '2026-02-01T00:00:00.000Z', 'user-bob', 2);

    expect(await coupleRepository.getLocalCouple()).toBeNull();
    expect(await coupleRepository.getLocalMembers('couple-1')).toHaveLength(0);
    expect(await calendarEventRepository.getAllForCouple('couple-1')).toHaveLength(0);
    expect(await accountRepository.getAllForCouple('couple-1')).toHaveLength(0);
    expect(await transactionRepository.getAllForCouple('couple-1')).toHaveLength(0);
    expect(await budgetRepository.getForMonth('couple-1', 2026, 1)).toHaveLength(0);
  });

  describe('removeLocalCoupleAndData', () => {
    it('removes the couple, its members, its calendar events, and its Money data (accounts/transactions/budgets)', async () => {
      await coupleRepository.upsertFromServer(serverCouple);
      await calendarEventRepository.createLocally(
        'couple-1',
        { title: 'Dinner', description: null, startAt: new Date().toISOString(), endAt: new Date().toISOString(), reminderAt: null },
        'user-alice',
      );
      const account = await accountRepository.createLocally('couple-1', accountInput, 1000000, 'user-alice');
      await transactionRepository.createLocally('couple-1', transactionInput(account.id, { description: 'Old Couple Dinner' }), 'user-alice');
      await budgetRepository.createLocally('couple-1', budgetInput, 'user-alice');

      await coupleRepository.removeLocalCoupleAndData('couple-1');

      expect(await coupleRepository.getLocalCouple()).toBeNull();
      expect(await coupleRepository.getLocalMembers('couple-1')).toHaveLength(0);
      expect(await calendarEventRepository.getAllForCouple('couple-1')).toHaveLength(0);
      expect(await accountRepository.getAllForCouple('couple-1')).toHaveLength(0);
      expect(await transactionRepository.getAllForCouple('couple-1')).toHaveLength(0);
      expect(await budgetRepository.getForMonth('couple-1', 2026, 1)).toHaveLength(0);
    });

    it('discards any not-yet-synced sync_queue entries for the couple — a pending edit/create must not survive into a future couple', async () => {
      await coupleRepository.upsertFromServer(serverCouple);
      const couple = (await coupleRepository.getLocalCouple())!;
      // A pending couple_profile edit...
      await coupleRepository.updateProfileLocally(couple, { nickname: 'Draft name', anniversaryDate: null }, 'user-alice');
      // ...a calendar event created offline, never synced...
      await calendarEventRepository.createLocally(
        'couple-1',
        { title: 'Never synced', description: null, startAt: new Date().toISOString(), endAt: new Date().toISOString(), reminderAt: null },
        'user-alice',
      );
      // ...an account, a transaction, and a budget, all created offline, never synced.
      const account = await accountRepository.createLocally('couple-1', accountInput, 0, 'user-alice');
      await transactionRepository.createLocally('couple-1', transactionInput(account.id), 'user-alice');
      await budgetRepository.createLocally('couple-1', budgetInput, 'user-alice');
      expect(await syncQueueRepository.countPending()).toBe(5);

      await coupleRepository.removeLocalCoupleAndData('couple-1');

      expect(await syncQueueRepository.countPending()).toBe(0);
    });

    it('never touches a different couple\'s local data', async () => {
      await coupleRepository.upsertFromServer(serverCouple);
      const otherCouple: CoupleDto = {
        ...serverCouple,
        id: 'couple-2',
        inviteCode: 'OURS-OTHER',
        members: [{ userId: 'user-carol', displayName: 'Carol', joinedAt: '2026-01-01T00:00:00.000Z' }],
      };
      await coupleRepository.upsertFromServer(otherCouple);
      await calendarEventRepository.createLocally(
        'couple-2',
        { title: 'Unrelated event', description: null, startAt: new Date().toISOString(), endAt: new Date().toISOString(), reminderAt: null },
        'user-carol',
      );
      const otherAccount = await accountRepository.createLocally('couple-2', { ...accountInput, name: 'GCash' }, 500000, 'user-carol');
      await transactionRepository.createLocally('couple-2', transactionInput(otherAccount.id, { description: 'New Couple Dinner' }), 'user-carol');
      await budgetRepository.createLocally('couple-2', budgetInput, 'user-carol');

      await coupleRepository.removeLocalCoupleAndData('couple-1');

      // getLocalCouple() only ever returns the first non-deleted row, which is fine for this
      // app's "at most one active couple" invariant — read couple-2 directly to confirm survival.
      const survivingMembers = await coupleRepository.getLocalMembers('couple-2');
      expect(survivingMembers).toHaveLength(1);
      expect(await calendarEventRepository.getAllForCouple('couple-2')).toHaveLength(1);
      expect(await accountRepository.getAllForCouple('couple-2')).toHaveLength(1);
      expect(await transactionRepository.getAllForCouple('couple-2')).toHaveLength(1);
      expect(await budgetRepository.getForMonth('couple-2', 2026, 1)).toHaveLength(1);
    });
  });
});
