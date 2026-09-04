import { resetDatabaseHandleForTests } from '../../database/db';
import { syncQueueRepository } from '../../sync/syncQueue';
import { budgetRepository } from '../budgetRepository';

const COUPLE_ID = 'couple-1';
const USER_ID = 'user-alice';

function input(overrides: Partial<Parameters<typeof budgetRepository.createLocally>[1]> = {}) {
  return { category: 'Food', year: 2026, month: 9, amountCents: 500_000, currency: 'PHP', ...overrides };
}

describe('budgetRepository', () => {
  beforeEach(() => {
    resetDatabaseHandleForTests();
  });

  it('createLocally writes SQLite immediately and queues a CREATE sync op', async () => {
    const budget = await budgetRepository.createLocally(COUPLE_ID, input(), USER_ID);

    const stored = await budgetRepository.getById(budget.id);
    expect(stored).toMatchObject({ category: 'Food', year: 2026, month: 9, amount_cents: 500_000, version: 1 });

    const pending = await syncQueueRepository.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ entity_type: 'budget', operation: 'CREATE' });
    expect(JSON.parse(pending[0].payload)).toMatchObject({ category: 'Food', amount: 5000 });
  });

  it('getForMonth scopes to the couple, year, and month', async () => {
    const thisMonth = await budgetRepository.createLocally(COUPLE_ID, input(), USER_ID);
    await budgetRepository.createLocally(COUPLE_ID, input({ month: 8, category: 'Bills' }), USER_ID);
    await budgetRepository.createLocally('some-other-couple', input({ category: 'Shopping' }), USER_ID);

    const budgets = await budgetRepository.getForMonth(COUPLE_ID, 2026, 9);

    expect(budgets.map((b) => b.id)).toEqual([thisMonth.id]);
  });

  it('updateLocally changes the amount and queues an UPDATE sync op', async () => {
    const budget = await budgetRepository.createLocally(COUPLE_ID, input(), USER_ID);
    const [createRow] = await syncQueueRepository.getPending();
    await syncQueueRepository.markSynced(createRow.id);

    await budgetRepository.updateLocally(budget, input({ amountCents: 600_000 }), USER_ID);

    expect(await budgetRepository.getById(budget.id)).toMatchObject({ amount_cents: 600_000 });
    const pending = await syncQueueRepository.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].operation).toBe('UPDATE');
  });

  it('deleteLocally removes the row immediately, freeing its category/month slot', async () => {
    const budget = await budgetRepository.createLocally(COUPLE_ID, input(), USER_ID);
    const [createRow] = await syncQueueRepository.getPending();
    await syncQueueRepository.markSynced(createRow.id);

    await budgetRepository.deleteLocally(budget);

    expect(await budgetRepository.getById(budget.id)).toBeNull();
    const pending = await syncQueueRepository.getPending();
    expect(pending[0].operation).toBe('DELETE');
  });

  it('applyRemoteChange upserts a budget this device has never seen (the partner created it)', async () => {
    await budgetRepository.applyRemoteChange(
      COUPLE_ID,
      'partner-budget-1',
      { category: 'Bills', year: 2026, month: 9, amount: 4000, currency: 'PHP' },
      new Date().toISOString(),
      'user-bob',
      1,
    );

    expect(await budgetRepository.getById('partner-budget-1')).toMatchObject({ category: 'Bills', amount_cents: 400_000 });
  });

  it('applyRemoteChange with a null payload deletes the local row (a pulled tombstone)', async () => {
    const budget = await budgetRepository.createLocally(COUPLE_ID, input(), USER_ID);

    await budgetRepository.applyRemoteChange(COUPLE_ID, budget.id, null, new Date().toISOString(), 'user-bob', 2);

    expect(await budgetRepository.getById(budget.id)).toBeNull();
  });
});
