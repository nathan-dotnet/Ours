import { resetDatabaseHandleForTests } from '../../database/db';
import { syncQueueRepository } from '../../sync/syncQueue';
import type { CoupleDto } from '../../types/api';
import { coupleRepository } from '../coupleRepository';

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
});
