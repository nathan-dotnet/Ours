import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { savingsGoalSchema, type SavingsGoalFormValues } from '../validation/savingsGoal';
import { Button } from './Button';
import { TextField } from './TextField';

interface SavingsGoalFormProps {
  initialValues: SavingsGoalFormValues;
  submitLabel: string;
  isSubmitting: boolean;
  serverError: string | null;
  onSubmit: (values: SavingsGoalFormValues) => void;
  onDelete?: () => void;
  isDeleting?: boolean;
}

/** Shared by app/savings-goals/new.tsx and app/savings-goals/[id].tsx — follows BudgetForm.tsx's shape. */
export function SavingsGoalForm({ initialValues, submitLabel, isSubmitting, serverError, onSubmit, onDelete, isDeleting }: SavingsGoalFormProps) {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SavingsGoalFormValues>({ resolver: zodResolver(savingsGoalSchema), defaultValues: initialValues });

  return (
    <View className="gap-4">
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <TextField label="Name" value={field.value} onChangeText={field.onChange} error={errors.name?.message} placeholder="e.g. Emergency Fund" />
        )}
      />

      <Controller
        control={control}
        name="targetAmountText"
        render={({ field }) => (
          <TextField
            label="Target Amount"
            value={field.value}
            onChangeText={field.onChange}
            keyboardType="decimal-pad"
            placeholder="0.00"
            error={errors.targetAmountText?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="allocationPercentText"
        render={({ field }) => (
          <TextField
            label="Automatic share (optional)"
            value={field.value}
            onChangeText={field.onChange}
            keyboardType="decimal-pad"
            placeholder="e.g. 30"
            error={errors.allocationPercentText?.message}
          />
        )}
      />
      <Text className="-mt-2 text-xs text-clay">
        This goal's share of your monthly Savings allocation when you use Distribute Money on the Calculator. Leave blank for a manual-only goal.
      </Text>

      {serverError ? <Text className="text-sm text-rose">{serverError}</Text> : null}

      <Button label={submitLabel} onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
      {onDelete ? <Button label="Delete goal" variant="secondary" onPress={onDelete} loading={isDeleting} /> : null}
    </View>
  );
}
