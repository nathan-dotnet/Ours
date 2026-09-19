import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, Text, View } from 'react-native';
import type { Account, CoupleMember } from '../types/entities';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  expenseTransactionSchema,
  incomeTransactionSchema,
  transferTransactionSchema,
  type ExpenseTransactionFormValues,
  type IncomeTransactionFormValues,
  type TransferTransactionFormValues,
} from '../validation/transaction';
import { AccountPickerField } from './AccountPickerField';
import { Button } from './Button';
import { CategoryPickerField } from './CategoryPickerField';
import { DateTimeField } from './DateTimeField';
import { TextField } from './TextField';

interface CommonProps<TValues> {
  accounts: Account[];
  initialValues: TValues;
  submitLabel: string;
  isSubmitting: boolean;
  serverError: string | null;
  onSubmit: (values: TValues) => void;
  onDelete?: () => void;
  isDeleting?: boolean;
}

function DeleteButton({ onDelete, isDeleting }: { onDelete?: () => void; isDeleting?: boolean }) {
  return onDelete ? <Button label="Delete transaction" variant="secondary" onPress={onDelete} loading={isDeleting} /> : null;
}

export function ExpenseTransactionForm({
  accounts,
  members,
  initialValues,
  submitLabel,
  isSubmitting,
  serverError,
  onSubmit,
  onDelete,
  isDeleting,
}: CommonProps<ExpenseTransactionFormValues> & { members: CoupleMember[] }) {
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ExpenseTransactionFormValues>({ resolver: zodResolver(expenseTransactionSchema), defaultValues: initialValues });

  const category = watch('category');
  const accountId = watch('accountId');
  const paidByUserId = watch('paidByUserId');

  return (
    <View className="gap-4">
      <Controller
        control={control}
        name="amountText"
        render={({ field }) => (
          <TextField label="Amount" value={field.value} onChangeText={field.onChange} keyboardType="decimal-pad" placeholder="0.00" error={errors.amountText?.message} />
        )}
      />
      <CategoryPickerField
        label="Category"
        presets={EXPENSE_CATEGORIES}
        value={category}
        onChange={(value) => setValue('category', value, { shouldValidate: true })}
        error={errors.category?.message}
      />
      <AccountPickerField label="Account" accounts={accounts} value={accountId} onChange={(v) => setValue('accountId', v)} error={errors.accountId?.message} />
      <Controller
        control={control}
        name="description"
        render={({ field }) => <TextField label="Description (optional)" value={field.value ?? ''} onChangeText={field.onChange} />}
      />
      <Controller
        control={control}
        name="transactionDate"
        render={({ field }) => <DateTimeField label="Date" value={field.value} onChange={field.onChange} mode="date" />}
      />
      {members.length > 0 ? (
        <View className="gap-1.5">
          <Text className="text-sm font-medium text-ink">Paid by (optional)</Text>
          <View className="flex-row flex-wrap gap-2">
            {members.map((member) => (
              <Pressable
                key={member.user_id}
                onPress={() => setValue('paidByUserId', paidByUserId === member.user_id ? null : member.user_id)}
                className={`rounded-full px-3 py-2 ${paidByUserId === member.user_id ? 'bg-rose' : 'bg-blush'}`}
              >
                <Text className={`text-xs font-medium ${paidByUserId === member.user_id ? 'text-cream' : 'text-clay'}`}>{member.display_name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <Controller
        control={control}
        name="notes"
        render={({ field }) => <TextField label="Notes (optional)" value={field.value ?? ''} onChangeText={field.onChange} multiline numberOfLines={3} />}
      />
      {serverError ? <Text className="text-sm text-rose">{serverError}</Text> : null}
      <Button label={submitLabel} onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
      <DeleteButton onDelete={onDelete} isDeleting={isDeleting} />
    </View>
  );
}

export function IncomeTransactionForm({ accounts, initialValues, submitLabel, isSubmitting, serverError, onSubmit, onDelete, isDeleting }: CommonProps<IncomeTransactionFormValues>) {
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<IncomeTransactionFormValues>({ resolver: zodResolver(incomeTransactionSchema), defaultValues: initialValues });

  const category = watch('category');
  const accountId = watch('accountId');

  return (
    <View className="gap-4">
      <Controller
        control={control}
        name="amountText"
        render={({ field }) => (
          <TextField label="Amount" value={field.value} onChangeText={field.onChange} keyboardType="decimal-pad" placeholder="0.00" error={errors.amountText?.message} />
        )}
      />
      <View className="gap-1.5">
        <Text className="text-sm font-medium text-ink">Category</Text>
        <View className="flex-row flex-wrap gap-2">
          {INCOME_CATEGORIES.map((option) => (
            <Pressable key={option} onPress={() => setValue('category', option)} className={`rounded-full px-3 py-2 ${option === category ? 'bg-rose' : 'bg-blush'}`}>
              <Text className={`text-xs font-medium ${option === category ? 'text-cream' : 'text-clay'}`}>{option}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <AccountPickerField label="Account" accounts={accounts} value={accountId} onChange={(v) => setValue('accountId', v)} error={errors.accountId?.message} />
      <Controller
        control={control}
        name="description"
        render={({ field }) => <TextField label="Description (optional)" value={field.value ?? ''} onChangeText={field.onChange} />}
      />
      <Controller
        control={control}
        name="transactionDate"
        render={({ field }) => <DateTimeField label="Date" value={field.value} onChange={field.onChange} mode="date" />}
      />
      <Controller
        control={control}
        name="notes"
        render={({ field }) => <TextField label="Notes (optional)" value={field.value ?? ''} onChangeText={field.onChange} multiline numberOfLines={3} />}
      />
      {serverError ? <Text className="text-sm text-rose">{serverError}</Text> : null}
      <Button label={submitLabel} onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
      <DeleteButton onDelete={onDelete} isDeleting={isDeleting} />
    </View>
  );
}

export function TransferTransactionForm({ accounts, initialValues, submitLabel, isSubmitting, serverError, onSubmit, onDelete, isDeleting }: CommonProps<TransferTransactionFormValues>) {
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TransferTransactionFormValues>({ resolver: zodResolver(transferTransactionSchema), defaultValues: initialValues });

  const accountId = watch('accountId');
  const destinationAccountId = watch('destinationAccountId');

  return (
    <View className="gap-4">
      <Controller
        control={control}
        name="amountText"
        render={({ field }) => (
          <TextField label="Amount" value={field.value} onChangeText={field.onChange} keyboardType="decimal-pad" placeholder="0.00" error={errors.amountText?.message} />
        )}
      />
      <AccountPickerField label="From" accounts={accounts} value={accountId} onChange={(v) => setValue('accountId', v)} error={errors.accountId?.message} />
      <AccountPickerField
        label="To"
        accounts={accounts.filter((a) => a.id !== accountId)}
        value={destinationAccountId}
        onChange={(v) => setValue('destinationAccountId', v)}
        error={errors.destinationAccountId?.message}
      />
      <Controller
        control={control}
        name="transactionDate"
        render={({ field }) => <DateTimeField label="Date" value={field.value} onChange={field.onChange} mode="date" />}
      />
      <Controller
        control={control}
        name="notes"
        render={({ field }) => <TextField label="Notes (optional)" value={field.value ?? ''} onChangeText={field.onChange} multiline numberOfLines={3} />}
      />
      {serverError ? <Text className="text-sm text-rose">{serverError}</Text> : null}
      <Button label={submitLabel} onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
      <DeleteButton onDelete={onDelete} isDeleting={isDeleting} />
    </View>
  );
}
