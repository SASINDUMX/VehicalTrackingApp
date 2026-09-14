import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Calendar, ChevronLeft, ChevronRight, X, Check } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

interface ThemeDatePickerProps {
  label?: string;
  value: string; // YYYY-MM-DD
  onChange: (dateStr: string) => void;
  placeholder?: string;
  maxDate?: string;
  minDate?: string;
  style?: StyleProp<ViewStyle>;
}

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const ThemeDatePicker: React.FC<ThemeDatePickerProps> = ({
  label,
  value,
  onChange,
  placeholder = 'Select Date',
  maxDate,
  minDate,
  style,
}) => {
  const { colors, isDark } = useTheme();
  const [isCalendarOpen, setIsCalendarOpen] = useState<boolean>(false);

  // Parse initial viewing month/year from current value or today
  const initialDate = useMemo(() => {
    if (value && value.length === 10) {
      const parts = value.split('-').map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        return new Date(parts[0], parts[1] - 1, parts[2]);
      }
    }
    return new Date();
  }, [value]);

  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDate.getMonth());

  const handleOpen = () => {
    setViewYear(initialDate.getFullYear());
    setViewMonth(initialDate.getMonth());
    setIsCalendarOpen(true);
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(prev => prev - 1);
    } else {
      setViewMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(prev => prev + 1);
    } else {
      setViewMonth(prev => prev + 1);
    }
  };

  // Generate calendar grid for the viewing month
  const calendarGrid = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells: { day: number; isCurrentMonth: boolean; dateStr: string; disabled: boolean }[] = [];

    // Prev month padding days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const m = viewMonth === 0 ? 12 : viewMonth;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({
        day,
        isCurrentMonth: false,
        dateStr: dStr,
        disabled: true,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      let disabled = false;
      if (minDate && dateStr < minDate) disabled = true;
      if (maxDate && dateStr > maxDate) disabled = true;

      cells.push({
        day: d,
        isCurrentMonth: true,
        dateStr,
        disabled,
      });
    }

    // Next month padding days to complete 42 cells grid (6 rows)
    const remaining = 42 - cells.length;
    for (let n = 1; n <= remaining; n++) {
      const m = viewMonth === 11 ? 1 : viewMonth + 2;
      const y = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dStr = `${y}-${String(m).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
      cells.push({
        day: n,
        isCurrentMonth: false,
        dateStr: dStr,
        disabled: true,
      });
    }

    return cells;
  }, [viewYear, viewMonth, minDate, maxDate]);

  const handleSelectDate = (dateStr: string) => {
    onChange(dateStr);
    setIsCalendarOpen(false);
  };

  const formattedDisplay = useMemo(() => {
    if (!value) return placeholder;
    const parts = value.split('-');
    if (parts.length === 3) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const mIdx = Number(parts[1]) - 1;
      return `${parts[2]} ${months[mIdx] || parts[1]} ${parts[0]}`;
    }
    return value;
  }, [value, placeholder]);

  return (
    <View style={[styles.container, style]}>
      {Boolean(label) && (
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      )}

      {/* Trigger Button styled with glass theme */}
      <TouchableOpacity
        style={[
          styles.triggerBtn,
          {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.7)' : '#ffffff',
            borderColor: colors.borderGlass,
          },
        ]}
        onPress={handleOpen}
        activeOpacity={0.7}
      >
        <Calendar size={13} color={colors.primaryLight} />
        <Text
          style={[
            styles.triggerText,
            {
              color: value ? colors.textPrimary : colors.textMuted,
            },
          ]}
        >
          {formattedDisplay}
        </Text>
      </TouchableOpacity>

      {/* Themed Custom Calendar Modal */}
      <Modal
        visible={isCalendarOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsCalendarOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setIsCalendarOpen(false)}
        >
          <Pressable
            style={[
              styles.calendarCard,
              {
                backgroundColor: isDark ? '#0f172a' : '#ffffff',
                borderColor: isDark ? 'rgba(56, 189, 248, 0.25)' : '#cbd5e1',
                shadowColor: colors.primary,
              },
            ]}
            onPress={e => e.stopPropagation()}
          >
            {/* Calendar Header Bar */}
            <View style={styles.calHeader}>
              <TouchableOpacity
                style={[styles.navBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)' }]}
                onPress={handlePrevMonth}
                activeOpacity={0.7}
              >
                <ChevronLeft size={16} color={colors.textPrimary} />
              </TouchableOpacity>

              <Text style={[styles.monthYearTitle, { color: colors.textPrimary }]}>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </Text>

              <TouchableOpacity
                style={[styles.navBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)' }]}
                onPress={handleNextMonth}
                activeOpacity={0.7}
              >
                <ChevronRight size={16} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Day of Week Headers */}
            <View style={styles.daysHeaderRow}>
              {DAYS_OF_WEEK.map(d => (
                <Text key={d} style={[styles.dayOfWeekText, { color: colors.textMuted }]}>
                  {d}
                </Text>
              ))}
            </View>

            {/* Grid of Days */}
            <View style={styles.gridContainer}>
              {calendarGrid.map((cell, idx) => {
                const isSelected = cell.dateStr === value;
                const isToday = cell.dateStr === new Date().toISOString().split('T')[0];

                if (!cell.isCurrentMonth) {
                  return (
                    <View key={idx} style={styles.dayCell}>
                      <Text style={[styles.dayText, { color: isDark ? '#334155' : '#cbd5e1', opacity: 0.4 }]}>
                        {cell.day}
                      </Text>
                    </View>
                  );
                }

                return (
                  <TouchableOpacity
                    key={idx}
                    disabled={cell.disabled}
                    style={[
                      styles.dayCell,
                      cell.disabled && styles.disabledCell,
                      isToday && !isSelected && {
                        borderColor: colors.primaryBorder,
                        borderWidth: 1,
                      },
                      isSelected && {
                        backgroundColor: colors.primary,
                        shadowColor: colors.primary,
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.4,
                        shadowRadius: 4,
                        elevation: 3,
                      },
                    ]}
                    onPress={() => handleSelectDate(cell.dateStr)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        {
                          color: isSelected
                            ? '#ffffff'
                            : cell.disabled
                            ? colors.textMuted
                            : isToday
                            ? colors.primaryLight
                            : colors.textPrimary,
                          fontWeight: isSelected || isToday ? '800' : '500',
                        },
                      ]}
                    >
                      {cell.day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Quick Actions Footer */}
            <View style={[styles.calFooter, { borderTopColor: colors.borderGlass }]}>
              <TouchableOpacity
                style={[styles.todayActionBtn, { backgroundColor: colors.primaryDim }]}
                onPress={() => {
                  const todayStr = new Date().toISOString().split('T')[0];
                  handleSelectDate(todayStr);
                }}
              >
                <Text style={[styles.todayActionText, { color: colors.primaryLight }]}>Select Today</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setIsCalendarOpen(false)}
              >
                <Text style={[styles.closeBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  triggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  triggerText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  calendarCard: {
    width: 290,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  navBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthYearTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  daysHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  dayOfWeekText: {
    width: 34,
    textAlign: 'center',
    fontSize: 10.5,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  dayCell: {
    width: 34,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginVertical: 1.5,
  },
  disabledCell: {
    opacity: 0.25,
  },
  dayText: {
    fontSize: 12,
  },
  calFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  todayActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  todayActionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  closeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  closeBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
});

