import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Info, Coffee, Wrench, Clock, Database } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { BaseModal } from '../shared/BaseModal';

export interface ReportsCalculationInfoModalProps {
  visible: boolean;
  onClose: () => void;
}

export const ReportsCalculationInfoModal: React.FC<ReportsCalculationInfoModalProps> = ({
  visible,
  onClose,
}) => {
  const { colors, isDark } = useTheme();

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      maxWidth={560}
      maxHeight="85%"
      icon={<Info size={20} color={colors.primaryLight} />}
      title="Report Audit & Calculation Standard"
      subtitle="Operational formulas and vehicle metrics standard"
      footer={
        <View style={styles.auditModalFooter}>
          <TouchableOpacity
            style={[styles.auditCloseBtn, { backgroundColor: colors.primary }]}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={styles.auditCloseBtnText}>Understand & Close</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={styles.auditModalBody}>
        {/* 1. Automated Break Deductions */}
        <View
          style={[
            styles.auditRuleCard,
            { backgroundColor: colors.warningDim, borderColor: colors.warning },
          ]}
        >
          <View style={styles.auditRuleHeader}>
            <Coffee size={15} color={colors.warningLight} />
            <Text style={[styles.auditRuleTitle, { color: colors.warningLight }]}>
              Workshop Shift Break Deductions
            </Text>
          </View>
          <Text style={[styles.auditRuleDesc, { color: colors.textSecondary }]}>
            Statutory workshop rest periods are automatically calculated down to the exact second of
            vehicle tenure overlap and deducted from net working durations:
          </Text>
          <View style={styles.auditBreakScheduleRow}>
            <View
              style={[
                styles.auditBreakBadge,
                {
                  backgroundColor: isDark
                    ? 'rgba(255, 255, 255, 0.06)'
                    : 'rgba(0, 0, 0, 0.04)',
                },
              ]}
            >
              <Text style={[styles.auditBreakBadgeText, { color: colors.textPrimary }]}>
                ☕ Morning Tea: 09:45 – 10:00 (15m)
              </Text>
            </View>
            <View
              style={[
                styles.auditBreakBadge,
                {
                  backgroundColor: isDark
                    ? 'rgba(255, 255, 255, 0.06)'
                    : 'rgba(0, 0, 0, 0.04)',
                },
              ]}
            >
              <Text style={[styles.auditBreakBadgeText, { color: colors.textPrimary }]}>
                🍱 Lunch: 12:30 – 13:00 (30m)
              </Text>
            </View>
            <View
              style={[
                styles.auditBreakBadge,
                {
                  backgroundColor: isDark
                    ? 'rgba(255, 255, 255, 0.06)'
                    : 'rgba(0, 0, 0, 0.04)',
                },
              ]}
            >
              <Text style={[styles.auditBreakBadgeText, { color: colors.textPrimary }]}>
                ☕ Evening Tea: 14:45 – 15:00 (15m)
              </Text>
            </View>
          </View>
        </View>

        {/* 2. Bay Gross Avg Stay Time (Dispatched Bay Velocity) */}
        <View
          style={[
            styles.auditRuleCard,
            { backgroundColor: colors.bayWorkshopDim, borderColor: colors.bayWorkshop },
          ]}
        >
          <View style={styles.auditRuleHeader}>
            <Wrench size={15} color={colors.bayWorkshopLight} />
            <Text style={[styles.auditRuleTitle, { color: colors.bayWorkshopLight }]}>
              Bay Gross Avg Stay Time & Velocity
            </Text>
          </View>
          <Text style={[styles.auditRuleDesc, { color: colors.textSecondary }]}>
            Working bay occupancy (
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>
              Active Labor + Staging Idle
            </Text>
            ) calculated strictly for vehicles that have completed their tasks and dispatched to the
            next station.
          </Text>
          <View
            style={[
              styles.auditPillNote,
              {
                backgroundColor: isDark
                  ? 'rgba(255, 255, 255, 0.05)'
                  : 'rgba(0, 0, 0, 0.03)',
              },
            ]}
          >
            <Text style={[styles.auditPillNoteText, { color: colors.textMuted }]}>
              ⏱ In-progress vehicles currently sitting undispatched are excluded from bay averages
              to ensure historical KPI integrity.
            </Text>
          </View>
          <View
            style={[
              styles.auditPillNote,
              {
                backgroundColor: isDark
                  ? 'rgba(255, 255, 255, 0.05)'
                  : 'rgba(0, 0, 0, 0.03)',
                marginTop: 4,
              },
            ]}
          >
            <Text style={[styles.auditPillNoteText, { color: colors.textMuted }]}>
              🚫 Vehicles with Additional Repairs or placed On Hold are strictly excluded from Bay
              Average Stay Times to protect turnaround benchmark accuracy.
            </Text>
          </View>
        </View>

        {/* 3. Pure Active Labor vs Idle Time Breakdown */}
        <View
          style={[
            styles.auditRuleCard,
            { backgroundColor: colors.bayAlignmentDim, borderColor: colors.bayAlignment },
          ]}
        >
          <View style={styles.auditRuleHeader}>
            <Clock size={15} color={colors.bayAlignmentLight} />
            <Text style={[styles.auditRuleTitle, { color: colors.bayAlignmentLight }]}>
              Net Active Time vs. Idle time
            </Text>
          </View>
          <Text style={[styles.auditRuleDesc, { color: colors.textSecondary }]}>
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Net Working Time</Text>{' '}
            = Gross Turnaround − Shift Breaks.
          </Text>
          <Text style={[styles.auditRuleDesc, { color: colors.textSecondary, marginTop: 4 }]}>
            •{' '}
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Net Active Time</Text>:
            Pure hands-on labor duration logged during active checklist execution.
          </Text>
          <Text style={[styles.auditRuleDesc, { color: colors.textSecondary, marginTop: 2 }]}>
            • <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Idle time</Text>:{' '}
            Duration vehicle spent queued in bay waiting for technician allocation or parts movement.
          </Text>
        </View>

        {/* 4. Autonomous Retention & Daily Rollover */}
        <View
          style={[
            styles.auditRuleCard,
            {
              backgroundColor: isDark
                ? 'rgba(255, 255, 255, 0.03)'
                : 'rgba(0, 0, 0, 0.02)',
              borderColor: colors.borderGlass,
            },
          ]}
        >
          <View style={styles.auditRuleHeader}>
            <Database size={15} color={colors.primaryLight} />
            <Text style={[styles.auditRuleTitle, { color: colors.primaryLight }]}>
              Autonomous Retention & Rollover
            </Text>
          </View>
          <Text style={[styles.auditRuleDesc, { color: colors.textSecondary }]}>
            Historical vehicle logs are preserved for{' '}
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>90 days</Text> with
            automatic archiving. Completed inspection vehicles roll over autonomously.
          </Text>
        </View>
      </View>
    </BaseModal>
  );
};

const styles = StyleSheet.create({
  auditModalFooter: {
    paddingVertical: 4,
  },
  auditCloseBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  auditCloseBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  auditModalBody: {
    gap: 12,
  },
  auditRuleCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  auditRuleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  auditRuleTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  auditRuleDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  auditBreakScheduleRow: {
    gap: 6,
    marginTop: 4,
  },
  auditBreakBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  auditBreakBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  auditPillNote: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  auditPillNoteText: {
    fontSize: 11,
    lineHeight: 16,
  },
});
