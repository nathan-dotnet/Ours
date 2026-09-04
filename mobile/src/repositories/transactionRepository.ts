import { getDatabase } from '../database/db';
import { syncQueueRepository } from '../sync/syncQueue';
import type { TransactionPayload } from '../types/api';
import type { Transaction } from '../types/entities';
import { apiAmountToCents, centsToApiAmount } from '../utils/money';
import { generateUuid } from '../utils/uuid';

export const TRANSACTION_ENTITY_TYPE = 'money_transaction';

export interface TransactionInput {
  type: string; // 'Expense' | 'Income' | 'Transfer'
  amountCents: number;
  currency: string;
  accountId: string;
  destinationAccountId?: string | null;
  category?: string | null;
  description: string | null;
  transactionDate: string; // ISO date (YYYY-MM-DD)
  notes: string | null;
  paidByUserId?: string | null;
}

function toPayload(input: TransactionInput): TransactionPayload {
  return {
    type: input.type,
    amount: centsToApiAmount(input.amountCents),
    currency: input.currency,
    accountId: input.accountId,
    destinationAccountId: input.destinationAccountId ?? null,
    category: input.category ?? null,
    description: input.description,
    transactionDate: input.transactionDate,
    notes: input.notes,
    paidByUserId: input.paidByUserId ?? null,
  };
}

