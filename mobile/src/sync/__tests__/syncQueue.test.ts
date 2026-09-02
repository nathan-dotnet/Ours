import { resetDatabaseHandleForTests } from '../../database/db';
import { syncQueueRepository } from '../syncQueue';

describe('syncQueueRepository', () => {
  beforeEach(() => {
    resetDatabaseHandleForTests();
  });

  it('enqueues a change and it shows up as pending', async () => {
    await syncQueueRepository.enqueue('couple_profile', 'couple-1', 'UPDATE', { nickname: 'Us Two' });

    const pending = await syncQueueRepository.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ entity_type: 'couple_profile', entity_id: 'couple-1', operation: 'UPDATE' });
    expect(JSON.parse(pending[0].payload)).toEqual({ nickname: 'Us Two' });
  });

  it('collapses a second UPDATE for the same entity into the existing row instead of queuing both', async () => {
    await syncQueueRepository.enqueue('couple_profile', 'couple-1', 'UPDATE', { nickname: 'First' });
    await syncQueueRepository.enqueue('couple_profile', 'couple-1', 'UPDATE', { nickname: 'Second' });

    const pending = await syncQueueRepository.getPending();
    expect(pending).toHaveLength(1);
    expect(JSON.parse(pending[0].payload)).toEqual({ nickname: 'Second' });
  });

  it('keeps a queued CREATE as CREATE when an UPDATE follows, but with the newer payload', async () => {
    await syncQueueRepository.enqueue('calendar_event', 'evt-1', 'CREATE', { title: 'Draft' });
    await syncQueueRepository.enqueue('calendar_event', 'evt-1', 'UPDATE', { title: 'Final' });

    const pending = await syncQueueRepository.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].operation).toBe('CREATE');
    expect(JSON.parse(pending[0].payload)).toEqual({ title: 'Final' });
  });

  it('drops the queue entry entirely when a CREATE is followed by a DELETE (never reached the server)', async () => {
    await syncQueueRepository.enqueue('calendar_event', 'evt-1', 'CREATE', { title: 'Draft' });
    await syncQueueRepository.enqueue('calendar_event', 'evt-1', 'DELETE', null);

    const pending = await syncQueueRepository.getPending();
    expect(pending).toHaveLength(0);
  });

  it('markSynced removes the row; markFailed keeps it queued with an incremented retry count', async () => {
    await syncQueueRepository.enqueue('couple_profile', 'couple-1', 'UPDATE', { nickname: 'A' });
    await syncQueueRepository.enqueue('couple_profile', 'couple-2', 'UPDATE', { nickname: 'B' });
    const pendingBefore = await syncQueueRepository.getPending();
    const first = pendingBefore.find((r) => r.entity_id === 'couple-1')!;
    const second = pendingBefore.find((r) => r.entity_id === 'couple-2')!;

    await syncQueueRepository.markSynced(first.id);
    await syncQueueRepository.markFailed(second.id, 'network error');

    const remaining = await syncQueueRepository.getPending();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(second.id);
    expect(remaining[0].retry_count).toBe(1);
    expect(remaining[0].last_error).toBe('network error');
    expect(await syncQueueRepository.countPending()).toBe(1);
  });

  it('a failed row can be re-queued by a fresh edit and becomes pending again', async () => {
    await syncQueueRepository.enqueue('couple_profile', 'couple-1', 'UPDATE', { nickname: 'A' });
    const [row] = await syncQueueRepository.getPending();
    await syncQueueRepository.markFailed(row.id, 'offline');

    await syncQueueRepository.enqueue('couple_profile', 'couple-1', 'UPDATE', { nickname: 'B' });

    const pending = await syncQueueRepository.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe('pending');
    expect(pending[0].last_error).toBeNull();
  });
});
