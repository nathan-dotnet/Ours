import { resetDatabaseHandleForTests } from '../../database/db';
import { syncQueueRepository } from '../../sync/syncQueue';
import type { CoupleDto } from '../../types/api';
import { calendarEventRepository } from '../calendarEventRepository';
import { coupleRepository } from '../coupleRepository';
import { expenseRepository } from '../expenseRepository';

function expenseInput(overrides: Partial<Parameters<typeof expenseRepository.createLocally>[1]> = {}) {
  return { amountCents: 25000, currency: 'PHP', description: 'Dinner', category: 'Food', expenseDate: '2026-01-01', notes: null, ...overrides };
}

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

  it('applyRemoteProfileChange with a null payload fully removes the couple (not just the couples row)', async () => {
    await coupleRepository.upsertFromServer(serverCouple);
    await calendarEventRepository.createLocally(
      'couple-1',
      { title: 'Anniversary dinner', description: null, startAt: new Date().toISOString(), endAt: new Date().toISOString(), reminderAt: null },
      'user-alice',
    );
    await expenseRepository.createLocally('couple-1', expenseInput(), 'user-alice');

    await coupleRepository.applyRemoteProfileChange('couple-1', null, '2026-02-01T00:00:00.000Z', 'user-bob', 2);

    expect(await coupleRepository.getLocalCouple()).toBeNull();
    expect(await coupleRepository.getLocalMembers('couple-1')).toHaveLength(0);
    expect(await calendarEventRepository.getAllForCouple('couple-1')).toHaveLength(0);
    expect(await expenseRepository.getAllForCouple('couple-1')).toHaveLength(0);
  });

  describe('removeLocalCoupleAndData', () => {
    it('removes the couple, its members, its calendar events, and its expenses', async () => {
      await coupleRepository.upsertFromServer(serverCouple);
      await calendarEventRepository.createLocally(
        'couple-1',
        { title: 'Dinner', description: null, startAt: new Date().toISOString(), endAt: new Date().toISOString(), reminderAt: null },
        'user-alice',
      );
      await expenseRepository.createLocally('couple-1', expenseInput({ description: 'Old Couple Dinner' }), 'user-alice');

      await coupleRepository.removeLocalCoupleAndData('couple-1');

      expect(await coupleRepository.getLocalCouple()).toBeNull();
      expect(await coupleRepository.getLocalMembers('couple-1')).toHaveLength(0);
      expect(await calendarEventRepository.getAllForCouple('couple-1')).toHaveLength(0);
      expect(await expenseRepository.getAllForCouple('couple-1')).toHaveLength(0);
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
      // ...and an expense created offline, never synced.
      await expenseRepository.createLocally('couple-1', expenseInput(), 'user-alice');
      expect(await syncQueueRepository.countPending()).toBe(3);

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
      await expenseRepository.createLocally('couple-2', expenseInput({ description: 'New Couple Dinner' }), 'user-carol');

      await coupleRepository.removeLocalCoupleAndData('couple-1');

      // getLocalCouple() only ever returns the first non-deleted row, which is fine for this
      // app's "at most one active couple" invariant — read couple-2 directly to confirm survival.
      const survivingMembers = await coupleRepository.getLocalMembers('couple-2');
      expect(survivingMembers).toHaveLength(1);
      expect(await calendarEventRepository.getAllForCouple('couple-2')).toHaveLength(1);
      expect(await expenseRepository.getAllForCouple('couple-2')).toHaveLength(1);
    });
  });
});