/** Repository for transactions (Expense/Income/Transfer) — follows calendarEventRepository.ts's established shape exactly. */
export const transactionRepository = {
  async getAllForCouple(coupleId: string): Promise<Transaction[]> {
    const db = await getDatabase();
    return db.getAllAsync<Transaction>(
      `SELECT * FROM money_transactions WHERE couple_id = ? AND is_deleted = 0 ORDER BY transaction_date DESC, created_at DESC`,
      [coupleId],
    );
  },

  /** Transactions for one calendar month (month is 1-12), scoped to the active couple. */
  async getForMonth(coupleId: string, year: number, month: number): Promise<Transaction[]> {
    const db = await getDatabase();
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return db.getAllAsync<Transaction>(
      `SELECT * FROM money_transactions WHERE couple_id = ? AND is_deleted = 0 AND transaction_date LIKE ? ORDER BY transaction_date DESC, created_at DESC`,
      [coupleId, `${prefix}-%`],
    );
  },

  /** Every transaction touching a given account, as either the affected account or a transfer's destination — for the account detail history. */
  async getForAccount(accountId: string): Promise<Transaction[]> {
    const db = await getDatabase();
    return db.getAllAsync<Transaction>(
      `SELECT * FROM money_transactions WHERE (account_id = ? OR destination_account_id = ?) AND is_deleted = 0 ORDER BY transaction_date DESC, created_at DESC`,
      [accountId, accountId],
    );
  },

  async getById(id: string): Promise<Transaction | null> {
    const db = await getDatabase();
    return db.getFirstAsync<Transaction>(`SELECT * FROM money_transactions WHERE id = ? AND is_deleted = 0`, [id]);
  },

  /** Offline-first create: writes SQLite immediately (device-generated id), then queues the sync op. */
  async createLocally(coupleId: string, input: TransactionInput, createdByUserId: string): Promise<Transaction> {
    const db = await getDatabase();
    const id = generateUuid();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO money_transactions
         (id, couple_id, type, amount_cents, currency, account_id, destination_account_id, category, description, transaction_date, notes, paid_by_user_id, created_by_user_id, created_at, updated_at, updated_by_user_id, version, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        id,
        coupleId,
        input.type,
        input.amountCents,
        input.currency,
        input.accountId,
        input.destinationAccountId ?? null,
        input.category ?? null,
        input.description,
        input.transactionDate,
        input.notes,
        input.paidByUserId ?? null,
        createdByUserId,
        now,
        now,
        createdByUserId,
      ],
    );

    await syncQueueRepository.enqueue(TRANSACTION_ENTITY_TYPE, id, 'CREATE', toPayload(input));

    return {
      id,
      couple_id: coupleId,
      type: input.type,
      amount_cents: input.amountCents,
      currency: input.currency,
      account_id: input.accountId,
      destination_account_id: input.destinationAccountId ?? null,
      category: input.category ?? null,
      description: input.description,
      transaction_date: input.transactionDate,
      notes: input.notes,
      paid_by_user_id: input.paidByUserId ?? null,
      created_by_user_id: createdByUserId,
      created_at: now,
      updated_at: now,
      updated_by_user_id: createdByUserId,
      version: 1,
      is_deleted: 0,
    };
  },

  /** Offline-first edit: writes SQLite immediately, then queues the sync op. Applying the new state (not a delta) is what makes an account/amount change correct automatically — see utils/moneyCalculations.ts. */
  async updateLocally(transaction: Transaction, input: TransactionInput, updatedByUserId: string): Promise<void> {
    const db = await getDatabase();
    const updatedAt = new Date().toISOString();

    await db.runAsync(
      `UPDATE money_transactions
       SET type = ?, amount_cents = ?, currency = ?, account_id = ?, destination_account_id = ?, category = ?, description = ?, transaction_date = ?, notes = ?, paid_by_user_id = ?, updated_at = ?, updated_by_user_id = ?
       WHERE id = ?`,
      [
        input.type,
        input.amountCents,
        input.currency,
        input.accountId,
        input.destinationAccountId ?? null,
        input.category ?? null,
        input.description,
        input.transactionDate,
        input.notes,
        input.paidByUserId ?? null,
        updatedAt,
        updatedByUserId,
        transaction.id,
      ],
    );

    await syncQueueRepository.enqueue(TRANSACTION_ENTITY_TYPE, transaction.id, 'UPDATE', toPayload(input));
  },

  /** Offline-first delete: removes the local row immediately (SQLite is just this device's mirror; the sync_queue row remembers the deletion needs pushing). Deleting reverses the transaction's financial effect automatically — see moneyCalculations.ts. */
  async deleteLocally(transaction: Transaction): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM money_transactions WHERE id = ?`, [transaction.id]);

    await syncQueueRepository.enqueue(TRANSACTION_ENTITY_TYPE, transaction.id, 'DELETE', null);
  },

  /** Applies a "money_transaction" change pulled from /api/sync/pull. May be entirely new to this device; a null payload means the server told us it was deleted. */
  async applyRemoteChange(
    coupleId: string,
    entityId: string,
    payload: TransactionPayload | null,
    updatedAt: string,
    updatedByUserId: string,
    version: number,
  ): Promise<void> {
    const db = await getDatabase();

    if (payload === null) {
      await db.runAsync(`DELETE FROM money_transactions WHERE id = ?`, [entityId]);
      return;
    }

    await db.runAsync(
      `INSERT INTO money_transactions
         (id, couple_id, type, amount_cents, currency, account_id, destination_account_id, category, description, transaction_date, notes, paid_by_user_id, created_by_user_id, created_at, updated_at, updated_by_user_id, version, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET
         type = excluded.type,
         amount_cents = excluded.amount_cents,
         currency = excluded.currency,
         account_id = excluded.account_id,
         destination_account_id = excluded.destination_account_id,
         category = excluded.category,
         description = excluded.description,
         transaction_date = excluded.transaction_date,
         notes = excluded.notes,
         paid_by_user_id = excluded.paid_by_user_id,
         updated_at = excluded.updated_at,
         updated_by_user_id = excluded.updated_by_user_id,
         version = excluded.version,
         is_deleted = 0`,
      [
        entityId,
        coupleId,
        payload.type,
        apiAmountToCents(payload.amount),
        payload.currency,
        payload.accountId,
        payload.destinationAccountId ?? null,
        payload.category ?? null,
        payload.description,
        payload.transactionDate,
        payload.notes,
        payload.paidByUserId ?? null,
        // The server always sets this on a pulled change; falling back to updatedByUserId would
        // only ever matter if that contract were ever violated.
        payload.createdByUserId ?? updatedByUserId,
        updatedAt,
        updatedAt,
        updatedByUserId,
        version,
      ],
    );
  },
};
