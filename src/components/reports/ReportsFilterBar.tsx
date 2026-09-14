import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Calendar, Filter } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { ThemeDatePicker } from '../shared/ThemeDatePicker';
import { DateFilterPreset, StatusFilterPreset } from '../../utils/reportExportUtils';

export interface ReportsFilterBarProps {
  datePreset: DateFilterPreset;
  statusPreset: StatusFilterPreset;
  customDate: string;
  customEndDate: string;
  dateRangeStr: string;
  datePresets: { id: DateFilterPreset; label: string }[];
  statusPresets: { id: StatusFilterPreset; label: string }[];
  onSelectDatePreset: (preset: DateFilterPreset) => void;
  onSelectStatusPreset: (preset: StatusFilterPreset) => void;
  onCustomDateChange: (date: string) => void;
  onCustomEndDateChange: (date: string) => void;
}

export const ReportsFilterBar: React.FC<ReportsFilterBarProps> = ({
  datePreset,
  statusPreset,
  customDate,
  customEndDate,
  dateRangeStr,
  datePresets,
  statusPresets,
  onSelectDatePreset,
  onSelectStatusPreset,
  onCustomDateChange,
  onCustomEndDateChange,
}) => {
  const { colors, isDark } = useTheme();

  return (
    <View
      style={[
        styles.filterSection,
        {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
          borderColor: colors.borderGlass,
        },
      ]}
    >
      {/* Date Range Presets */}
      <View style={styles.filterGroup}>
        <View style={styles.filterLabelRow}>
          <Calendar size={13} color={colors.primaryLight} />
          <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>DATE RANGE PRESET:</Text>
          <View
            style={[
              styles.activeRangeBadge,
              { backgroundColor: colors.primaryDim, borderColor: colors.primaryBorder },
            ]}
          >
            <Text style={[styles.activeRangeBadgeText, { color: colors.primaryLight }]}>
              {dateRangeStr}
            </Text>
          </View>
        </View>
        <View style={styles.pillRow}>
          {datePresets.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[
                styles.filterPill,
                datePreset === p.id && {
                  backgroundColor: colors.primaryDim,
                  borderColor: colors.primary,
                },
              ]}
              onPress={() => onSelectDatePreset(p.id)}
            >
              <Text
                style={[
                  styles.filterPillText,
                  { color: datePreset === p.id ? colors.primaryLight : colors.textMuted },
                  datePreset === p.id && styles.activePillText,
                ]}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* From / To Date Pickers */}
      <View style={styles.datePickerRow}>
        <ThemeDatePicker
          label="FROM:"
          value={customDate}
          onChange={onCustomDateChange}
          maxDate={customEndDate || undefined}
        />
        <ThemeDatePicker
          label="TO:"
          value={customEndDate}
          onChange={onCustomEndDateChange}
          minDate={customDate || undefined}
        />
      </View>

      {/* Job Status Filter */}
      <View
        style={[
          styles.filterGroup,
          { paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderGlass },
        ]}
      >
        <View style={styles.filterLabelRow}>
          <Filter size={13} color={colors.primaryLight} />
          <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>JOB STATUS:</Text>
        </View>
        <View style={styles.pillRow}>
          {statusPresets.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[
                styles.filterPill,
                statusPreset === s.id && {
                  backgroundColor: colors.primaryDim,
                  borderColor: colors.primary,
                },
              ]}
              onPress={() => onSelectStatusPreset(s.id)}
            >
              <Text
                style={[
                  styles.filterPillText,
                  { color: statusPreset === s.id ? colors.primaryLight : colors.textMuted },
                  statusPreset === s.id && styles.activePillText,
                ]}
              >
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  filterSection: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    marginBottom: 16,
  },
  filterGroup: {
    gap: 8,
  },
  filterLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  filterLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  activeRangeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  activeRangeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  activePillText: {
    fontWeight: '800',
  },
  datePickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
});
