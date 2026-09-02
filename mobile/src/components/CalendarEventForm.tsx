import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, Text, View } from 'react-native';
import { calendarEventSchema, REMINDER_OPTIONS, type CalendarEventFormValues } from '../validation/calendar';
import { Button } from './Button';
import { DateTimeField } from './DateTimeField';
import { TextField } from './TextField';

export interface CalendarEventFormInitialValues {
  title: string;
  description: string;
  startAt: Date;
  endAt: Date;
  reminderMinutesBefore: number | null;
}

interface CalendarEventFormProps {
  initialValues: CalendarEventFormInitialValues;
  submitLabel: string;
  isSubmitting: boolean;
  serverError: string | null;
  onSubmit: (values: CalendarEventFormValues) => void;
  onDelete?: () => void;
  isDeleting?: boolean;
}

/** Shared by app/calendar/new.tsx and app/calendar/[id].tsx so create/edit stay in lockstep. */
export function CalendarEventForm({
  initialValues,
  submitLabel,
  isSubmitting,
  serverError,
  onSubmit,
  onDelete,
  isDeleting = false,
}: CalendarEventFormProps) {
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CalendarEventFormValues>({
    resolver: zodResolver(calendarEventSchema),
    defaultValues: initialValues,
  });

  const reminderMinutesBefore = watch('reminderMinutesBefore');

  return (
    <View className="gap-4">
      <Controller
        control={control}
        name="title"
        render={({ field }) => (
          <TextField label="Title" value={field.value} onChangeText={field.onChange} error={errors.title?.message} />
        )}
      />

      <Controller
        control={control}
        name="description"
        render={({ field }) => (
          <TextField
            label="Description (optional)"
            value={field.value}
            onChangeText={field.onChange}
            multiline
            numberOfLines={3}
          />
        )}
      />

      <Controller
        control={control}
        name="startAt"
        render={({ field }) => <DateTimeField label="Starts" value={field.value} onChange={field.onChange} />}
      />

      <Controller
        control={control}
        name="endAt"
        render={({ field }) => <DateTimeField label="Ends" value={field.value} onChange={field.onChange} error={errors.endAt?.message} />}
      />

      <View className="gap-1.5">
        <Text className="text-sm font-medium text-ink">Reminder</Text>
        <View className="flex-row flex-wrap gap-2">
          {REMINDER_OPTIONS.map((option) => {
            const selected = option.minutesBefore === reminderMinutesBefore;
            return (
              <Pressable
                key={option.label}
                onPress={() => setValue('reminderMinutesBefore', option.minutesBefore)}
                className={`rounded-full px-3 py-2 ${selected ? 'bg-rose' : 'bg-blush'}`}
              >
                <Text className={`text-xs font-medium ${selected ? 'text-cream' : 'text-clay'}`}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {serverError ? <Text className="text-sm text-rose">{serverError}</Text> : null}

      <Button label={submitLabel} onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
      {onDelete ? <Button label="Delete event" variant="secondary" onPress={onDelete} loading={isDeleting} /> : null}
    </View>
  );
}
