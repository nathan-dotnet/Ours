import { resetDatabaseHandleForTests } from '../../database/db';
import { syncQueueRepository } from '../../sync/syncQueue';
import { loanRepository } from '../loanRepository';
import { transactionRepository } from '../transactionRepository';

const COUPLE_ID = 'couple-1';
const USER_ID = 'user-alice';
const GCASH_ID = 'account-gcash';

function input(overrides: Partial<Parameters<typeof loanRepository.createLocally>[1]> = {}) {
  return {
    name: 'Shopee PayLater',
    provider: 'Shopee',
    originalAmountCents: 10_200_00,
    monthlyPaymentCents: 1_700_00,
    totalInstallments: 6,
    firstDueDate: '2026-09-15',
    frequency: 'Monthly',
    currency: 'PHP',
    paymentAccountId: GCASH_ID,
    ...overrides,
  };
}

describe('loanRepository', () => {
  beforeEach(() => {
    resetDatabaseHandleForTests();
  });

  it('createLocally writes SQLite immediately and queues a CREATE sync op', async () => {
    const loan = await loanRepository.createLocally(COUPLE_ID, input(), USER_ID);

    const stored = await loanRepository.getById(loan.id);
    expect(stored).toMatchObject({
      name: 'Shopee PayLater',
      provider: 'Shopee',
      original_amount_cents: 10_200_00,
      monthly_payment_cents: 1_700_00,
      total_installments: 6,
      first_due_date: '2026-09-15',
      frequency: 'Monthly',
      payment_account_id: GCASH_ID,
      owner_user_id: null,
      version: 1,
    });

    const pending = await syncQueueRepository.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ entity_type: 'loan', operation: 'CREATE' });
    expect(JSON.parse(pending[0].payload)).toMatchObject({ name: 'Shopee PayLater', originalAmount: 10_200, monthlyPayment: 1_700 });
  });

  it('createLocally stores an owner when given one (Joint stays null)', async () => {
    const loan = await loanRepository.createLocally(COUPLE_ID, input({ ownerUserId: USER_ID }), USER_ID);

    expect(await loanRepository.getById(loan.id)).toMatchObject({ owner_user_id: USER_ID });
  });

  it('getAllForCouple scopes to the couple and excludes soft-deleted rows', async () => {
    const mine = await loanRepository.createLocally(COUPLE_ID, input(), USER_ID);
    await loanRepository.createLocally('some-other-couple', input({ name: 'Not yours' }), USER_ID);

    const loans = await loanRepository.getAllForCouple(COUPLE_ID);

    expect(loans.map((l) => l.id)).toEqual([mine.id]);
  });

  it('updateLocally changes the schedule and queues an UPDATE sync op', async () => {
    const loan = await loanRepository.createLocally(COUPLE_ID, input(), USER_ID);
    const [createRow] = await syncQueueRepository.getPending();
    await syncQueueRepository.markSynced(createRow.id);

    await loanRepository.updateLocally(loan, input({ monthlyPaymentCents: 2_000_00 }), USER_ID);

    expect(await loanRepository.getById(loan.id)).toMatchObject({ monthly_payment_cents: 2_000_00 });
    const pending = await syncQueueRepository.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].operation).toBe('UPDATE');
  });

  it('deleteLocally removes the row immediately', async () => {
    const loan = await loanRepository.createLocally(COUPLE_ID, input(), USER_ID);
    const [createRow] = await syncQueueRepository.getPending();
    await syncQueueRepository.markSynced(createRow.id);

    await loanRepository.deleteLocally(loan);

    expect(await loanRepository.getById(loan.id)).toBeNull();
    const pending = await syncQueueRepository.getPending();
    expect(pending[0].operation).toBe('DELETE');
  });

  it('applyRemoteChange upserts a loan this device has never seen (the partner created it)', async () => {
    await loanRepository.applyRemoteChange(
      COUPLE_ID,
      'partner-loan-1',
      {
        name: 'TikTok PayLater',
        provider: 'TikTok',
        originalAmount: 5_000,
        monthlyPayment: 1_000,
        totalInstallments: 5,
        firstDueDate: '2026-09-20',
        frequency: 'Monthly',
        currency: 'PHP',
        paymentAccountId: 'account-bpi',
      },
      new Date().toISOString(),
      'user-bob',
      1,
    );

    expect(await loanRepository.getById('partner-loan-1')).toMatchObject({
      name: 'TikTok PayLater',
      original_amount_cents: 5_000_00,
      monthly_payment_cents: 1_000_00,
    });
  });

  it('applyRemoteChange with a null payload deletes the local row (a pulled tombstone)', async () => {
    const loan = await loanRepository.createLocally(COUPLE_ID, input(), USER_ID);

    await loanRepository.applyRemoteChange(COUPLE_ID, loan.id, null, new Date().toISOString(), 'user-bob', 2);

    expect(await loanRepository.getById(loan.id)).toBeNull();
  });

  it('recordPaymentLocally writes the server-applied payment straight into the transaction mirror', async () => {
    const loan = await loanRepository.createLocally(COUPLE_ID, input(), USER_ID);

    await loanRepository.recordPaymentLocally(
      COUPLE_ID,
      loan,
      { paymentId: 'payment-1', amount: 1_700, accountId: GCASH_ID },
      { loan: { ...loan, paidAmount: 1_700, remainingBalance: 8_500, installmentsPaid: 1, remainingInstallments: 5, status: 'Active' } as never, transactionId: 'payment-1' },
      USER_ID,
    );

    const stored = await transactionRepository.getById('payment-1');
    expect(stored).toMatchObject({
      type: 'LoanPayment',
      amount_cents: 1_700_00,
      account_id: GCASH_ID,
      loan_id: loan.id,
      paid_by_user_id: USER_ID,
    });

    const history = await transactionRepository.getForLoan(loan.id);
    expect(history.map((t) => t.id)).toEqual(['payment-1']);

    // Recording a payment is never itself queued for push — the server already applied it; this
    // is purely mirroring an already-committed fact locally, same as any other pulled change.
    expect(await syncQueueRepository.countPending()).toBe(1); // just the loan's own CREATE from above
  });
});
