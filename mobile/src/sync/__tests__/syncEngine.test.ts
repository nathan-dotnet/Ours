import { resetDatabaseHandleForTests } from '../../database/db';
import { calendarEventRepository } from '../../repositories/calendarEventRepository';
import { coupleRepository } from '../../repositories/coupleRepository';
import { expenseRepository } from '../../repositories/expenseRepository';
import { useAuthStore } from '../../stores/authStore';
import { useSyncStore } from '../../stores/syncStore';
import { runSync } from '../syncEngine';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const sessionWithoutCouple = {
  accessToken: 'token',
  accessTokenExpiresAt: '2026-01-01T00:00:00.000Z',
  refreshToken: 'refresh',
  user: { id: 'user-1', email: 'alice@example.com', displayName: 'Alice', coupleId: null },
};

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe('runSync', () => {
  beforeEach(async () => {
    resetDatabaseHandleForTests();
    useSyncStore.setState({ isOnline: true, status: 'synced', lastSyncedAt: null, pendingCount: 0 });
  });

  it('skips entirely (no network call) when the user has no couple yet', async () => {
    await useAuthStore.getState().setSession(sessionWithoutCouple as never);
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;

    await runSync();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not get stuck after a no-couple skip — a later call (once paired) still runs', async () => {
    await useAuthStore.getState().setSession(sessionWithoutCouple as never);
    global.fetch = jest.fn() as never;
    await runSync(); // the no-couple skip path

    await useAuthStore.getState().setSession({
      ...sessionWithoutCouple,
      user: { ...sessionWithoutCouple.user, coupleId: 'couple-1' },
    } as never);
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ serverTime: '2026-01-01T00:00:00.000Z', changes: [] }));
    global.fetch = fetchMock as never;

    await runSync();

    expect(fetchMock).toHaveBeenCalled();
    expect(useSyncStore.getState().status).toBe('synced');
  });

  it('applies a pulled calendar_event change to SQLite, routed by entity type', async () => {
    const coupleId = 'couple-1';
    await useAuthStore.getState().setSession({
      ...sessionWithoutCouple,
      user: { ...sessionWithoutCouple.user, coupleId },
    } as never);

    const eventId = 'event-1';
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        serverTime: '2026-01-01T00:00:00.000Z',
        changes: [
          {
            entityType: 'calendar_event',
            entityId: eventId,
            operation: 'UPDATE',
            payload: {
              title: 'Movie night',
              description: null,
              startAt: '2026-02-01T20:00:00.000Z',
              endAt: '2026-02-01T22:00:00.000Z',
              reminderAt: null,
              createdByUserId: 'user-bob',
            },
            updatedAt: '2026-01-01T00:00:00.000Z',
            updatedByUserId: 'user-bob',
            version: 1,
          },
        ],
      }),
    ) as never;

    await runSync();

    const stored = await calendarEventRepository.getById(eventId);
    expect(stored).toMatchObject({ title: 'Movie night', couple_id: coupleId, created_by_user_id: 'user-bob' });
  });

  it('pulling our own couple_profile tombstone clears the couple locally and patches the session', async () => {
    const coupleId = 'couple-1';
    await useAuthStore.getState().setSession({
      ...sessionWithoutCouple,
      user: { ...sessionWithoutCouple.user, coupleId },
    } as never);
    await coupleRepository.upsertFromServer({
      id: coupleId,
      inviteCode: 'OURS-TEST',
      nickname: null,
      anniversaryDate: null,
      updatedAt: '2025-12-01T00:00:00.000Z',
      updatedByUserId: 'user-1',
      version: 1,
      members: [{ userId: 'user-1', displayName: 'Alice', joinedAt: '2025-12-01T00:00:00.000Z' }],
    });

    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        serverTime: '2026-01-01T00:00:00.000Z',
        changes: [
          {
            entityType: 'couple_profile',
            entityId: coupleId,
            operation: 'DELETE',
            payload: null,
            updatedAt: '2026-01-01T00:00:00.000Z',
            updatedByUserId: 'user-2',
            version: 2,
          },
        ],
      }),
    ) as never;

    await runSync();

    expect(await coupleRepository.getLocalCouple()).toBeNull();
    expect(useAuthStore.getState().session?.user.coupleId).toBeNull();
  });

  it('applies a pulled expense change to SQLite, converting the decimal payload to exact cents', async () => {
    const coupleId = 'couple-1';
    await useAuthStore.getState().setSession({
      ...sessionWithoutCouple,
      user: { ...sessionWithoutCouple.user, coupleId },
    } as never);

    const expenseId = 'expense-1';
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        serverTime: '2026-01-01T00:00:00.000Z',
        changes: [
          {
            entityType: 'expense',
            entityId: expenseId,
            operation: 'UPDATE',
            payload: {
              amount: 1250.5,
              currency: 'PHP',
              description: 'Groceries',
              category: 'Food',
              expenseDate: '2026-01-15',
              notes: null,
              createdByUserId: 'user-bob',
            },
            updatedAt: '2026-01-01T00:00:00.000Z',
            updatedByUserId: 'user-bob',
            version: 1,
          },
        ],
      }),
    ) as never;

    await runSync();

    const stored = await expenseRepository.getById(expenseId);
    expect(stored).toMatchObject({ amount_cents: 125050, couple_id: coupleId, created_by_user_id: 'user-bob' });
  });

  it('an expense change for the same now-ended couple in the same pull batch is skipped, not resurrected', async () => {
    const coupleId = 'couple-1';
    await useAuthStore.getState().setSession({
      ...sessionWithoutCouple,
      user: { ...sessionWithoutCouple.user, coupleId },
    } as never);
    await coupleRepository.upsertFromServer({
      id: coupleId,
      inviteCode: 'OURS-TEST',
      nickname: null,
      anniversaryDate: null,
      updatedAt: '2025-12-01T00:00:00.000Z',
      updatedByUserId: 'user-1',
      version: 1,
      members: [{ userId: 'user-1', displayName: 'Alice', joinedAt: '2025-12-01T00:00:00.000Z' }],
    });
    const expenseId = 'expense-1';

    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        serverTime: '2026-01-01T00:00:00.000Z',
        changes: [
          {
            entityType: 'couple_profile',
            entityId: coupleId,
            operation: 'DELETE',
            payload: null,
            updatedAt: '2026-01-01T00:00:00.000Z',
            updatedByUserId: 'user-2',
            version: 2,
          },
          {
            entityType: 'expense',
            entityId: expenseId,
            operation: 'UPDATE',
            payload: {
              amount: 100,
              currency: 'PHP',
              description: 'Should not be resurrected',
              category: 'Other',
              expenseDate: '2026-01-15',
              notes: null,
              createdByUserId: 'user-1',
            },
            updatedAt: '2026-01-01T00:00:00.000Z',
            updatedByUserId: 'user-1',
            version: 1,
          },
        ],
      }),
    ) as never;

    await runSync();

    expect(await expenseRepository.getById(expenseId)).toBeNull();
  });

  it('a calendar_event change for the same now-ended couple in the same pull batch is skipped, not resurrected', async () => {
    const coupleId = 'couple-1';
    await useAuthStore.getState().setSession({
      ...sessionWithoutCouple,
      user: { ...sessionWithoutCouple.user, coupleId },
    } as never);
    await coupleRepository.upsertFromServer({
      id: coupleId,
      inviteCode: 'OURS-TEST',
      nickname: null,
      anniversaryDate: null,
      updatedAt: '2025-12-01T00:00:00.000Z',
      updatedByUserId: 'user-1',
      version: 1,
      members: [{ userId: 'user-1', displayName: 'Alice', joinedAt: '2025-12-01T00:00:00.000Z' }],
    });
    const eventId = 'event-1';

    // The couple tombstone is listed first, exactly as the backend always orders it, followed by
    // a calendar event that (per the removed local data) no longer has anywhere to go.
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        serverTime: '2026-01-01T00:00:00.000Z',
        changes: [
          {
            entityType: 'couple_profile',
            entityId: coupleId,
            operation: 'DELETE',
            payload: null,
            updatedAt: '2026-01-01T00:00:00.000Z',
            updatedByUserId: 'user-2',
            version: 2,
          },
          {
            entityType: 'calendar_event',
            entityId: eventId,
            operation: 'UPDATE',
            payload: {
              title: 'Should not be resurrected',
              description: null,
              startAt: '2026-02-01T20:00:00.000Z',
              endAt: '2026-02-01T22:00:00.000Z',
              reminderAt: null,
              createdByUserId: 'user-1',
            },
            updatedAt: '2026-01-01T00:00:00.000Z',
            updatedByUserId: 'user-1',
            version: 1,
          },
        ],
      }),
    ) as never;

    await runSync();

    expect(await calendarEventRepository.getById(eventId)).toBeNull();
  });
});
