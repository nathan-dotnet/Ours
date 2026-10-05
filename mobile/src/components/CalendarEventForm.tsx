import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, Switch, Text, View } from 'react-native';
import type { z } from 'zod';
import { calendarEventSchema, REMINDER_OPTIONS, type CalendarEventFormValues } from '../validation/calendar';
import { Button } from './Button';
import { DateTimeField } from './DateTimeField';
import { FilterChip } from './FilterChip';
import { TextField } from './TextField';

export interface CalendarEventFormInitialValues {
  title: string;
  description: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  location: string;
  reminderMinutesBefore: number | null;
  repeatType: CalendarEventFormValues['repeatType'];
  repeatIntervalText: string;
  repeatUntilText: string;
  repeatForever: boolean;
  repeatDaysOfWeek: number;
}

interface CalendarEventFormProps {
  initialValues: CalendarEventFormInitialValues;
  submitLabel: string;
  isSubmitting: boolean;
  serverError: string | null;
  onSubmit: (values: CalendarEventFormValues) => void;
  onDelete?: () => void;
  isDeleting?: boolean;
  showRecurrence?: boolean;
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
  showRecurrence = true,
}: CalendarEventFormProps) {
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<z.input<typeof calendarEventSchema>, unknown, CalendarEventFormValues>({
    resolver: zodResolver(calendarEventSchema),
    defaultValues: initialValues,
  });

  const reminderMinutesBefore = watch('reminderMinutesBefore');
  const allDay = watch('allDay');
  const repeatType = watch('repeatType');
  const repeatForever = watch('repeatForever') ?? true;
  const repeatDaysOfWeek = watch('repeatDaysOfWeek') ?? 0;

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
        name="location"
        render={({ field }) => (
          <TextField label="Location (optional)" value={field.value ?? ''} onChangeText={field.onChange} />
        )}
      />

      <Controller
        control={control}
        name="allDay"
        render={({ field }) => (
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-medium text-ink">All day</Text>
            <Switch value={field.value} onValueChange={field.onChange} />
          </View>
        )}
      />

      <Controller
        control={control}
        name="startAt"
        render={({ field }) => <DateTimeField label="Starts" value={field.value} onChange={field.onChange} mode={allDay ? 'date' : 'datetime'} />}
      />

      {allDay ? null : (
        <Controller
          control={control}
          name="endAt"
          render={({ field }) => <DateTimeField label="Ends" value={field.value} onChange={field.onChange} error={errors.endAt?.message} />}
        />
      )}

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

      {showRecurrence ? (
        <View className="gap-3 border-t border-clay/20 pt-4">
          <Text className="text-sm font-semibold text-ink">Repeats</Text>
          <View className="flex-row flex-wrap gap-2">
            {(['None', 'Daily', 'Weekly', 'Monthly', 'Yearly'] as const).map((option) => (
              <FilterChip key={option} label={option} active={repeatType === option} onPress={() => setValue('repeatType', option)} />
            ))}
          </View>
          {repeatType !== 'None' ? (
            <>
              <TextField
                label="Every (interval)"
                value={watch('repeatIntervalText')}
                onChangeText={(value) => setValue('repeatIntervalText', value)}
                keyboardType="number-pad"
                error={errors.repeatIntervalText?.message}
              />
              {repeatType === 'Weekly' ? (
                <View className="gap-1.5">
                  <Text className="text-sm font-medium text-ink">Days</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, day) => {
                      const bit = 1 << day;
                      return <FilterChip key={label} label={label} active={(repeatDaysOfWeek & bit) !== 0} onPress={() => setValue('repeatDaysOfWeek', repeatDaysOfWeek ^ bit)} />;
                    })}
                  </View>
                </View>
              ) : null}
              <View className="gap-1.5">
                <Text className="text-sm font-medium text-ink">Ends</Text>
                <View className="flex-row gap-2">
                  <FilterChip label="Repeat forever" active={repeatForever} onPress={() => { setValue('repeatForever', true); setValue('repeatUntilText', ''); }} />
                  <FilterChip label="Until date" active={!repeatForever} onPress={() => setValue('repeatForever', false)} />
                </View>
              </View>
              {!repeatForever ? (
                <TextField
                  label="Repeat until (YYYY-MM-DD)"
                  value={watch('repeatUntilText')}
                  onChangeText={(value) => setValue('repeatUntilText', value)}
                  placeholder="2026-12-31"
                  error={errors.repeatUntilText?.message}
                />
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}

      {serverError ? <Text className="text-sm text-rose">{serverError}</Text> : null}

      <Button label={submitLabel} onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
      {onDelete ? <Button label="Delete event" variant="secondary" onPress={onDelete} loading={isDeleting} /> : null}
    </View>
  );
}
