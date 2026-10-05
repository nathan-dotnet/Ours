import { resetDatabaseHandleForTests } from '../../database/db';
import { syncQueueRepository } from '../../sync/syncQueue';
import { loanPaymentScheduleRepository } from '../loanPaymentScheduleRepository';

const INPUT = { loanId: 'loan-1', dueDate: '2026-10-15', plannedAmountCents: 12_345 };

describe('loanPaymentScheduleRepository', () => {
  beforeEach(() => resetDatabaseHandleForTests());

  it('stores integer cents locally and queues the decimal API payload with standard entity metadata', async () => {
    const schedule = await loanPaymentScheduleRepository.createLocally(INPUT, 'user-1');
    expect(await loanPaymentScheduleRepository.getForLoan(INPUT.loanId)).toMatchObject([
      { id: schedule.id, due_date: INPUT.dueDate, planned_amount_cents: INPUT.plannedAmountCents },
    ]);
    const [queued] = await syncQueueRepository.getPending();
    expect(queued).toMatchObject({ entity_type: 'loan_payment_schedule', entity_id: schedule.id, operation: 'CREATE' });
    expect(JSON.parse(queued.payload)).toEqual({ loanId: INPUT.loanId, dueDate: INPUT.dueDate, plannedAmount: 123.45 });
  });

  it('updates, deletes, and applies pulled schedule changes', async () => {
    const schedule = await loanPaymentScheduleRepository.createLocally(INPUT, 'user-1');
    const [create] = await syncQueueRepository.getPending();
    await syncQueueRepository.markSynced(create.id);
    await loanPaymentScheduleRepository.updateLocally(schedule, { ...INPUT, plannedAmountCents: 15_000 }, 'user-1');
    expect(await loanPaymentScheduleRepository.getForLoan(INPUT.loanId)).toMatchObject([{ planned_amount_cents: 15_000 }]);

    await loanPaymentScheduleRepository.applyRemoteChange('remote-row', {
      loanId: INPUT.loanId, dueDate: '2026-10-20', plannedAmount: 99.99,
    }, '2026-10-01T00:00:00.000Z', 'user-2', 2);
    expect(await loanPaymentScheduleRepository.getForLoan(INPUT.loanId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'remote-row', due_date: '2026-10-20', planned_amount_cents: 9_999, version: 2 }),
    ]));

    const updated = (await loanPaymentScheduleRepository.getForLoan(INPUT.loanId)).find((row) => row.id === schedule.id)!;
    await loanPaymentScheduleRepository.deleteLocally(updated);
    expect((await loanPaymentScheduleRepository.getForLoan(INPUT.loanId)).map((row) => row.id)).not.toContain(schedule.id);
    expect((await syncQueueRepository.getPending()).some((row) => row.entity_type === 'loan_payment_schedule' && row.operation === 'DELETE')).toBe(true);
  });

  it('removes a locally mirrored row on a pulled tombstone', async () => {
    await loanPaymentScheduleRepository.applyRemoteChange('remote-row', {
      loanId: INPUT.loanId, dueDate: INPUT.dueDate, plannedAmount: 100,
    }, '2026-10-01T00:00:00.000Z', 'user-2', 1);
    await loanPaymentScheduleRepository.applyRemoteChange('remote-row', null, '2026-10-02T00:00:00.000Z', 'user-2', 2);
    expect(await loanPaymentScheduleRepository.getForLoan(INPUT.loanId)).toEqual([]);
  });
});
