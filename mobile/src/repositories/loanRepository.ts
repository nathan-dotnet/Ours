import { getDatabase } from '../database/db';
import { syncQueueRepository } from '../sync/syncQueue';
import type { LoanPayload, LoanPaymentRequestDto, LoanPaymentResponseDto } from '../types/api';
import type { Loan } from '../types/entities';
import { transactionRepository } from './transactionRepository';
import { toLocalDateString } from '../utils/date';
import { apiAmountToCents, centsToApiAmount } from '../utils/money';
import { generateUuid } from '../utils/uuid';

export const LOAN_ENTITY_TYPE = 'loan';

export interface LoanInput {
  name: string;
  provider?: string | null;
  originalAmountCents: number;
  monthlyPaymentCents: number;
  totalInstallments: number;
  /** ISO "YYYY-MM-DD" — the date installment 1 is due; anchors the whole schedule. */
  firstDueDate: string;
  /** Only "Monthly" is supported today. */
  frequency: string;
  feesAmountCents?: number | null;
  currency: string;
  paymentAccountId: string;
  /** Null means Joint. */
  ownerUserId?: string | null;
}

function toPayload(input: LoanInput): LoanPayload {
  return {
    name: input.name,
    provider: input.provider ?? null,
    originalAmount: centsToApiAmount(input.originalAmountCents),
    monthlyPayment: centsToApiAmount(input.monthlyPaymentCents),
    totalInstallments: input.totalInstallments,
    firstDueDate: input.firstDueDate,
    frequency: input.frequency,
    feesAmount: input.feesAmountCents != null ? centsToApiAmount(input.feesAmountCents) : null,
    currency: input.currency,
    paymentAccountId: input.paymentAccountId,
    ownerUserId: input.ownerUserId ?? null,
  };
}

