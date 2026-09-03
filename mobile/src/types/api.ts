/** Wire types mirroring the backend's DTOs (Ours.Application/DTOs). Keep field names/casing in sync with the API. */

export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  coupleId: string | null;
}

export interface AuthResponseDto {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  user: UserDto;
}

export interface CoupleMemberDto {
  userId: string;
  displayName: string;
  joinedAt: string;
}

export interface CoupleDto {
  id: string;
  inviteCode: string;
  nickname: string | null;
  anniversaryDate: string | null;
  updatedAt: string;
  updatedByUserId: string;
  version: number;
  members: CoupleMemberDto[];
}

export interface CoupleActionResponseDto {
  couple: CoupleDto;
  auth: AuthResponseDto;
}

export interface LeaveCoupleResponseDto {
  success: boolean;
  /** False when the caller wasn't in an active couple to begin with — an idempotent no-op, not an error. */
  left: boolean;
}

/** Shape of the "couple_profile" sync payload — mirrors the backend's CoupleProfilePayloadDto. */
export interface CoupleProfilePayload {
  nickname: string | null;
  anniversaryDate: string | null;
}

/** Shape of the "calendar_event" sync payload — mirrors the backend's CalendarEventPayloadDto. */
export interface CalendarEventPayload {
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  // Optional on the wire type (rather than required) so a payload constructed before these
  // fields existed — an older queued sync_queue row, or a test written before this migration —
  // still type-checks and applies with sensible defaults; see applyRemoteChange/toPayload.
  allDay?: boolean;
  location?: string | null;
  reminderAt: string | null;
  /** Only ever present on a pulled change — the server sets it, a push never needs to. */
  createdByUserId?: string;
}

/**
 * Shape of the "expense" sync payload — mirrors the backend's ExpensePayloadDto. `amount` is a
 * plain decimal JSON number on the wire (exact on the backend, which parses/serializes it as
 * `decimal` directly); see utils/money.ts for how the mobile side converts it to/from integer
 * cents without ever going through a lossy floating-point sum.
 */
export interface ExpensePayload {
  amount: number;
  currency: string;
  description: string | null;
  category: string;
  expenseDate: string; // ISO date (YYYY-MM-DD)
  notes: string | null;
  paidByUserId?: string | null;
  /** Only ever present on a pulled change — the server sets it, a push never needs to. */
  createdByUserId?: string;
}

export type SyncOperationDto = 'CREATE' | 'UPDATE' | 'DELETE';

export interface SyncPushItemDto {
  entityType: string;
  entityId: string;
  operation: SyncOperationDto;
  payload: unknown;
  clientUpdatedAt: string;
}

export interface SyncPushResultItemDto {
  entityId: string;
  entityType: string;
  accepted: boolean;
  error: string | null;
  serverVersion: number | null;
  serverUpdatedAt: string | null;
}

export interface SyncPushResponseDto {
  results: SyncPushResultItemDto[];
}

export interface SyncChangeDto {
  entityType: string;
  entityId: string;
  operation: SyncOperationDto;
  payload: unknown;
  updatedAt: string;
  updatedByUserId: string;
  version: number;
}

export interface SyncPullResponseDto {
  serverTime: string;
  changes: SyncChangeDto[];
}

export interface ApiErrorBody {
  error: string;
}

export interface MessageResponseDto {
  message: string;
}
