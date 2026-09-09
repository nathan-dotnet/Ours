import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, Text, View } from 'react-native';
import { createVaultItemSchema, editVaultItemSchema, VAULT_CATEGORIES, type CreateVaultItemFormValues } from '../validation/vault';
import { Button } from './Button';
import { PasswordField } from './PasswordField';
import { PasswordGeneratorPanel } from './PasswordGeneratorPanel';
import { TextField } from './TextField';

export interface VaultItemFormValues {
  title: string;
  username?: string;
  password?: string;
  websiteUrl?: string;
  category: CreateVaultItemFormValues['category'];
  notes?: string;
}

interface VaultItemFormProps {
  initialValues: VaultItemFormValues;
  /** Create requires a password; edit treats a blank password field as "leave it unchanged" (see validation/vault.ts). */
  passwordRequired: boolean;
  submitLabel: string;
  isSubmitting: boolean;
  serverError: string | null;
  onSubmit: (values: VaultItemFormValues) => void;
  onDelete?: () => void;
  isDeleting?: boolean;
}

/** Shared by app/vault/new.tsx and app/vault/[id].tsx, following CalendarEventForm.tsx's shape. */
export function VaultItemForm({
  initialValues,
  passwordRequired,
  submitLabel,
  isSubmitting,
  serverError,
  onSubmit,
  onDelete,
  isDeleting = false,
}: VaultItemFormProps) {
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<VaultItemFormValues>({
    resolver: zodResolver(passwordRequired ? createVaultItemSchema : editVaultItemSchema),
    defaultValues: initialValues,
  });

  const category = watch('category');

  return (
    <View className="gap-4">
      <Controller
        control={control}
        name="title"
        render={({ field }) => (
          <TextField label="Title" value={field.value} onChangeText={field.onChange} placeholder="Netflix" error={errors.title?.message} />
        )}
      />

      <Controller
        control={control}
        name="username"
        render={({ field }) => (
          <TextField
            label="Account / Username (optional)"
            value={field.value ?? ''}
            onChangeText={field.onChange}
            placeholder="example@gmail.com"
            autoCapitalize="none"
          />
        )}
      />

      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <PasswordField
            label={passwordRequired ? 'Password' : 'Password (leave blank to keep the current one)'}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            error={errors.password?.message}
          />
        )}
      />

      <PasswordGeneratorPanel onUsePassword={(password) => setValue('password', password)} />

      <Controller
        control={control}
        name="websiteUrl"
        render={({ field }) => (
          <TextField
            label="Website (optional)"
            value={field.value ?? ''}
            onChangeText={field.onChange}
            placeholder="https://netflix.com"
            autoCapitalize="none"
            keyboardType="url"
          />
        )}
      />

      <View className="gap-1.5">
        <Text className="text-sm font-medium text-ink">Category</Text>
        <View className="flex-row flex-wrap gap-2">
          {VAULT_CATEGORIES.map((option) => {
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
        name="notes"
        render={({ field }) => (
          <TextField label="Notes (optional)" value={field.value ?? ''} onChangeText={field.onChange} multiline numberOfLines={3} placeholder="Family account…" />
        )}
      />

      {serverError ? <Text className="text-sm text-rose">{serverError}</Text> : null}

      <Button label={submitLabel} onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
      {onDelete ? <Button label="Delete password" variant="secondary" onPress={onDelete} loading={isDeleting} /> : null}
    </View>
  );
}
