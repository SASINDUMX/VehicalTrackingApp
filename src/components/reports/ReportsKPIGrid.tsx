import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Car,
  Clock,
  CheckCircle2,
  Calendar,
  Wrench,
  Navigation,
  Droplets,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { ReportKPIs, formatDuration } from '../../utils/reportExportUtils';

export interface ReportsKPIGridProps {
  kpis: ReportKPIs | null;
}

export const ReportsKPIGrid: React.FC<ReportsKPIGridProps> = ({ kpis }) => {
  const { colors, isDark } = useTheme();

  const completionRate =
    (kpis?.totalVehicles ?? 0) > 0
      ? Math.round(((kpis?.completedCount ?? 0) / (kpis?.totalVehicles ?? 1)) * 100)
      : 0;

  return (
    <View style={styles.kpiContainer}>
      {/* Top Summary: Fleet & Job Status Card */}
      <View
        style={[
          styles.kpiUnifiedCard,
          {
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
            borderColor: colors.borderGlass,
          },
        ]}
      >
        <View style={styles.kpiCardHeaderRow}>
          <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>SERVICE OVERVIEW</Text>
          <Text style={[styles.kpiBottomText, { color: colors.textMuted }]}>
            {completionRate}% COMPLETION RATE
          </Text>
        </View>
        <View style={styles.kpiThreeColRow}>
          {/* Pillar 1: Total Fleet */}
          <View style={styles.kpiCol}>
            <View style={styles.kpiValRow}>
              <Car size={16} color={colors.primaryLight} />
              <Text style={[styles.kpiBigVal, { color: colors.textPrimary }]}>
                {kpis?.totalVehicles ?? 0}
              </Text>
            </View>
            <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>TOTAL FLEET</Text>
          </View>

          {/* Pillar 2: Active */}
          <View style={styles.kpiCol}>
            <View style={styles.kpiValRow}>
              <Clock size={16} color={colors.primaryLight} />
              <Text style={[styles.kpiBigVal, { color: colors.primaryLight }]}>
                {kpis?.inProgressCount ?? 0}
              </Text>
            </View>
            <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>ACTIVE</Text>
          </View>

          {/* Pillar 3: Completed */}
          <View style={styles.kpiCol}>
            <View style={styles.kpiValRow}>
              <CheckCircle2 size={16} color={colors.success} />
              <Text style={[styles.kpiBigVal, { color: colors.success }]}>
                {kpis?.completedCount ?? 0}
              </Text>
            </View>
            <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>COMPLETED</Text>
          </View>

          {/* Pillar 4: Prior Bookings */}
          <View style={styles.kpiCol}>
            <View style={styles.kpiValRow}>
              <Calendar size={16} color={colors.primaryLight} />
              <Text style={[styles.kpiBigVal, { color: colors.primaryLight }]}>
                {kpis?.bookingCount ?? 0}
              </Text>
            </View>
            <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>BOOKINGS</Text>
          </View>

          {/* Pillar 5: Additional Repairs */}
          <View style={styles.kpiCol}>
            <View style={styles.kpiValRow}>
              <Wrench size={16} color={colors.warning} />
              <Text style={[styles.kpiBigVal, { color: colors.warning }]}>
                {kpis?.additionalRepairsCount ?? 0}
              </Text>
            </View>
            <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>EXTRA REPAIRS</Text>
          </View>

          {/* Pillar 6: On Hold / Major Repairs */}
          {kpis?.onHoldCount !== undefined && kpis.onHoldCount > 0 && (
            <View style={styles.kpiCol}>
              <View style={styles.kpiValRow}>
                <Clock size={16} color={colors.warningLight} />
                <Text style={[styles.kpiBigVal, { color: colors.warningLight }]}>
                  {kpis.onHoldCount}
                </Text>
              </View>
              <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>ON HOLD</Text>
            </View>
          )}
        </View>
      </View>

      {/* Bay Velocity Row: 3 Bays */}
      <View style={styles.kpiBayRow}>
        {/* Workshop Bay KPI */}
        <View
          style={[
            styles.kpiCard,
            styles.kpiBayCard,
            { backgroundColor: colors.bayWorkshopDim, borderColor: colors.bayWorkshop },
          ]}
        >
          <View style={styles.kpiCardHeaderRow}>
            <Text style={[styles.kpiLabel, { color: colors.bayWorkshopLight }]}>WORKSHOP</Text>
          </View>
          <View style={styles.kpiValRow}>
            <Wrench size={15} color={colors.bayWorkshopLight} />
            <View style={styles.kpiMetricCol}>
              <Text style={[styles.kpiVal, { color: colors.bayWorkshopLight }]}>
                {formatDuration(kpis?.workshopBay?.avgStageSec ?? 0)}
              </Text>
              <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>
                BAY GROSS AVG STAY TIME
              </Text>
            </View>
          </View>
          <View style={[styles.kpiValRow, styles.kpiActiveRow]}>
            <Clock size={13} color={colors.primaryLight} />
            <View style={styles.kpiMetricCol}>
              <Text style={[styles.kpiActiveVal, { color: colors.primaryLight }]}>
                {formatDuration(kpis?.workshopBay?.avgActiveSec ?? 0)}
              </Text>
              <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>
                BAY AVG ACTIVE TIME
              </Text>
            </View>
          </View>
          <View style={styles.kpiBottomRow}>
            <Text style={[styles.kpiBottomText, { color: colors.textMuted }]}>
              {kpis?.workshopBay?.vehicleCount ?? 0} vehicles
            </Text>
          </View>
        </View>

        {/* Wheel Alignment Bay KPI */}
        <View
          style={[
            styles.kpiCard,
            styles.kpiBayCard,
            { backgroundColor: colors.bayAlignmentDim, borderColor: colors.bayAlignment },
          ]}
        >
          <View style={styles.kpiCardHeaderRow}>
            <Text style={[styles.kpiLabel, { color: colors.bayAlignmentLight }]}>ALIGNMENT</Text>
          </View>
          <View style={styles.kpiValRow}>
            <Navigation size={15} color={colors.bayAlignmentLight} />
            <View style={styles.kpiMetricCol}>
              <Text style={[styles.kpiVal, { color: colors.bayAlignmentLight }]}>
                {formatDuration(kpis?.alignmentBay?.avgStageSec ?? 0)}
              </Text>
              <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>
                BAY GROSS AVG STAY TIME
              </Text>
            </View>
          </View>
          <View style={[styles.kpiValRow, styles.kpiActiveRow]}>
            <Clock size={13} color={colors.primaryLight} />
            <View style={styles.kpiMetricCol}>
              <Text style={[styles.kpiActiveVal, { color: colors.primaryLight }]}>
                {formatDuration(kpis?.alignmentBay?.avgActiveSec ?? 0)}
              </Text>
              <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>
                BAY AVG ACTIVE TIME
              </Text>
            </View>
          </View>
          <View style={styles.kpiBottomRow}>
            <Text style={[styles.kpiBottomText, { color: colors.textMuted }]}>
              {kpis?.alignmentBay?.vehicleCount ?? 0} vehicles
            </Text>
          </View>
        </View>

        {/* Hoist Bay KPI */}
        <View
          style={[
            styles.kpiCard,
            styles.kpiBayCard,
            { backgroundColor: colors.bayHoistDim, borderColor: colors.bayHoist },
          ]}
        >
          <View style={styles.kpiCardHeaderRow}>
            <Text style={[styles.kpiLabel, { color: colors.bayHoistLight }]}>HOIST</Text>
          </View>
          <View style={styles.kpiValRow}>
            <Droplets size={15} color={colors.bayHoistLight} />
            <View style={styles.kpiMetricCol}>
              <Text style={[styles.kpiVal, { color: colors.bayHoistLight }]}>
                {formatDuration(kpis?.hoistBay?.avgStageSec ?? 0)}
              </Text>
              <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>
                BAY GROSS AVG STAY TIME
              </Text>
            </View>
          </View>
          <View style={[styles.kpiValRow, styles.kpiActiveRow]}>
            <Clock size={13} color={colors.success} />
            <View style={styles.kpiMetricCol}>
              <Text style={[styles.kpiActiveVal, { color: colors.success }]}>
                {formatDuration(kpis?.hoistBay?.avgActiveSec ?? 0)}
              </Text>
              <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>
                BAY AVG ACTIVE TIME
              </Text>
            </View>
          </View>
          <View style={styles.kpiBottomRow}>
            <Text style={[styles.kpiBottomText, { color: colors.textMuted }]}>
              {kpis?.hoistBay?.vehicleCount ?? 0} vehicles
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  kpiContainer: {
    gap: 12,
    marginBottom: 16,
  },
  kpiUnifiedCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  kpiCardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  kpiBottomText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  kpiThreeColRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  kpiCol: {
    gap: 3,
    minWidth: 90,
  },
  kpiValRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kpiBigVal: {
    fontSize: 20,
    fontWeight: '900',
  },
  kpiSubLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  kpiBayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    minWidth: 200,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  kpiBayCard: {
    justifyContent: 'space-between',
  },
  kpiMetricCol: {
    gap: 1,
  },
  kpiVal: {
    fontSize: 16,
    fontWeight: '900',
  },
  kpiActiveRow: {
    marginTop: 2,
  },
  kpiActiveVal: {
    fontSize: 13,
    fontWeight: '800',
  },
  kpiBottomRow: {
    marginTop: 4,
  },
});
