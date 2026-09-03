import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, Text, View } from 'react-native';
import { EXPENSE_CATEGORIES, expenseSchema, type ExpenseFormValues } from '../validation/expense';
import { Button } from './Button';
import { DateTimeField } from './DateTimeField';
import { TextField } from './TextField';

export interface ExpenseFormInitialValues {
  amountText: string;
  currency: string;
  category: ExpenseFormValues['category'];
  description: string;
  expenseDate: Date;
  notes: string;
}

interface ExpenseFormProps {
  initialValues: ExpenseFormInitialValues;
  submitLabel: string;
  isSubmitting: boolean;
  serverError: string | null;
  onSubmit: (values: ExpenseFormValues) => void;
  onDelete?: () => void;
  isDeleting?: boolean;
}

/** Shared by app/expenses/new.tsx and app/expenses/[id].tsx, following CalendarEventForm.tsx's shape. */
export function ExpenseForm({
  initialValues,
  submitLabel,
  isSubmitting,
  serverError,
  onSubmit,
  onDelete,
  isDeleting = false,
}: ExpenseFormProps) {
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: initialValues,
  });

  const category = watch('category');

  return (
    <View className="gap-4">
      <Controller
        control={control}
        name="amountText"
        render={({ field }) => (
          <TextField
            label={`Amount (${initialValues.currency})`}
            value={field.value}
            onChangeText={field.onChange}
            keyboardType="decimal-pad"
            placeholder="0.00"
            error={errors.amountText?.message}
          />
        )}
      />

      <View className="gap-1.5">
        <Text className="text-sm font-medium text-ink">Category</Text>
        <View className="flex-row flex-wrap gap-2">
          {EXPENSE_CATEGORIES.map((option) => {
            const selected = option === category;
            return (
              <Pressable
                key={option}
                onPress={() => setValue('category', option)}
                className={`rounded-full px-3 py-2 ${selected ? 'bg-rose' : 'bg-blush'}`}
              >
                <Text className={`text-xs font-medium ${selected ? 'text-cream' : 'text-clay'}`}>{option}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Controller
        control={control}
        name="description"
        render={({ field }) => (
          <TextField label="Description (optional)" value={field.value} onChangeText={field.onChange} />
        )}
      />

      <Controller
        control={control}
        name="expenseDate"
        render={({ field }) => <DateTimeField label="Date" value={field.value} onChange={field.onChange} mode="date" />}
      />

      <Controller
        control={control}
        name="notes"
        render={({ field }) => (
          <TextField label="Notes (optional)" value={field.value} onChangeText={field.onChange} multiline numberOfLines={3} />
        )}
      />

      {serverError ? <Text className="text-sm text-rose">{serverError}</Text> : null}

      <Button label={submitLabel} onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
      {onDelete ? <Button label="Delete expense" variant="secondary" onPress={onDelete} loading={isDeleting} /> : null}
    </View>
  );
}
