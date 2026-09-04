import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, Text, View } from 'react-native';
import { ACCOUNT_ICON_OPTIONS, getAccountBrand } from '../utils/accountBrand';
import { ACCOUNT_TYPES, accountSchema, type AccountFormValues } from '../validation/account';
import { Button } from './Button';
import { TextField } from './TextField';

export interface AccountFormInitialValues {
  name: string;
  type: AccountFormValues['type'];
  icon: string;
  openingBalanceText: string;
  currency: string;
  isActive: boolean;
}

interface AccountFormProps {
  initialValues: AccountFormInitialValues;
  /** Once an account exists, its opening balance can no longer be edited — see the Phase 3 spec's "Account balance model". */
  openingBalanceLocked: boolean;
  submitLabel: string;
  isSubmitting: boolean;
  serverError: string | null;
  onSubmit: (values: AccountFormValues) => void;
  onDeactivate?: () => void;
}

/** Shared by app/accounts/new.tsx and app/accounts/[id].tsx, following CalendarEventForm.tsx's shape. */
export function AccountForm({
  initialValues,
  openingBalanceLocked,
  submitLabel,
  isSubmitting,
  serverError,
  onSubmit,
  onDeactivate,
}: AccountFormProps) {
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: initialValues,
  });

  const type = watch('type');
  const icon = watch('icon');

  return (
    <View className="gap-4">
      <Controller
        control={control}
        name="name"
        render={({ field }) => <TextField label="Name" value={field.value} onChangeText={field.onChange} error={errors.name?.message} placeholder="e.g. BPI" />}
      />

      <View className="gap-1.5">
        <Text className="text-sm font-medium text-ink">Type</Text>
        <View className="flex-row flex-wrap gap-2">
          {ACCOUNT_TYPES.map((option) => {
            const selected = option === type;
            return (
              <Pressable
                key={option}
                onPress={() => setValue('type', option)}
                className={`rounded-full px-3 py-2 ${selected ? 'bg-rose' : 'bg-blush'}`}
              >
                <Text className={`text-xs font-medium ${selected ? 'text-cream' : 'text-clay'}`}>{option}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="gap-1.5">
        <Text className="text-sm font-medium text-ink">Brand</Text>
        <View className="flex-row flex-wrap gap-2">
          {ACCOUNT_ICON_OPTIONS.map((option) => {
            const selected = option === icon;
            const brand = getAccountBrand(option, type);
            return (
              <Pressable
                key={option}
                onPress={() => setValue('icon', option)}
                className={`flex-row items-center gap-1.5 rounded-full px-3 py-2 ${selected ? 'bg-rose' : 'bg-blush'}`}
              >
                <Text>{brand.emoji}</Text>
                <Text className={`text-xs font-medium ${selected ? 'text-cream' : 'text-clay'}`}>{brand.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Controller
        control={control}
        name="openingBalanceText"
        render={({ field }) =>
          openingBalanceLocked ? (
            <TextField label="Starting Balance" value={field.value} editable={false} />
          ) : (
            <TextField
              label="Starting Balance"
              value={field.value}
              onChangeText={field.onChange}
              keyboardType="decimal-pad"
              placeholder="0.00"
              error={errors.openingBalanceText?.message}
            />
          )
        }
      />

      <Controller
        control={control}
        name="currency"
        render={({ field }) => (
          <TextField label="Currency" value={field.value} onChangeText={field.onChange} autoCapitalize="characters" maxLength={3} error={errors.currency?.message} />
        )}
      />

      {serverError ? <Text className="text-sm text-rose">{serverError}</Text> : null}

      <Button label={submitLabel} onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
      {onDeactivate ? <Button label="Deactivate account" variant="secondary" onPress={onDeactivate} /> : null}
    </View>
  );
}
