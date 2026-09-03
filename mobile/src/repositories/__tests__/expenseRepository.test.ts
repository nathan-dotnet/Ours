import { resetDatabaseHandleForTests } from '../../database/db';
import { syncQueueRepository } from '../../sync/syncQueue';
import { expenseRepository } from '../expenseRepository';

const COUPLE_ID = 'couple-1';
const USER_ID = 'user-alice';

function input(overrides: Partial<Parameters<typeof expenseRepository.createLocally>[1]> = {}) {
  return {
    amountCents: 25000,
    currency: 'PHP',
    description: 'Dinner',
    category: 'Food',
    expenseDate: '2026-09-01',
    notes: null,
    ...overrides,
  };
}

describe('expenseRepository', () => {
  beforeEach(() => {
    resetDatabaseHandleForTests();
  });

  it('createLocally writes SQLite immediately and queues a CREATE sync op', async () => {
    const expense = await expenseRepository.createLocally(COUPLE_ID, input(), USER_ID);

    const stored = await expenseRepository.getById(expense.id);
    expect(stored).toMatchObject({ amount_cents: 25000, currency: 'PHP', category: 'Food', couple_id: COUPLE_ID, version: 1 });

    const pending = await syncQueueRepository.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ entity_type: 'expense', entity_id: expense.id, operation: 'CREATE' });
    expect(JSON.parse(pending[0].payload)).toMatchObject({ amount: 250, currency: 'PHP', category: 'Food' });
  });

  it('createLocally stores an exact integer amount for a tricky decimal (100.10)', async () => {
    const expense = await expenseRepository.createLocally(COUPLE_ID, input({ amountCents: 10010 }), USER_ID);
    expect(await expenseRepository.getById(expense.id)).toMatchObject({ amount_cents: 10010 });
  });

  it('getAllForCouple returns only that couple\'s non-deleted expenses', async () => {
    const mine = await expenseRepository.createLocally(COUPLE_ID, input(), USER_ID);
    await expenseRepository.createLocally('some-other-couple', input(), USER_ID);

    const expenses = await expenseRepository.getAllForCouple(COUPLE_ID);

    expect(expenses.map((e) => e.id)).toEqual([mine.id]);
  });

  it('getForMonth scopes to both the couple and the given calendar month', async () => {
    const inMonth = await expenseRepository.createLocally(COUPLE_ID, input({ expenseDate: '2026-09-15' }), USER_ID);
    await expenseRepository.createLocally(COUPLE_ID, input({ expenseDate: '2026-08-31' }), USER_ID); // different month
    await expenseRepository.createLocally('some-other-couple', input({ expenseDate: '2026-09-15' }), USER_ID); // different couple

    const expenses = await expenseRepository.getForMonth(COUPLE_ID, 2026, 9);

    expect(expenses.map((e) => e.id)).toEqual([inMonth.id]);
  });

  it('updateLocally writes SQLite immediately and queues an UPDATE sync op', async () => {
    const expense = await expenseRepository.createLocally(COUPLE_ID, input(), USER_ID);
    const [createRow] = await syncQueueRepository.getPending();
    await syncQueueRepository.markSynced(createRow.id); // isolate the UPDATE from queue-coalescing with the CREATE

    await expenseRepository.updateLocally(expense, input({ amountCents: 30000, category: 'Bills' }), USER_ID);

    const updated = await expenseRepository.getById(expense.id);
    expect(updated).toMatchObject({ amount_cents: 30000, category: 'Bills' });

    const pending = await syncQueueRepository.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ entity_type: 'expense', entity_id: expense.id, operation: 'UPDATE' });
  });

  it('deleteLocally removes the row immediately and queues a DELETE sync op', async () => {
    const expense = await expenseRepository.createLocally(COUPLE_ID, input(), USER_ID);

    await expenseRepository.deleteLocally(expense);

    expect(await expenseRepository.getById(expense.id)).toBeNull();
    // The CREATE hasn't synced yet — deleting collapses the queue entry away entirely (mergeOperation).
    expect(await syncQueueRepository.getPending()).toHaveLength(0);
  });

  it('deleteLocally after the create already synced still queues a DELETE', async () => {
    const expense = await expenseRepository.createLocally(COUPLE_ID, input(), USER_ID);
    const [createRow] = await syncQueueRepository.getPending();
    await syncQueueRepository.markSynced(createRow.id);

    await expenseRepository.deleteLocally(expense);

    expect(await expenseRepository.getById(expense.id)).toBeNull();
    const pending = await syncQueueRepository.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].operation).toBe('DELETE');
  });

  it('applyRemoteChange upserts an expense this device has never seen before (the partner created it), converting the decimal payload to exact cents', async () => {
    await expenseRepository.applyRemoteChange(
      COUPLE_ID,
      'partner-expense-1',
      { amount: 1250.5, currency: 'PHP', description: 'Groceries', category: 'Food', expenseDate: '2026-09-02', notes: null, createdByUserId: 'user-bob' },
      '2026-09-02T00:00:00.000Z',
      'user-bob',
      1,
    );

    const stored = await expenseRepository.getById('partner-expense-1');
    expect(stored).toMatchObject({ amount_cents: 125050, couple_id: COUPLE_ID, created_by_user_id: 'user-bob', version: 1 });
  });

  it('applyRemoteChange with a null payload deletes the local row (a pulled tombstone)', async () => {
    const expense = await expenseRepository.createLocally(COUPLE_ID, input(), USER_ID);

    await expenseRepository.applyRemoteChange(COUPLE_ID, expense.id, null, new Date().toISOString(), 'user-bob', 2);

    expect(await expenseRepository.getById(expense.id)).toBeNull();
  });

  it('applyRemoteChange updates an existing local row without disturbing its created_by_user_id', async () => {
    const expense = await expenseRepository.createLocally(COUPLE_ID, input(), USER_ID);

    await expenseRepository.applyRemoteChange(
      COUPLE_ID,
      expense.id,
      { amount: 999.99, currency: 'PHP', description: 'Confirmed', category: 'Food', expenseDate: '2026-09-01', notes: null },
      new Date().toISOString(),
      USER_ID,
      2,
    );

    const stored = await expenseRepository.getById(expense.id);
    expect(stored).toMatchObject({ amount_cents: 99999, created_by_user_id: USER_ID, version: 2 });
  });

  it('stores and round-trips an optional paidByUserId', async () => {
    const expense = await expenseRepository.createLocally(COUPLE_ID, input({ paidByUserId: 'user-bob' }), USER_ID);
    expect(await expenseRepository.getById(expense.id)).toMatchObject({ paid_by_user_id: 'user-bob' });
  });
});
