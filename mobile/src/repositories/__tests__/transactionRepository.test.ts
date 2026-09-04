import { resetDatabaseHandleForTests } from '../../database/db';
import { syncQueueRepository } from '../../sync/syncQueue';
import { accountRepository } from '../accountRepository';
import { transactionRepository } from '../transactionRepository';

const COUPLE_ID = 'couple-1';
const USER_ID = 'user-alice';

function expenseInput(accountId: string, overrides: Partial<Parameters<typeof transactionRepository.createLocally>[1]> = {}) {
  return {
    type: 'Expense',
    amountCents: 50_000,
    currency: 'PHP',
    accountId,
    category: 'Food',
    description: 'Dinner',
    transactionDate: '2026-09-01',
    notes: null,
    ...overrides,
  };
}

async function seedAccount(name: string, openingBalanceCents: number) {
  return accountRepository.createLocally(COUPLE_ID, { name, type: 'Bank', icon: 'bpi', currency: 'PHP', isActive: true }, openingBalanceCents, USER_ID);
}

describe('transactionRepository', () => {
  beforeEach(() => {
    resetDatabaseHandleForTests();
  });

  it('createLocally (Expense) writes SQLite immediately and queues a CREATE sync op', async () => {
    const account = await seedAccount('BPI', 1_000_000);

    const transaction = await transactionRepository.createLocally(COUPLE_ID, expenseInput(account.id), USER_ID);

    const stored = await transactionRepository.getById(transaction.id);
    expect(stored).toMatchObject({ type: 'Expense', amount_cents: 50_000, account_id: account.id, category: 'Food', version: 1 });

    const pending = await syncQueueRepository.getPending();
    const txRow = pending.find((p) => p.entity_type === 'money_transaction');
    expect(txRow).toMatchObject({ entity_id: transaction.id, operation: 'CREATE' });
    expect(JSON.parse(txRow!.payload)).toMatchObject({ type: 'Expense', amount: 500, accountId: account.id });
  });

  it('createLocally (Income) and (Transfer) both work the same way', async () => {
    const bpi = await seedAccount('BPI', 1_000_000);
    const cash = await seedAccount('Cash', 500_000);

    const income = await transactionRepository.createLocally(COUPLE_ID, expenseInput(bpi.id, { type: 'Income', category: 'Salary' }), USER_ID);
    const transfer = await transactionRepository.createLocally(
      COUPLE_ID,
      expenseInput(bpi.id, { type: 'Transfer', category: null, destinationAccountId: cash.id, amountCents: 200_000 }),
      USER_ID,
    );

    expect(await transactionRepository.getById(income.id)).toMatchObject({ type: 'Income' });
    expect(await transactionRepository.getById(transfer.id)).toMatchObject({ type: 'Transfer', destination_account_id: cash.id });
  });

  it('getForMonth scopes to both the couple and the given calendar month', async () => {
    const account = await seedAccount('BPI', 0);
    const inMonth = await transactionRepository.createLocally(COUPLE_ID, expenseInput(account.id, { transactionDate: '2026-09-15' }), USER_ID);
    await transactionRepository.createLocally(COUPLE_ID, expenseInput(account.id, { transactionDate: '2026-08-31' }), USER_ID);

    const transactions = await transactionRepository.getForMonth(COUPLE_ID, 2026, 9);

    expect(transactions.map((t) => t.id)).toEqual([inMonth.id]);
  });

  it('getForAccount includes transactions where the account is either the source or a transfer destination', async () => {
    const bpi = await seedAccount('BPI', 1_000_000);
    const cash = await seedAccount('Cash', 500_000);
    const expense = await transactionRepository.createLocally(COUPLE_ID, expenseInput(bpi.id), USER_ID);
    const transfer = await transactionRepository.createLocally(
      COUPLE_ID,
      expenseInput(bpi.id, { type: 'Transfer', category: null, destinationAccountId: cash.id, amountCents: 200_000 }),
      USER_ID,
    );

    const cashHistory = await transactionRepository.getForAccount(cash.id);
    const bpiHistory = await transactionRepository.getForAccount(bpi.id);

    expect(cashHistory.map((t) => t.id)).toEqual([transfer.id]);
    expect(bpiHistory.map((t) => t.id).sort()).toEqual([expense.id, transfer.id].sort());
  });

  it('updateLocally (moving accounts) replaces the transaction\'s account, not a delta', async () => {
    const bpi = await seedAccount('BPI', 1_000_000);
    const gcash = await seedAccount('GCash', 500_000);
    const transaction = await transactionRepository.createLocally(COUPLE_ID, expenseInput(bpi.id), USER_ID);
    const txCreateRow = (await syncQueueRepository.getPending()).find((p) => p.entity_type === 'money_transaction')!;
    await syncQueueRepository.markSynced(txCreateRow.id);

    await transactionRepository.updateLocally(transaction, expenseInput(gcash.id), USER_ID);

    const updated = await transactionRepository.getById(transaction.id);
    expect(updated).toMatchObject({ account_id: gcash.id });
  });

  it('deleteLocally removes the row immediately and queues a DELETE sync op', async () => {
    const account = await seedAccount('BPI', 1_000_000);
    const transaction = await transactionRepository.createLocally(COUPLE_ID, expenseInput(account.id), USER_ID);
    // seedAccount already queued its own CREATE — find the transaction's specifically.
    const txCreateRow = (await syncQueueRepository.getPending()).find((p) => p.entity_type === 'money_transaction')!;
    await syncQueueRepository.markSynced(txCreateRow.id);

    await transactionRepository.deleteLocally(transaction);

    expect(await transactionRepository.getById(transaction.id)).toBeNull();
    const pending = await syncQueueRepository.getPending();
    expect(pending.find((p) => p.entity_type === 'money_transaction')?.operation).toBe('DELETE');
  });

  it('applyRemoteChange upserts a transaction this device has never seen (the partner created it)', async () => {
    await transactionRepository.applyRemoteChange(
      COUPLE_ID,
      'partner-tx-1',
      {
        type: 'Expense',
        amount: 1250.5,
        currency: 'PHP',
        accountId: 'account-1',
        category: 'Food',
        description: 'Groceries',
        transactionDate: '2026-09-02',
        notes: null,
        createdByUserId: 'user-bob',
      },
      new Date().toISOString(),
      'user-bob',
      1,
    );

    const stored = await transactionRepository.getById('partner-tx-1');
    expect(stored).toMatchObject({ amount_cents: 125050, created_by_user_id: 'user-bob' });
  });

  it('applyRemoteChange with a null payload deletes the local row (a pulled tombstone)', async () => {
    const account = await seedAccount('BPI', 0);
    const transaction = await transactionRepository.createLocally(COUPLE_ID, expenseInput(account.id), USER_ID);

    await transactionRepository.applyRemoteChange(COUPLE_ID, transaction.id, null, new Date().toISOString(), 'user-bob', 2);

    expect(await transactionRepository.getById(transaction.id)).toBeNull();
  });
});
