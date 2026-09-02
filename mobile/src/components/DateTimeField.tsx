import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Button } from './Button';

interface DateTimeFieldProps {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  error?: string;
}

const formatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * Cross-platform date+time picker. Android's native pickers are dialogs (the library's own
 * recommendation is the imperative DateTimePickerAndroid API, chaining a date dialog into a time
 * dialog); iOS renders an inline spinner that needs its own "Done" affordance to dismiss.
 */
export function DateTimeField({ label, value, onChange, error }: DateTimeFieldProps) {
  const [showIosPicker, setShowIosPicker] = useState(false);

  const openAndroidPickers = () => {
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      onValueChange: (_event, selectedDate) => {
        if (!selectedDate) return;
        DateTimePickerAndroid.open({
          value: selectedDate,
          mode: 'time',
          onValueChange: (_timeEvent, selectedDateTime) => {
            if (selectedDateTime) onChange(selectedDateTime);
          },
        });
      },
    });
  };

  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-ink">{label}</Text>
      <Pressable
        onPress={() => (Platform.OS === 'android' ? openAndroidPickers() : setShowIosPicker(true))}
        className={`rounded-xl border px-4 py-3 ${error ? 'border-rose' : 'border-clay/30'}`}
      >
        <Text className="text-base text-ink">{formatter.format(value)}</Text>
      </Pressable>
      {error ? <Text className="text-xs text-rose">{error}</Text> : null}

      {Platform.OS === 'ios' && showIosPicker ? (
        <View className="gap-2">
          <DateTimePicker value={value} mode="datetime" display="spinner" onValueChange={(_event, date) => onChange(date)} />
          <Button label="Done" variant="secondary" onPress={() => setShowIosPicker(false)} />
        </View>
      ) : null}
    </View>
  );
}
