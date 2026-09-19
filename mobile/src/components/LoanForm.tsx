import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { loanSchema, type LoanFormValues } from '../validation/loan';
import { AccountPickerField } from './AccountPickerField';
import { Button } from './Button';
import { DateTimeField } from './DateTimeField';
import { FilterChip } from './FilterChip';
import { TextField } from './TextField';
import type { Account, CoupleMember } from '../types/entities';

interface LoanFormProps {
  initialValues: LoanFormValues;
  accounts: Account[];
  members: CoupleMember[];
  currentUserId: string | undefined;
  paymentAccountId: string;
  onPaymentAccountChange: (id: string) => void;
  /** Null means Joint. */
  ownerUserId: string | null;
  onOwnerChange: (id: string | null) => void;
  submitLabel: string;
  isSubmitting: boolean;
  serverError: string | null;
  onSubmit: (values: LoanFormValues) => void;
  onDelete?: () => void;
  isDeleting?: boolean;
}

/**
 * Shared by app/loans/new.tsx and app/loans/[id].tsx — follows SavingsGoalForm.tsx's shape, plus
 * the payment account and owner pickers (both outside react-hook-form, same "form for text
 * fields, separate state for pickers" split app/savings-goals/[id].tsx already uses for its own
 * account picker). Owner is never hardcoded "You"/"Her" — it's built from the couple's actual
 * membership, same derivation the Money Calculator's Wants split already uses.
 */
export function LoanForm({
  initialValues,
  accounts,
  members,
  currentUserId,
  paymentAccountId,
  onPaymentAccountChange,
  ownerUserId,
  onOwnerChange,
  submitLabel,
  isSubmitting,
  serverError,
  onSubmit,
  onDelete,
  isDeleting,
}: LoanFormProps) {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoanFormValues>({ resolver: zodResolver(loanSchema), defaultValues: initialValues });

  const ownerLabel = (userId: string) => (userId === currentUserId ? 'You' : members.find((m) => m.user_id === userId)?.display_name ?? 'Partner');

  return (
    <View className="gap-4">
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <TextField label="Loan Name" value={field.value} onChangeText={field.onChange} error={errors.name?.message} placeholder="e.g. Shopee PayLater" />
        )}
      />

      <Controller
        control={control}
        name="provider"
        render={({ field }) => (
          <TextField label="Provider (optional)" value={field.value} onChangeText={field.onChange} error={errors.provider?.message} placeholder="e.g. Shopee" />
        )}
      />

      <Controller
        control={control}
        name="originalAmountText"
        render={({ field }) => (
          <TextField
            label="Original Amount"
            value={field.value}
            onChangeText={field.onChange}
            keyboardType="decimal-pad"
            placeholder="0.00"
            error={errors.originalAmountText?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="monthlyPaymentText"
        render={({ field }) => (
          <TextField
            label="Monthly Payment"
            value={field.value}
            onChangeText={field.onChange}
            keyboardType="decimal-pad"
            placeholder="0.00"
            error={errors.monthlyPaymentText?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="totalInstallmentsText"
        render={({ field }) => (
          <TextField
            label="Total Installments"
            value={field.value}
            onChangeText={field.onChange}
            keyboardType="number-pad"
            placeholder="e.g. 6"
            error={errors.totalInstallmentsText?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="firstDueDate"
        render={({ field }) => <DateTimeField label="First Due Date" value={field.value} onChange={field.onChange} mode="date" error={errors.firstDueDate?.message} />}
      />
      <Text className="-mt-2 text-xs text-clay">Every later installment falls one month after this date — see the Payment Schedule on the loan's details page.</Text>

      <Controller
        control={control}
        name="feesAmountText"
        render={({ field }) => (
          <TextField
            label="Interest / Fees (optional)"
            value={field.value}
            onChangeText={field.onChange}
            keyboardType="decimal-pad"
            placeholder="0.00"
            error={errors.feesAmountText?.message}
          />
        )}
      />

      <AccountPickerField label="Payment Account" accounts={accounts} value={paymentAccountId} onChange={onPaymentAccountChange} />

      <View className="gap-1.5">
        <Text className="text-sm font-medium text-ink">Owner</Text>
        <View className="flex-row flex-wrap gap-2">
          <FilterChip label="Joint" active={ownerUserId === null} onPress={() => onOwnerChange(null)} />
          {members.map((m) => (
            <FilterChip key={m.user_id} label={ownerLabel(m.user_id)} active={ownerUserId === m.user_id} onPress={() => onOwnerChange(m.user_id)} />
          ))}
        </View>
      </View>

      {serverError ? <Text className="text-sm text-error">{serverError}</Text> : null}

      <Button label={submitLabel} onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
      {onDelete ? <Button label="Delete loan" variant="secondary" onPress={onDelete} loading={isDeleting} /> : null}
    </View>
  );
}
