import { Pressable, Text, View } from 'react-native';
import { chunkIntoRows } from '../utils/accountGrid';
import { getMonthGridDays, isSameLocalDay } from '../utils/calendarMonth';

const GRID_COLUMNS = 7;

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

interface MonthCalendarGridProps {
  /** The month being displayed (any date within it — only year/month are read). */
  displayedMonth: Date;
  selectedDate: Date;
  today: Date;
  /** Local-day keys (see calendarGrouping.getDatesWithEvents) marking which days show a dot. */
  datesWithEvents: Set<string>;
  onSelectDate: (date: Date) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Hand-rolled month grid (no calendar-library dependency, matching "don't introduce a different
 * component library" — see Phase 2 spec) — a fixed 6x7 grid, tap a day to select it, dots mark
 * days with at least one event.
 */
export function MonthCalendarGrid({
  displayedMonth,
  selectedDate,
  today,
  datesWithEvents,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}: MonthCalendarGridProps) {
  const days = getMonthGridDays(displayedMonth.getFullYear(), displayedMonth.getMonth());
  // Explicit row-chunking (see accountGrid.chunkIntoRows), not a single flex-wrap row of
  // percentage-width cells: 7 * (100/7)% doesn't land on exactly 100% in floating point, and
  // rounding that fraction to device pixels could push the 7th cell in a row to wrap onto the
  // next line on some screens/pixel densities but not others — a real "Sunday's cell just isn't
  // there" bug reported on one device and not another. A fixed-row layout can't wrap at all.
  const weeks = chunkIntoRows(days, GRID_COLUMNS);

  return (
    <View className="gap-2 rounded-2xl bg-blush p-3">
      <View className="flex-row items-center justify-between px-1">
        <Pressable onPress={onPrevMonth} hitSlop={8} accessibilityLabel="Previous month">
          <Text className="text-lg text-ink">‹</Text>
        </Pressable>
        <Text className="text-base font-semibold text-ink">{monthFormatter.format(displayedMonth)}</Text>
        <Pressable onPress={onNextMonth} hitSlop={8} accessibilityLabel="Next month">
          <Text className="text-lg text-ink">›</Text>
        </Pressable>
      </View>

      <View className="flex-row">
        {WEEKDAY_LABELS.map((label, i) => (
          <Text key={i} className="flex-1 text-center text-xs font-medium text-clay">
            {label}
          </Text>
        ))}
      </View>

      <View className="gap-0">
        {weeks.map((week) => (
          <View key={week[0].date.toISOString()} className="flex-row">
            {week.map(({ date, inCurrentMonth }) => {
              const selected = isSameLocalDay(date, selectedDate);
              const isToday = isSameLocalDay(date, today);
              const hasEvents = datesWithEvents.has(dayKey(date));

              return (
                <Pressable
                  key={dayKey(date)}
                  onPress={() => onSelectDate(date)}
                  className="items-center justify-center py-1.5"
                  style={{ flex: 1 }}
                >
                  <View className={`h-8 w-8 items-center justify-center rounded-full ${selected ? 'bg-rose' : ''}`}>
                    <Text
                      className={`text-sm ${selected ? 'font-semibold text-cream' : isToday ? 'font-semibold text-rose' : inCurrentMonth ? 'text-ink' : 'text-clay/40'}`}
                    >
                      {date.getDate()}
                    </Text>
                  </View>
                  <View className={`mt-0.5 h-1 w-1 rounded-full ${hasEvents ? 'bg-rose' : 'bg-transparent'}`} />
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
