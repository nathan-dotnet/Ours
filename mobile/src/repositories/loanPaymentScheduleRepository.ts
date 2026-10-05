import { getDatabase } from '../database/db';
import { syncQueueRepository } from '../sync/syncQueue';
import type { LoanPaymentSchedulePayload } from '../types/api';
import type { LoanPaymentSchedule } from '../types/entities';
import { apiAmountToCents, centsToApiAmount } from '../utils/money';
import { generateUuid } from '../utils/uuid';

export const LOAN_PAYMENT_SCHEDULE_ENTITY_TYPE = 'loan_payment_schedule';

export interface LoanPaymentScheduleInput {
  loanId: string;
  dueDate: string;
  plannedAmountCents: number;
}

function toPayload(input: LoanPaymentScheduleInput): LoanPaymentSchedulePayload {
  return {
    loanId: input.loanId,
    dueDate: input.dueDate,
    plannedAmount: centsToApiAmount(input.plannedAmountCents),
  };
}

export const loanPaymentScheduleRepository = {
  async getForLoan(loanId: string): Promise<LoanPaymentSchedule[]> {
    const db = await getDatabase();
    return db.getAllAsync<LoanPaymentSchedule>(
      `SELECT * FROM loan_payment_schedules WHERE loan_id = ? AND is_deleted = 0 ORDER BY due_date ASC`,
      [loanId],
    );
  },

  async getForLoans(loanIds: string[]): Promise<LoanPaymentSchedule[]> {
    if (loanIds.length === 0) return [];
    const db = await getDatabase();
    const placeholders = loanIds.map(() => '?').join(', ');
    return db.getAllAsync<LoanPaymentSchedule>(
      `SELECT * FROM loan_payment_schedules WHERE loan_id IN (${placeholders}) AND is_deleted = 0 ORDER BY due_date ASC`,
      loanIds,
    );
  },

  async createLocally(input: LoanPaymentScheduleInput, updatedByUserId: string): Promise<LoanPaymentSchedule> {
    const db = await getDatabase();
    const id = generateUuid();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO loan_payment_schedules (id, loan_id, due_date, planned_amount_cents, created_at, updated_at, updated_by_user_id, version, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [id, input.loanId, input.dueDate, input.plannedAmountCents, now, now, updatedByUserId],
    );
    await syncQueueRepository.enqueue(LOAN_PAYMENT_SCHEDULE_ENTITY_TYPE, id, 'CREATE', toPayload(input));
    return {
      id,
      loan_id: input.loanId,
      due_date: input.dueDate,
      planned_amount_cents: input.plannedAmountCents,
      created_at: now,
      updated_at: now,
      updated_by_user_id: updatedByUserId,
      version: 1,
      is_deleted: 0,
    };
  },

  async updateLocally(schedule: LoanPaymentSchedule, input: LoanPaymentScheduleInput, updatedByUserId: string): Promise<void> {
    const db = await getDatabase();
    const updatedAt = new Date().toISOString();
    await db.runAsync(
      `UPDATE loan_payment_schedules SET loan_id = ?, due_date = ?, planned_amount_cents = ?, updated_at = ?, updated_by_user_id = ? WHERE id = ?`,
      [input.loanId, input.dueDate, input.plannedAmountCents, updatedAt, updatedByUserId, schedule.id],
    );
    await syncQueueRepository.enqueue(LOAN_PAYMENT_SCHEDULE_ENTITY_TYPE, schedule.id, 'UPDATE', toPayload(input));
  },

  async deleteLocally(schedule: LoanPaymentSchedule): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM loan_payment_schedules WHERE id = ?`, [schedule.id]);
    await syncQueueRepository.enqueue(LOAN_PAYMENT_SCHEDULE_ENTITY_TYPE, schedule.id, 'DELETE', null);
  },

  async applyRemoteChange(
    entityId: string,
    payload: LoanPaymentSchedulePayload | null,
    updatedAt: string,
    updatedByUserId: string,
    version: number,
  ): Promise<void> {
    const db = await getDatabase();
    if (payload === null) {
      await db.runAsync(`DELETE FROM loan_payment_schedules WHERE id = ?`, [entityId]);
      return;
    }
    await db.runAsync(
      `INSERT INTO loan_payment_schedules (id, loan_id, due_date, planned_amount_cents, created_at, updated_at, updated_by_user_id, version, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET loan_id = excluded.loan_id, due_date = excluded.due_date,
         planned_amount_cents = excluded.planned_amount_cents, updated_at = excluded.updated_at,
         updated_by_user_id = excluded.updated_by_user_id, version = excluded.version, is_deleted = 0`,
      [entityId, payload.loanId, payload.dueDate, apiAmountToCents(payload.plannedAmount), updatedAt, updatedAt, updatedByUserId, version],
    );
  },
};
