import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { EXPENSE_CATEGORIES } from '../validation/transaction';
import { budgetSchema, type BudgetFormValues } from '../validation/budget';
import { Button } from './Button';
import { CategoryPickerField } from './CategoryPickerField';
import { TextField } from './TextField';

interface BudgetFormProps {
  initialValues: BudgetFormValues;
  /** Once a budget exists, its category can no longer change (that would just be a different budget) — only the amount is editable. */
  categoryLocked: boolean;
  submitLabel: string;
  isSubmitting: boolean;
  serverError: string | null;
  onSubmit: (values: BudgetFormValues) => void;
  onDelete?: () => void;
  isDeleting?: boolean;
}

export function BudgetForm({ initialValues, categoryLocked, submitLabel, isSubmitting, serverError, onSubmit, onDelete, isDeleting }: BudgetFormProps) {
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<BudgetFormValues>({ resolver: zodResolver(budgetSchema), defaultValues: initialValues });

  const category = watch('category');

  return (
    <View className="gap-4">
      <CategoryPickerField
        label="Category"
        presets={EXPENSE_CATEGORIES}
        value={category}
        onChange={(value) => setValue('category', value, { shouldValidate: true })}
        disabled={categoryLocked}
        error={errors.category?.message}
      />

      <Controller
        control={control}
        name="amountText"
        render={({ field }) => (
          <TextField
            label="Monthly Budget"
            value={field.value}
            onChangeText={field.onChange}
            keyboardType="decimal-pad"
            placeholder="0.00"
            error={errors.amountText?.message}
          />
        )}
      />

      {serverError ? <Text className="text-sm text-rose">{serverError}</Text> : null}

      <Button label={submitLabel} onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
      {onDelete ? <Button label="Delete budget" variant="secondary" onPress={onDelete} loading={isDeleting} /> : null}
    </View>
  );
}
