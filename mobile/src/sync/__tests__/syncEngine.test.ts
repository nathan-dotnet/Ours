import { resetDatabaseHandleForTests } from '../../database/db';
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
});
