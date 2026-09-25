import { useAuthStore } from '../stores/authStore';
import type {
  ApiErrorBody,
  AuthResponseDto,
  CoupleActionResponseDto,
  CoupleDto,
  DistributeMoneyRequestDto,
  DistributeMoneyResponseDto,
  DistributionStatusResponseDto,
  LeaveCoupleResponseDto,
  LoanPaymentRequestDto,
  LoanPaymentResponseDto,
  MessageResponseDto,
  MissMeInteractionKind,
  MissMeSendResponseDto,
  MissMeStatusResponseDto,
  SyncPullResponseDto,
  SyncPushItemDto,
  SyncPushResponseDto,
  VaultRevealResponseDto,
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

/** A request could not be started because the bundled server address is missing or invalid. */
export class ApiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiConfigurationError';
  }
}

/** The device could not obtain an HTTP response from the configured API. */
export class ApiConnectionError extends Error {
  constructor(
    public readonly apiHost: string,
    public readonly cause: unknown,
  ) {
    super(`Could not reach the Ours API at ${apiHost}.`);
    this.name = 'ApiConnectionError';
  }
}

function getApiUrl(): string {
  if (!env.apiUrl) {
    throw new ApiConfigurationError('This app build is missing its server address. Please update the app and try again.');
  }

  let parsed: URL;
  try {
    parsed = new URL(env.apiUrl);
  } catch {
    throw new ApiConfigurationError('This app build has an invalid server address. Please update the app and try again.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ApiConfigurationError('This app build has an unsupported server address. Please update the app and try again.');
  }

  return env.apiUrl;
}

function getApiHost(): string {
  try {
    return new URL(getApiUrl()).host;
  } catch (error) {
    if (error instanceof ApiConfigurationError) throw error;
    return 'the configured server';
  }
}

async function fetchApi(path: string, init: RequestInit): Promise<Response> {
  const apiUrl = getApiUrl();
  try {
    return await fetch(`${apiUrl}${path}`, init);
  } catch (error) {
    throw new ApiConnectionError(getApiHost(), error);
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
  return error instanceof ApiConnectionError;
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
      const response = await fetchApi('/api/auth/refresh', {
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

  const response = await fetchApi(path, {
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

  leaveCouple: () => request<LeaveCoupleResponseDto>('/api/couples/leave', { method: 'POST' }),

  syncPush: (changes: SyncPushItemDto[]) =>
    request<SyncPushResponseDto>('/api/sync/push', { method: 'POST', body: { changes } }),

  syncPull: (since: string | null) =>
    request<SyncPullResponseDto>(`/api/sync/pull${since ? `?since=${encodeURIComponent(since)}` : ''}`),

  /**
   * The one vault action that isn't a sync operation — decrypts a specific item's password
   * server-side and returns it. Requires connectivity by nature (this device never holds the
   * decryption key); see useVaultReveal, which also requires a fresh local biometric/passcode
   * gate before ever calling this.
   */
  revealVaultPassword: (id: string) => request<VaultRevealResponseDto>(`/api/vault/${id}/reveal`, { method: 'POST' }),

  /**
   * Cooldown state, any unanswered Miss Me from the partner, and a short recent history — one
   * call, everything the Home screen needs. Not a synced/cached-offline entity: cooldown state
   * is only ever true as of the server's clock, so this always asks fresh (see useMissMe.ts).
   */
  getMissMeStatus: () => request<MissMeStatusResponseDto>('/api/miss-me/status'),

  /** Sends a MissMe (subject to the server's cooldown) or a MissYouToo reply — always online, never queued, for the same reason revealVaultPassword is. */
  sendMissMe: (type: MissMeInteractionKind, inResponseToId?: string) =>
    request<MissMeSendResponseDto>('/api/miss-me/send', { method: 'POST', body: { type, inResponseToId } }),

  /** Registers this device's Expo push token against the signed-in user — see PushTokensController. */
  registerPushToken: (token: string, platform: string) =>
    request<void>('/api/push-tokens', { method: 'POST', body: { token, platform } }),

  /** Called on logout — see pushNotifications.ts. */
  unregisterPushToken: (token: string) => request<void>('/api/push-tokens', { method: 'DELETE', body: { token } }),

  /** Has this income period already been distributed, plus a short recent history — everything the Calculator screen needs in one call. */
  getDistributionStatus: (year: number, month: number) =>
    request<DistributionStatusResponseDto>(`/api/distributions/status?year=${year}&month=${month}`),

  /** Executes a "Distribute Money" action — always online, never queued, same reasoning as sendMissMe. */
  distributeMoney: (request_: DistributeMoneyRequestDto) =>
    request<DistributeMoneyResponseDto>('/api/distributions', { method: 'POST', body: request_ }),

  /**
   * Records one payment toward a loan — always online, never queued, same reasoning as
   * sendMissMe/distributeMoney (needs the server's synchronous balance/overpayment check).
   * Idempotent on `request_.paymentId` — safe to retry.
   */
  payLoan: (loanId: string, request_: LoanPaymentRequestDto) =>
    request<LoanPaymentResponseDto>(`/api/loans/${loanId}/payments`, { method: 'POST', body: request_ }),

  forgotPassword: (email: string) =>
    request<MessageResponseDto>('/api/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),

  resetPassword: (email: string, token: string, newPassword: string) =>
    request<void>('/api/auth/reset-password', { method: 'POST', body: { email, token, newPassword }, auth: false }),

  /**
   * Exposes the same rotate-or-clear refresh flow `request()` uses internally on a 401, for
   * callers (biometric unlock) that need to validate a restored session against the server
   * before treating it as live — reusing it rather than re-implementing refresh/rotation.
   */
  refreshSession: () => refreshAccessToken(),
};
