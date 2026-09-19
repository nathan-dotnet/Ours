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
  /** This member's own self-reported monthly income — null until they've entered one. */
  monthlyIncome: number | null;
  /** This member's own share (0-100) of the couple's Wants allocation — e.g. "Mine 12%, hers 8%" of a 20% Wants bucket. Null until configured. */
  wantsAllocationPercent: number | null;
  /** Where this member's Wants share is credited on Distribute Money. Null until configured. */
  wantsAccountId: string | null;
}

export interface CoupleDto {
  id: string;
  inviteCode: string;
  nickname: string | null;
  anniversaryDate: string | null;
  budgetAllocationPercent: number | null;
  savingsAllocationPercent: number | null;
  wantsAllocationPercent: number | null;
  budgetAccountId: string | null;
  savingsAccountId: string | null;
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

/** One member's Wants share, as pushed in a couple_profile change — mirrors MemberWantsAllocationInputDto. */
export interface MemberWantsAllocationInput {
  userId: string;
  wantsAllocationPercent?: number | null;
  wantsAccountId?: string | null;
}

/** Shape of the "couple_profile" sync payload — mirrors the backend's CoupleProfilePayloadDto. */
export interface CoupleProfilePayload {
  nickname: string | null;
  anniversaryDate: string | null;
  /** The couple's saved default income-allocation plan — see the Money Calculator and Couple.budget_allocation_percent etc. All five null until saved once. */
  budgetAllocationPercent?: number | null;
  savingsAllocationPercent?: number | null;
  wantsAllocationPercent?: number | null;
  budgetAccountId?: string | null;
  savingsAccountId?: string | null;
  /**
   * Push-only, self-scoped: applied to the caller's own CoupleMember row, never the partner's —
   * see coupleRepository.ts. Absent on a pull; each member's income is already carried
   * per-member in `members` there instead.
   */
  myMonthlyIncome?: number | null;
  /**
   * Push-only, joint (NOT self-scoped): planning the whole Wants split is one action typically
   * done from a single device in one sitting, so this can set either/both members' share and
   * account at once — see coupleRepository.ts's updateProfileLocally. Absent on a pull; each
   * member's Wants share is already carried per-member in `members` there instead.
   */
  memberWantsAllocations?: MemberWantsAllocationInput[];
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
  /** Only for SavingsContribution/SavingsWithdrawal — which goal this movement is credited to/debited from. */
  savingsGoalId?: string | null;
  /** Only for LoanPayment — which loan this payment reduces. In practice a client never pushes a LoanPayment directly (system-generated only, via POST /api/loans/{id}/payments); this only ever arrives on a pull. */
  loanId?: string | null;
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

/** Shape of the "savings_goal" sync payload — mirrors the backend's SavingsGoalPayloadDto. */
export interface SavingsGoalPayload {
  name: string;
  targetAmount: number;
  currency: string;
  /** This goal's share (0-100) of the monthly Savings allocation during "Distribute Money" — null/0 means manual-only. */
  allocationPercent?: number | null;
  isActive: boolean;
}

/** Shape of the "loan" sync payload — mirrors the backend's LoanPayloadDto. Never carries a remaining balance/installments/status — those are derived, see utils/loanSchedule.ts. */
export interface LoanPayload {
  name: string;
  provider?: string | null;
  originalAmount: number;
  monthlyPayment: number;
  totalInstallments: number;
  /** The date installment 1 is due (ISO "YYYY-MM-DD") — anchors the schedule. */
  firstDueDate: string;
  /** Only "Monthly" is valid today. */
  frequency: string;
  feesAmount?: number | null;
  currency: string;
  paymentAccountId: string;
  /** Null means Joint. */
  ownerUserId?: string | null;
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

/**
 * Shape of the "vault_item" sync payload — mirrors the backend's VaultItemPayloadDto. Unlike
 * every other synced entity, this one isn't symmetric between directions:
 *  - `password` is push-only — the new plaintext value, sent once over HTTPS only when the user
 *    is setting/changing it (omitted on an edit that leaves the password alone). Never present
 *    on a pulled change; this device never has any use for a plaintext password beyond the
 *    instant it takes to send it, since it never decrypts anything itself.
 *  - `encryptedPassword`/`nonce`/`authTag`/`keyVersion` are pull-only — the server's already-
 *    encrypted representation (base64), stored as-is in SQLite (see vaultRepository.ts) and never
 *    decrypted on-device — see api.ts's revealVaultPassword for the only way plaintext ever comes
 *    back, and only for the instant it's shown/copied.
 */
export interface VaultItemPayload {
  title: string;
  username: string | null;
  password?: string | null;
  websiteUrl: string | null;
  category: string;
  notes: string | null;
  encryptedPassword?: string | null;
  nonce?: string | null;
  authTag?: string | null;
  keyVersion?: number | null;
  /** Only ever present on a pulled change — the server sets it, a push never needs to. */
  createdByUserId?: string;
}

export interface VaultRevealResponseDto {
  password: string;
}

/** Mirrors the backend's MissMeInteractionType constants. */
export type MissMeInteractionKind = 'MissMe' | 'MissYouToo';

export interface MissMeInteractionDto {
  id: string;
  senderUserId: string;
  senderDisplayName: string;
  receiverUserId: string;
  type: MissMeInteractionKind;
  inResponseToId: string | null;
  createdAt: string;
}

export interface MissMeStatusResponseDto {
  canSend: boolean;
  nextAvailableAt: string | null;
  pendingFromPartner: MissMeInteractionDto | null;
  recentHistory: MissMeInteractionDto[];
}

export interface MissMeSendResponseDto {
  sent: boolean;
  nextAvailableAt: string | null;
  interaction: MissMeInteractionDto | null;
}

/** One savings goal's share of a single "Distribute Money" action — see DistributeMoneyRequestDto. */
export interface SavingsGoalAllocationInputDto {
  savingsGoalId: string;
  /** This goal's share (0-100) of the Savings amount for *this* distribution — every entry must sum to exactly 100. */
  allocationPercent: number;
}

/**
 * One member's share of the Wants bucket for a single "Distribute Money" action — mirrors the
 * backend's WantsAllocationInputDto. Wants has no pooled account of its own (unlike Budget and
 * Savings): every member listed here gets their own real IncomeAllocation transaction, credited
 * straight to their own account. Every entry's allocationPercent must sum to exactly 100.
 */
export interface WantsAllocationInputDto {
  userId: string;
  allocationPercent: number;
  accountId: string;
}

/** Request to execute one "Distribute Money" action — mirrors the backend's DistributeMoneyRequestDto. */
export interface DistributeMoneyRequestDto {
  year: number;
  month: number;
  combinedIncome: number;
  currency: string;
  budgetPercent: number;
  /** Where the Budget share is credited — a real IncomeAllocation transaction is created against this account. */
  budgetAccountId: string;
  savingsPercent: number;
  /** Where the Savings share is credited, then swept into goals via SavingsContribution transactions. */
  savingsAccountId: string;
  savingsGoalAllocations: SavingsGoalAllocationInputDto[];
  wantsPercent: number;
  /** Split of the Wants amount between the couple's members — every entry credited to its own account. Must sum to exactly 100. */
  wantsAllocations: WantsAllocationInputDto[];
  /** Explicit confirmation to create another distribution for a period that already has one. */
  force?: boolean;
}

export interface DistributionDto {
  id: string;
  year: number;
  month: number;
  combinedIncome: number;
  currency: string;
  budgetPercent: number;
  budgetAmount: number;
  budgetAccountId: string | null;
  savingsPercent: number;
  savingsAmount: number;
  savingsAccountId: string | null;
  wantsPercent: number;
  wantsAmount: number;
  createdAt: string;
  createdByUserId: string;
}

export interface DistributionStatusResponseDto {
  alreadyDistributed: boolean;
  distributionsForPeriod: DistributionDto[];
  recentHistory: DistributionDto[];
}

export interface DistributeMoneyResponseDto {
  distribution: DistributionDto;
}

/**
 * A loan plus its *derived* figures — mirrors the backend's LoanDto. Only ever returned by
 * POST /api/loans/{id}/payments; every other read of a loan happens through the generic sync
 * pull (LoanPayload) plus the mobile app deriving these same figures locally — see
 * utils/loanSchedule.ts.
 */
export interface LoanDto {
  id: string;
  name: string;
  provider: string | null;
  originalAmount: number;
  monthlyPayment: number;
  totalInstallments: number;
  firstDueDate: string;
  frequency: string;
  feesAmount: number | null;
  currency: string;
  paymentAccountId: string;
  ownerUserId: string | null;
  paidAmount: number;
  remainingBalance: number;
  installmentsPaid: number;
  remainingInstallments: number;
  /** Null once the loan is fully paid off. */
  nextPaymentAmount: number | null;
  nextPaymentDueDate: string | null;
  /** 'Active' | 'PaidOff' */
  status: string;
}

/** Request to record one payment toward a loan — mirrors the backend's LoanPaymentRequestDto. */
export interface LoanPaymentRequestDto {
  /** Device-generated (see the mobile UUID convention) — becomes the created Transaction's id. Sending the *same* paymentId twice (a double tap, a retried request) is what makes this idempotent — see useLoans.ts's usePayLoan. */
  paymentId: string;
  amount: number;
  accountId: string;
  /** Defaults to today (server clock) when omitted. */
  paymentDate?: string | null;
  description?: string | null;
  notes?: string | null;
}

export interface LoanPaymentResponseDto {
  loan: LoanDto;
  transactionId: string;
}
