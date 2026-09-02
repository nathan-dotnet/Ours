import { useAuthStore } from '../../stores/authStore';
import { ApiError, api, isNetworkError } from '../api';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const baseSession = {
  accessToken: 'expired-token',
  accessTokenExpiresAt: '2026-01-01T00:00:00.000Z',
  refreshToken: 'refresh-token',
  user: { id: 'user-1', email: 'alice@example.com', displayName: 'Alice', coupleId: null },
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('isNetworkError', () => {
  it('treats a TypeError (fetch failure) as a network error', () => {
    expect(isNetworkError(new TypeError('Network request failed'))).toBe(true);
  });

  it('does not treat an ApiError as a network error', () => {
    expect(isNetworkError(new ApiError(500, 'boom'))).toBe(false);
  });
});

describe('api request 401 handling', () => {
  beforeEach(async () => {
    await useAuthStore.getState().setSession(baseSession as never);
  });

  it('refreshes once on a 401 and retries the original request with the new token', async () => {
    const newAuth = { ...baseSession, accessToken: 'fresh-token' };
    const fetchMock = jest
      .fn()
      // GET /api/couples/me -> 401 with the stale token
      .mockResolvedValueOnce(jsonResponse(401, { error: 'expired' }))
      // POST /api/auth/refresh -> succeeds
      .mockResolvedValueOnce(jsonResponse(200, newAuth))
      // retried GET /api/couples/me -> succeeds
      .mockResolvedValueOnce(jsonResponse(200, { id: 'couple-1' }));
    global.fetch = fetchMock as never;

    const result = await api.getMyCouple();

    expect(result).toEqual({ id: 'couple-1' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // The retried request must carry the freshly-refreshed token, not the stale one.
    const retriedCallHeaders = (fetchMock.mock.calls[2][1] as RequestInit).headers as Record<string, string>;
    expect(retriedCallHeaders.Authorization).toBe('Bearer fresh-token');
  });

  it('clears the session when the refresh itself fails', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(401, { error: 'refresh token invalid' }));
    global.fetch = fetchMock as never;

    await expect(api.getMyCouple()).rejects.toBeInstanceOf(ApiError);
    expect(useAuthStore.getState().session).toBeNull();
  });
});