/** Repository for loans — follows savingsGoalRepository.ts's established shape exactly for the synced record; recordPaymentLocally is the one addition, for the dedicated "Pay" action's response. */
export const loanRepository = {
  async getAllForCouple(coupleId: string): Promise<Loan[]> {
    const db = await getDatabase();
    return db.getAllAsync<Loan>(`SELECT * FROM loans WHERE couple_id = ? AND is_deleted = 0 ORDER BY created_at ASC`, [
      coupleId,
    ]);
  },

  async getById(id: string): Promise<Loan | null> {
    const db = await getDatabase();
    return db.getFirstAsync<Loan>(`SELECT * FROM loans WHERE id = ? AND is_deleted = 0`, [id]);
  },

  /** Offline-first create: writes SQLite immediately (device-generated id), then queues the sync op. */
  async createLocally(coupleId: string, input: LoanInput, createdByUserId: string): Promise<Loan> {
    const db = await getDatabase();
    const id = generateUuid();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO loans
         (id, couple_id, name, provider, original_amount_cents, monthly_payment_cents, total_installments, first_due_date, frequency, fees_amount_cents, currency, payment_account_id, owner_user_id, created_by_user_id, created_at, updated_at, updated_by_user_id, version, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        id,
        coupleId,
        input.name,
        input.provider ?? null,
        input.originalAmountCents,
        input.monthlyPaymentCents,
        input.totalInstallments,
        input.firstDueDate,
        input.frequency,
        input.feesAmountCents ?? null,
        input.currency,
        input.paymentAccountId,
        input.ownerUserId ?? null,
        createdByUserId,
        now,
        now,
        createdByUserId,
      ],
    );

    await syncQueueRepository.enqueue(LOAN_ENTITY_TYPE, id, 'CREATE', toPayload(input));

    return {
      id,
      couple_id: coupleId,
      name: input.name,
      provider: input.provider ?? null,
      original_amount_cents: input.originalAmountCents,
      monthly_payment_cents: input.monthlyPaymentCents,
      total_installments: input.totalInstallments,
      first_due_date: input.firstDueDate,
      frequency: input.frequency,
      fees_amount_cents: input.feesAmountCents ?? null,
      currency: input.currency,
      payment_account_id: input.paymentAccountId,
      owner_user_id: input.ownerUserId ?? null,
      created_by_user_id: createdByUserId,
      created_at: now,
      updated_at: now,
      updated_by_user_id: createdByUserId,
      version: 1,
      is_deleted: 0,
    };
  },

  /**
   * Offline-first edit: writes SQLite immediately, then queues the sync op. Deliberately only
   * ever called with the record's own fields (name/provider/schedule/owner/account) — never with
   * a recomputed remaining balance, which doesn't exist as a field to edit at all (see Loan's doc
   * comment). Editing OriginalAmount here is allowed by the schema but the UI should treat it as
   * a rare correction, not a routine edit — it never rewrites or reconciles past payments.
   */
  async updateLocally(loan: Loan, input: LoanInput, updatedByUserId: string): Promise<void> {
    const db = await getDatabase();
    const updatedAt = new Date().toISOString();

    await db.runAsync(
      `UPDATE loans SET
         name = ?, provider = ?, original_amount_cents = ?, monthly_payment_cents = ?, total_installments = ?,
         first_due_date = ?, frequency = ?, fees_amount_cents = ?, currency = ?, payment_account_id = ?, owner_user_id = ?,
         updated_at = ?, updated_by_user_id = ?
       WHERE id = ?`,
      [
        input.name,
        input.provider ?? null,
        input.originalAmountCents,
        input.monthlyPaymentCents,
        input.totalInstallments,
        input.firstDueDate,
        input.frequency,
        input.feesAmountCents ?? null,
        input.currency,
        input.paymentAccountId,
        input.ownerUserId ?? null,
        updatedAt,
        updatedByUserId,
        loan.id,
      ],
    );

    await syncQueueRepository.enqueue(LOAN_ENTITY_TYPE, loan.id, 'UPDATE', toPayload(input));
  },

  /**
   * Offline-first delete: removes the local row immediately. Never touches this loan's
   * LoanPayment transactions — payment history is read straight from the ledger (see
   * transactionRepository.getForLoan), so it survives regardless, and the server applies the same
   * soft-delete (see LoanFlowTests) rather than actually destroying anything.
   */
  async deleteLocally(loan: Loan): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM loans WHERE id = ?`, [loan.id]);

    await syncQueueRepository.enqueue(LOAN_ENTITY_TYPE, loan.id, 'DELETE', null);
  },

  /** Applies a "loan" change pulled from /api/sync/pull. May be entirely new to this device; a null payload means the server told us it was deleted. */
  async applyRemoteChange(
    coupleId: string,
    entityId: string,
    payload: LoanPayload | null,
    updatedAt: string,
    updatedByUserId: string,
    version: number,
  ): Promise<void> {
    const db = await getDatabase();

    if (payload === null) {
      await db.runAsync(`DELETE FROM loans WHERE id = ?`, [entityId]);
      return;
    }

    await db.runAsync(
      `INSERT INTO loans
         (id, couple_id, name, provider, original_amount_cents, monthly_payment_cents, total_installments, first_due_date, frequency, fees_amount_cents, currency, payment_account_id, owner_user_id, created_by_user_id, created_at, updated_at, updated_by_user_id, version, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         provider = excluded.provider,
         original_amount_cents = excluded.original_amount_cents,
         monthly_payment_cents = excluded.monthly_payment_cents,
         total_installments = excluded.total_installments,
         first_due_date = excluded.first_due_date,
         frequency = excluded.frequency,
         fees_amount_cents = excluded.fees_amount_cents,
         currency = excluded.currency,
         payment_account_id = excluded.payment_account_id,
         owner_user_id = excluded.owner_user_id,
         updated_at = excluded.updated_at,
         updated_by_user_id = excluded.updated_by_user_id,
         version = excluded.version,
         is_deleted = 0`,
      [
        entityId,
        coupleId,
        payload.name,
        payload.provider ?? null,
        apiAmountToCents(payload.originalAmount),
        apiAmountToCents(payload.monthlyPayment),
        payload.totalInstallments,
        payload.firstDueDate,
        payload.frequency,
        payload.feesAmount != null ? apiAmountToCents(payload.feesAmount) : null,
        payload.currency,
        payload.paymentAccountId,
        payload.ownerUserId ?? null,
        updatedByUserId,
        updatedAt,
        updatedAt,
        updatedByUserId,
        version,
      ],
    );
  },

  /**
   * Writes the server's just-applied loan payment straight into the local transaction mirror, so
   * the UI (remaining balance, installments, account balance) updates instantly without waiting
   * for the next sync pull — the same "system-generated, arrives as a fact" shape as an
   * IncomeAllocation transaction, applied eagerly here via the exact same
   * transactionRepository.applyRemoteChange path a pull would use (never a second write path).
   * A `triggerSync()` right after this (see useLoans.ts's usePayLoan) still reconciles with the
   * server and is what carries the payment to the partner's device.
   */
  async recordPaymentLocally(coupleId: string, loan: Loan, request: LoanPaymentRequestDto, response: LoanPaymentResponseDto, paidByUserId: string): Promise<void> {
    const now = new Date().toISOString();
    await transactionRepository.applyRemoteChange(
      coupleId,
      response.transactionId,
      {
        type: 'LoanPayment',
        amount: request.amount, // already a plain decimal-pesos amount, same convention as every other wire DTO — see LoanPaymentRequestDto.
        currency: loan.currency,
        accountId: request.accountId,
        category: null,
        savingsGoalId: null,
        loanId: loan.id,
        description: request.description ?? `Loan payment — ${loan.name}`,
        transactionDate: request.paymentDate ?? toLocalDateString(new Date()),
        notes: request.notes ?? null,
        paidByUserId,
        createdByUserId: paidByUserId,
      },
      now,
      paidByUserId,
      1,
    );
  },
};
