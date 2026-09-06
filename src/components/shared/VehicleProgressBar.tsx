import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { StatusPill } from './StatusPill';

export interface VehicleProgressBarProps {
  completedCount: number;
  totalRequired: number;
  percent: number;
  isCurrentTaskDone?: boolean;
  isStageIdle?: boolean;
  compact?: boolean;
}

export const VehicleProgressBar: React.FC<VehicleProgressBarProps> = ({
  completedCount,
  totalRequired,
  percent,
  isCurrentTaskDone = false,
  isStageIdle = false,
  compact = false,
}) => {
  const { colors } = useTheme();

  const statusVariant = isCurrentTaskDone ? 'DONE' : isStageIdle ? 'IDLE' : 'ACTIVE';
  const fillColor = isCurrentTaskDone ? colors.success : isStageIdle ? colors.warning : colors.primary;

  return (
    <View style={compact ? styles.compactContainer : styles.standardContainer}>
      {/* Bar Line */}
      <View style={[styles.barBackground, { backgroundColor: colors.progressBg }]}>
        <View
          style={[
            styles.barFill,
            {
              width: `${Math.min(100, Math.max(0, percent))}%`,
              backgroundColor: fillColor,
            },
          ]}
        />
      </View>

      {/* Label & Status Pill */}
      <View style={styles.labelRow}>
        <Text style={[styles.labelText, { color: colors.textSecondary }]}>
          {compact
            ? `JOB SHEET PROGRESS · ${completedCount}/${totalRequired} (${percent}%)`
            : `JOB SHEET PROGRESS (${completedCount}/${totalRequired} · ${percent}%)`}
        </Text>
        <StatusPill variant={statusVariant} label={statusVariant} size="sm" />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  standardContainer: {
    width: '100%',
    marginTop: 2,
  },
  compactContainer: {
    width: '100%',
    marginTop: 2,
  },
  barBackground: {
    height: 4,
    borderRadius: 2,
    width: '100%',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  labelText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
