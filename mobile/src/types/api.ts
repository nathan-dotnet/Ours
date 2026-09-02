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

/** Shape of the "couple_profile" sync payload — mirrors the backend's CoupleProfilePayloadDto. */
export interface CoupleProfilePayload {
  nickname: string | null;
  anniversaryDate: string | null;
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
