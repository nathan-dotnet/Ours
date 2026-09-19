import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Button } from '../Button';
import { Card } from '../Card';
import { EmptyState } from '../EmptyState';
import { LoanCard } from '../LoanCard';
import { MoneySectionHeader } from '../MoneySectionHeader';
import { MoneyStat } from '../MoneyStat';
import type { Account, CoupleMember, Loan, Transaction } from '../../types/entities';
import { useAuthStore } from '../../stores/authStore';
import { fromLocalDateString } from '../../utils/date';
import { calculateLoanPaidAmount, calculateLoanRemainingBalance } from '../../utils/moneyCalculations';
import { getLoanDueStatus, getLoanProgress, getNextUnpaidInstallment, isSameMonth } from '../../utils/loanSchedule';
import { formatMoney } from '../../utils/money';

interface LoansTabProps {
  members: CoupleMember[];
  accounts: Account[];
  loans: Loan[];
  transactions: Transaction[];
}

const shortDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/**
 * PayLater/installment/credit-card obligations — Shopee PayLater, TikTok PayLater, a personal
 * loan, or anything else the couple types. A Loan is the liability; Account is still the money;
 * Transaction (LoanPayment) is still the movement — see LoanCard/app/loans for the "Pay" flow
 * that actually moves it. Every figure here is derived from the loan's schedule plus its linked
 * LoanPayment transactions, never a second stored balance (see utils/loanSchedule.ts). Visually a
 * modern liability dashboard: one dominant "remaining" figure, a next-payment line, a compact
 * this-month stat strip, then a bordered list of loan rows.
 */
export function LoansTab({ members, accounts, loans, transactions }: LoansTabProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const today = new Date();
  const currency = accounts[0]?.currency ?? 'PHP';

  const rows = loans.map((loan) => {
    const paidAmountCents = calculateLoanPaidAmount(loan.id, transactions);
    const remainingCents = calculateLoanRemainingBalance(loan.original_amount_cents, paidAmountCents);
    const progress = getLoanProgress(loan, transactions);
    const next = getNextUnpaidInstallment(progress);
    const dueStatus = getLoanDueStatus(progress, today);
    const account = accounts.find((a) => a.id === loan.payment_account_id);
    const ownerLabel = loan.owner_user_id === null ? 'Joint' : loan.owner_user_id === user?.id ? 'You' : members.find((m) => m.user_id === loan.owner_user_id)?.display_name ?? 'Partner';
    return {
      loan,
      remainingCents,
      installmentsPaid: progress.filter((p) => p.isFullyPaid).length,
      next,
      dueStatus,
      accountName: account?.name ?? '—',
      ownerLabel,
    };
  });

  const activeRows = rows.filter((r) => r.dueStatus !== 'paid-off');
  const totalRemainingCents = activeRows.reduce((sum, r) => sum + r.remainingCents, 0);
  const overdueRows = activeRows.filter((r) => r.dueStatus === 'overdue');
  const overdueCents = overdueRows.reduce((sum, r) => sum + (r.next?.remainingCents ?? 0), 0);
  const dueThisMonthRows = activeRows.filter((r) => r.next && isSameMonth(r.next.dueDate, today));
  const dueThisMonthCents = dueThisMonthRows.reduce((sum, r) => sum + (r.next?.remainingCents ?? 0), 0);
  const thisMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const paidThisMonthCents = transactions
    .filter((t) => !t.is_deleted && t.type === 'LoanPayment' && t.transaction_date.startsWith(`${thisMonthStr}-`))
    .reduce((sum, t) => sum + t.amount_cents, 0);

  const upcoming = activeRows
    .filter((r): r is typeof r & { next: NonNullable<(typeof r)['next']> } => r.next !== null)
    .sort((a, b) => (a.next.dueDate < b.next.dueDate ? -1 : 1));
  const upcomingTotalCents = upcoming.reduce((sum, r) => sum + r.next.remainingCents, 0);
  const nextPayment = upcoming[0] ?? null;

  return (
    <View className="gap-7">
      <View className="gap-1">
        <MoneyStat label="Remaining" value={formatMoney(totalRemainingCents, currency)} size="lg" />
        {nextPayment ? (
          <Text className="text-sm text-textSecondary">
            Next payment {formatMoney(nextPayment.next.remainingCents, currency)} · {shortDateFormatter.format(fromLocalDateString(nextPayment.next.dueDate))}
          </Text>
        ) : null}
      </View>

      {loans.length > 0 ? (
        <Card className="flex-row justify-between">
          <MoneyStat label="Due This Month" value={formatMoney(dueThisMonthCents, currency)} size="sm" />
          <MoneyStat label="Overdue" value={formatMoney(overdueCents, currency)} size="sm" valueClassName={overdueCents > 0 ? 'text-error' : 'text-textPrimary'} />
          <MoneyStat label="Paid This Month" value={formatMoney(paidThisMonthCents, currency)} size="sm" />
        </Card>
      ) : null}

      {upcoming.length > 0 ? (
        <View className="gap-2">
          <MoneySectionHeader label="Upcoming Payments" />
          <Card>
            {upcoming.map((r) => (
              <View key={r.loan.id} className="flex-row items-center justify-between py-1">
                <Text className="text-sm text-textPrimary">{r.loan.name}</Text>
                <Text className="text-sm text-textSecondary">
                  {formatMoney(r.next.remainingCents, currency)} · Due {shortDateFormatter.format(fromLocalDateString(r.next.dueDate))}
                </Text>
              </View>
            ))}
            <View className="mt-2 flex-row items-center justify-between border-t border-border pt-2">
              <Text className="text-sm font-semibold text-textPrimary">Total</Text>
              <Text className="text-sm font-semibold text-textPrimary">{formatMoney(upcomingTotalCents, currency)}</Text>
            </View>
          </Card>
        </View>
      ) : null}

      <View className="gap-3">
        <MoneySectionHeader label="Loans" action={loans.length > 0 ? <Text className="text-xs text-textMuted">{activeRows.length} active</Text> : undefined} />
        {loans.length === 0 ? (
          <EmptyState title="No loans yet" description="Keep track of PayLater, installments, and other payments here." />
        ) : (
          <View className="gap-3">
            {rows.map((r) => (
              <LoanCard
                key={r.loan.id}
                name={r.loan.name}
                remainingCents={r.remainingCents}
                installmentsPaid={r.installmentsPaid}
                totalInstallments={r.loan.total_installments}
                nextPaymentAmountCents={r.next?.remainingCents ?? null}
                nextPaymentDueDate={r.next?.dueDate ?? null}
                dueStatus={r.dueStatus}
                accountName={r.accountName}
                ownerLabel={r.ownerLabel}
                currency={r.loan.currency}
                onPressDetails={() => router.push(`/loans/${r.loan.id}`)}
                onPressPay={() => router.push(`/loans/${r.loan.id}?pay=1`)}
              />
            ))}
          </View>
        )}
        <Button label="+ Add Loan" variant="secondary" onPress={() => router.push('/loans/new')} />
      </View>
    </View>
  );
}
