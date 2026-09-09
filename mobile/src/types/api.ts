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
  /**
   * Server-authoritative current membership — only ever present on a *pulled* change (the server
   * populates it in SyncService.PullAsync; a push never sets or needs it). This is what lets a
   * partner's device learn "someone joined" at all, since a join is otherwise invisible to it —
   * see coupleRepository.applyRemoteProfileChange.
   */
  members?: CoupleMemberDto[];
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
 * Shape of the "account" sync payload — mirrors the backend's AccountPayloadDto.
 * `openingBalance` is a plain decimal JSON number, like every money amount on the wire (exact on
 * the backend; see utils/money.ts for the mobile-side integer-cents conversion). Only ever
 * applied on first CREATE — an UPDATE payload still carries it, but the repository/backend both
 * ignore it thereafter; see accountRepository.ts.
 */
export interface AccountPayload {
  name: string;
  type: string;
  icon: string;
  openingBalance: number;
  currency: string;
  isActive: boolean;
}

/** Shape of the "money_transaction" sync payload — mirrors the backend's TransactionPayloadDto. */
export interface TransactionPayload {
  type: string; // 'Expense' | 'Income' | 'Transfer'
  amount: number;
  currency: string;
  accountId: string;
  destinationAccountId?: string | null;
  category?: string | null;
  description: string | null;
  transactionDate: string; // ISO date (YYYY-MM-DD)
  notes: string | null;
  paidByUserId?: string | null;
  /** Only ever present on a pulled change — the server sets it, a push never needs to. */
  createdByUserId?: string;
}

/** Shape of the "budget" sync payload — mirrors the backend's BudgetPayloadDto. */
export interface BudgetPayload {
  category: string;
  year: number;
  month: number;
  amount: number;
  currency: string;
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
