import { useAuthStore } from '../stores/authStore';
import type {
  ApiErrorBody,
  AuthResponseDto,
  CoupleActionResponseDto,
  CoupleDto,
  SyncPullResponseDto,
  SyncPushItemDto,
  SyncPushResponseDto,
} from '../types/api';
import { env } from '../utils/env';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * True for network failures (no response at all) — the signal callers use to decide "go
 * offline", vs. a real server error. `request()` below only ever throws ApiError for an actual
 * HTTP response; anything else reaching a caller's catch block is a connectivity failure by
 * construction, whatever shape it takes. That's deliberately not "error instanceof TypeError" —
 * that only holds for the web `fetch`; React Native's throws a plain Error (e.g. "fetch failed:
 * java.net.ConnectException: ...") for the exact same condition.
 */
export function isNetworkError(error: unknown): boolean {
  return !(error instanceof ApiError);
}

// Only one refresh should ever be in flight — concurrent 401s (a foreground request racing the
// sync engine, say) all await this same promise instead of each spending their own refresh token.
let refreshInFlight: Promise<AuthResponseDto> | null = null;

async function refreshAccessToken(): Promise<AuthResponseDto> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const session = useAuthStore.getState().session;
      if (!session) {
        throw new ApiError(401, 'Not authenticated.');
      }
      const response = await fetch(`${env.apiUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      if (!response.ok) {
        await useAuthStore.getState().clearSession();
        throw new ApiError(response.status, 'Session expired. Please log in again.');
      }
      const auth = (await response.json()) as AuthResponseDto;
      await useAuthStore.getState().updateTokens(auth);
      return auth;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean; // defaults to true
}

async function request<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (auth) {
    const session = useAuthStore.getState().session;
    if (session) {
      headers.Authorization = `Bearer ${session.accessToken}`;
    }
  }

  const response = await fetch(`${env.apiUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && auth && !isRetry && path !== '/api/auth/refresh') {
    await refreshAccessToken();
    return request<T>(path, options, true);
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const errorBody = (await response.json()) as ApiErrorBody;
      if (errorBody?.error) message = errorBody.error;
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const api = {
  register: (email: string, password: string, displayName: string) =>
    request<AuthResponseDto>('/api/auth/register', { method: 'POST', body: { email, password, displayName }, auth: false }),

  login: (email: string, password: string) =>
    request<AuthResponseDto>('/api/auth/login', { method: 'POST', body: { email, password }, auth: false }),

  logout: (refreshToken: string) =>
    request<void>('/api/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }),

  createCouple: () => request<CoupleActionResponseDto>('/api/couples', { method: 'POST' }),

  joinCouple: (inviteCode: string) =>
    request<CoupleActionResponseDto>('/api/couples/join', { method: 'POST', body: { inviteCode } }),

  getMyCouple: () => request<CoupleDto>('/api/couples/me'),

  syncPush: (changes: SyncPushItemDto[]) =>
    request<SyncPushResponseDto>('/api/sync/push', { method: 'POST', body: { changes } }),

  syncPull: (since: string | null) =>
    request<SyncPullResponseDto>(`/api/sync/pull${since ? `?since=${encodeURIComponent(since)}` : ''}`),
};
