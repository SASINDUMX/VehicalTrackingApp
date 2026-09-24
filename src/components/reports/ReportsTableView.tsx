import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Car } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { LicensePlate } from '../shared/LicensePlate';
import { StatusPill } from '../shared/StatusPill';
import { LoadingSpot } from '../shared/LoadingSpot';
import { EmptyStateCard } from '../shared/EmptyStateCard';
import { Vehicle } from '../../types/vehicle';
import {
  ServerReportRecord,
  formatDuration,
  formatFirstInTime,
  getStageTimingForZone,
  getVehicleIdleAndActiveTotals,
  getVehicleEffectiveCompletion,
} from '../../utils/reportExportUtils';
import { getBreakOverlap } from '../../utils/workshopHoursUtils';
import { APP_TERMINOLOGY } from '../../constants/terminology';

export interface ReportsTableViewProps {
  filteredVehicles: (Vehicle | ServerReportRecord)[];
  isLoadingReport: boolean;
  isMultiDate: boolean;
}

export const ReportsTableView: React.FC<ReportsTableViewProps> = ({
  filteredVehicles,
  isLoadingReport,
  isMultiDate,
}) => {
  const { colors, isDark } = useTheme();

  return (
    <View
      style={[
        styles.tableContainer,
        {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
          borderColor: colors.borderGlass,
        },
      ]}
    >
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableTitle, { color: colors.textPrimary }]}>
          Report Records Preview ({filteredVehicles.length} vehicles matching)
        </Text>
      </View>

      {isLoadingReport ? (
        <LoadingSpot message={APP_TERMINOLOGY.telemetry.loadingReportRecords} />
      ) : filteredVehicles.length === 0 ? (
        <EmptyStateCard
          icon={Car}
          title={APP_TERMINOLOGY.emptyStates.noReportRecordsTitle}
          subtitle={APP_TERMINOLOGY.emptyStates.noReportRecordsSubtitle}
        />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={true}
          contentContainerStyle={styles.tableScroll}
        >
          <View>
            {/* Table Header Row 1: Top Grouped Categories */}
            <View
              style={[
                styles.thRowTop,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                  borderBottomColor: colors.borderGlass,
                },
              ]}
            >
              <Text style={[styles.thCell, styles.colPlate, { color: colors.textSecondary }]}>
                VEHICLE NO
              </Text>
              <Text style={[styles.thCell, styles.colStatus, { color: colors.textSecondary }]}>
                STATUS
              </Text>
              {isMultiDate && (
                <Text style={[styles.thCell, styles.colDate, { color: colors.textSecondary }]}>
                  DATE
                </Text>
              )}
              <Text style={[styles.thCell, styles.colTime, { color: colors.textSecondary }]}>
                INTAKE
              </Text>
              <Text style={[styles.thCell, styles.colTime, { color: colors.textSecondary }]}>
                FINISHED
              </Text>
              <Text style={[styles.thCell, styles.colTime, { color: colors.textSecondary }]}>
                TOTAL STAY
              </Text>
              <Text style={[styles.thCell, styles.colTime, { color: colors.textSecondary }]}>
                ACTIVE WORK
              </Text>
              <Text style={[styles.thCell, styles.colTime, { color: colors.textSecondary }]}>
                TOTAL IDLE
              </Text>
              <Text style={[styles.thCell, styles.colTime, { color: colors.warning }]}>
                BREAKS
              </Text>
              <View
                style={[
                  styles.thGroupHeader,
                  { borderColor: colors.borderGlass, backgroundColor: colors.bayWorkshopDim },
                ]}
              >
                <Text style={[styles.thGroupHeaderText, { color: colors.bayWorkshopLight }]}>
                  {APP_TERMINOLOGY.tasks.general_service.label.toUpperCase()}
                </Text>
              </View>
              <View
                style={[
                  styles.thGroupHeader,
                  { borderColor: colors.borderGlass, backgroundColor: colors.bayAlignmentDim },
                ]}
              >
                <Text style={[styles.thGroupHeaderText, { color: colors.bayAlignmentLight }]}>
                  {APP_TERMINOLOGY.tasks.wheel_alignment.label.toUpperCase()}
                </Text>
              </View>
              <View
                style={[
                  styles.thGroupHeader,
                  { borderColor: colors.borderGlass, backgroundColor: colors.bayHoistDim },
                ]}
              >
                <Text style={[styles.thGroupHeaderText, { color: colors.bayHoistLight }]}>
                  {APP_TERMINOLOGY.tasks.hoist_service.label.toUpperCase()}
                </Text>
              </View>
              <Text style={[styles.thCell, styles.colTasks, { color: colors.textSecondary }]}>
                TASKS
              </Text>
              <Text style={[styles.thCell, styles.colRemarks, { color: colors.textSecondary }]}>
                REMARKS / PRIORITY
              </Text>
            </View>

            {/* Table Header Row 2: Sub-Headers (Idle / Active / Breaks per bay) */}
            <View
              style={[
                styles.thRowSub,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                  borderBottomColor: colors.borderGlass,
                },
              ]}
            >
              <View style={styles.colPlate} />
              <View style={styles.colStatus} />
              {isMultiDate && <View style={styles.colDate} />}
              <View style={styles.colTime} />
              <View style={styles.colTime} />
              <View style={styles.colTime} />
              <View style={styles.colTime} />
              <View style={styles.colTime} />
              <View style={styles.colTime} />
              {/* General Service sub-headers */}
              <Text style={[styles.thSubCell, styles.colSubBay, { color: colors.primaryLight }]}>
                FIRST IN
              </Text>
              <Text style={[styles.thSubCell, styles.colSubBay, { color: colors.warning }]}>
                IDLE
              </Text>
              <Text style={[styles.thSubCell, styles.colSubBay, { color: colors.primaryLight }]}>
                ACTIVE
              </Text>
              <Text style={[styles.thSubCell, styles.colSubBay, { color: colors.warning }]}>
                BREAKS
              </Text>
              {/* Wheel Alignment sub-headers */}
              <Text style={[styles.thSubCell, styles.colSubBay, { color: colors.primaryLight }]}>
                FIRST IN
              </Text>
              <Text style={[styles.thSubCell, styles.colSubBay, { color: colors.warning }]}>
                IDLE
              </Text>
              <Text style={[styles.thSubCell, styles.colSubBay, { color: colors.primaryLight }]}>
                ACTIVE
              </Text>
              <Text style={[styles.thSubCell, styles.colSubBay, { color: colors.warning }]}>
                BREAKS
              </Text>
              {/* Hoist Service sub-headers */}
              <Text style={[styles.thSubCell, styles.colSubBay, { color: colors.primaryLight }]}>
                FIRST IN
              </Text>
              <Text style={[styles.thSubCell, styles.colSubBay, { color: colors.warning }]}>
                IDLE
              </Text>
              <Text style={[styles.thSubCell, styles.colSubBay, { color: colors.primaryLight }]}>
                ACTIVE
              </Text>
              <Text style={[styles.thSubCell, styles.colSubBay, { color: colors.warning }]}>
                BREAKS
              </Text>
              <View style={styles.colTasks} />
              <View style={styles.colRemarks} />
            </View>

            {/* Rows */}
            {filteredVehicles.map((v: any) => {
              const isServerRecord = 'total_idle_sec' in v && 'workshop_idle' in v;

              let isEffectiveDone = false;
              let intakeDateStr = '--';
              let intakeStr = '--:--';
              let finishedStr = 'In Progress';
              let grossSec = 0;
              let activeWorkSec = 0;
              let totalIdleSec = 0;
              let breakSeconds = 0;
              let wsFirstIn: string | null = null;
              let wsIdle = 0,
                wsActive = 0,
                wsBreak = 0;
              let alFirstIn: string | null = null;
              let alIdle = 0,
                alActive = 0,
                alBreak = 0;
              let hsFirstIn: string | null = null;
              let hsIdle = 0,
                hsActive = 0,
                hsBreak = 0;
              let taskSummaryDisplay = '';

              if (isServerRecord) {
                const rec = v as ServerReportRecord;
                isEffectiveDone = rec.is_effective_done;
                const start = new Date(rec.intake_at || rec.created_at);
                if (!Number.isNaN(start.getTime())) {
                  intakeDateStr = start.toLocaleDateString('en-US', {
                    day: '2-digit',
                    month: 'short',
                    timeZone: 'Asia/Colombo',
                  });
                  intakeStr = start.toLocaleTimeString('en-US', {
                    timeZone: 'Asia/Colombo',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  });
                }

                if (rec.effective_completed_at) {
                  const end = new Date(rec.effective_completed_at);
                  if (!Number.isNaN(end.getTime())) {
                    finishedStr = end.toLocaleTimeString('en-US', {
                      timeZone: 'Asia/Colombo',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    });
                  }
                }

                grossSec =
                  rec.gross_tat_seconds > 0
                    ? rec.gross_tat_seconds
                    : Math.max(
                        0,
                        Math.floor(
                          ((rec.effective_completed_at
                            ? new Date(rec.effective_completed_at).getTime()
                            : Date.now()) -
                            start.getTime()) /
                            1000
                        )
                      );
                activeWorkSec = rec.total_active_sec;
                totalIdleSec = rec.total_idle_sec;
                wsFirstIn = rec.workshop_first_in || null;
                wsIdle = rec.workshop_idle;
                wsActive = rec.workshop_active;
                wsBreak = rec.workshop_break > 0 ? rec.workshop_break : (v.stage_logs ? getStageTimingForZone(v, 'workshop').breakSec : 0);
                alFirstIn = rec.alignment_first_in || null;
                alIdle = rec.alignment_idle;
                alActive = rec.alignment_active;
                alBreak = rec.alignment_break > 0 ? rec.alignment_break : (v.stage_logs ? getStageTimingForZone(v, 'alignment').breakSec : 0);
                hsFirstIn = rec.hoist_first_in || null;
                hsIdle = rec.hoist_idle;
                hsActive = rec.hoist_active;
                hsBreak = rec.hoist_break > 0 ? rec.hoist_break : (v.stage_logs ? getStageTimingForZone(v, 'hoist').breakSec : 0);
                breakSeconds = rec.total_break_seconds > 0
                  ? rec.total_break_seconds
                  : (wsBreak + alBreak + hsBreak > 0
                      ? (wsBreak + alBreak + hsBreak)
                      : getBreakOverlap(start, rec.effective_completed_at ? new Date(rec.effective_completed_at) : new Date()).breakSeconds);

                if (rec.tasks_total_count !== undefined && rec.tasks_total_count > 0) {
                  taskSummaryDisplay = `${rec.tasks_completed_count ?? 0}/${rec.tasks_total_count}`;
                } else if (rec.completed_tasks_str && rec.completed_tasks_str !== 'None') {
                  const count = rec.completed_tasks_str.split(';').length;
                  taskSummaryDisplay = `${count}/${count}`;
                } else {
                  taskSummaryDisplay = '0/0';
                }
              } else {
                const eff = getVehicleEffectiveCompletion(v);
                isEffectiveDone = eff.isEffectiveDone;
                const start = new Date(v.intake_at || v.created_at);
                const end = eff.effectiveCompletionDate ? eff.effectiveCompletionDate : new Date();
                grossSec = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
                const totals = getVehicleIdleAndActiveTotals(v);
                totalIdleSec = totals.totalIdleSec;
                activeWorkSec = totals.totalActiveSec;
                const breaks = getBreakOverlap(start, end);
                breakSeconds = breaks.breakSeconds;

                if (!Number.isNaN(start.getTime())) {
                  intakeDateStr = start.toLocaleDateString('en-US', {
                    day: '2-digit',
                    month: 'short',
                    timeZone: 'Asia/Colombo',
                  });
                  intakeStr = start.toLocaleTimeString('en-US', {
                    timeZone: 'Asia/Colombo',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  });
                }
                finishedStr =
                  isEffectiveDone &&
                  eff.effectiveCompletionDate &&
                  !Number.isNaN(eff.effectiveCompletionDate.getTime())
                    ? eff.effectiveCompletionDate.toLocaleTimeString('en-US', {
                        timeZone: 'Asia/Colombo',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : 'In Progress';

                const workshopTiming = getStageTimingForZone(v, 'workshop');
                const alignmentTiming = getStageTimingForZone(v, 'alignment');
                const hoistTiming = getStageTimingForZone(v, 'hoist');
                wsFirstIn = workshopTiming.firstIn;
                wsIdle = workshopTiming.idleSec;
                wsActive = workshopTiming.activeSec;
                wsBreak = workshopTiming.breakSec;
                alFirstIn = alignmentTiming.firstIn;
                alIdle = alignmentTiming.idleSec;
                alActive = alignmentTiming.activeSec;
                alBreak = alignmentTiming.breakSec;
                hsFirstIn = hoistTiming.firstIn;
                hsIdle = hoistTiming.idleSec;
                hsActive = hoistTiming.activeSec;
                hsBreak = hoistTiming.breakSec;

                const completedTasks = (v.tasks || []).filter((t: any) => t.is_completed).length;
                const totalTasks = (v.tasks || []).filter((t: any) => t.is_required).length;
                taskSummaryDisplay = `${completedTasks}/${totalTasks}`;
              }

              const isUrgent = Boolean(v.is_urgent);
              const urgentNote = v.urgent_note ? String(v.urgent_note).trim() : null;
              const remarksText = v.remarks ? String(v.remarks).trim() : '';

              const isHold = Boolean(v.is_on_hold || v.is_paused || v.status === 'on_hold');

              return (
                <View
                  key={v.id}
                  style={[styles.tdRow, { borderBottomColor: colors.borderGlass }]}
                >
                  <View style={[styles.tdCell, styles.colPlate]}>
                    <LicensePlate number={v.vehicle_no} size="sm" />
                  </View>
                  <View style={[styles.tdCell, styles.colStatus]}>
                    <StatusPill
                      variant={isHold ? 'IDLE' : isEffectiveDone ? 'DONE' : 'ACTIVE'}
                      label={
                        isHold
                          ? 'ON HOLD'
                          : isEffectiveDone
                          ? 'DONE'
                          : v.current_zone === 'workshop'
                          ? 'GENERAL'
                          : v.current_zone.toUpperCase()
                      }
                      size="sm"
                    />
                  </View>
                  {isMultiDate && (
                    <Text
                      style={[
                        styles.tdText,
                        styles.colDate,
                        { color: colors.textSecondary, fontWeight: '600' },
                      ]}
                    >
                      {intakeDateStr}
                    </Text>
                  )}
                  <Text style={[styles.tdText, styles.colTime, { color: colors.textSecondary }]}>
                    {intakeStr}
                  </Text>
                  <Text
                    style={[
                      styles.tdText,
                      styles.colTime,
                      {
                        color: isEffectiveDone ? colors.success : colors.warningLight,
                        fontWeight: isEffectiveDone ? '700' : '400',
                      },
                    ]}
                  >
                    {finishedStr}
                  </Text>
                  <Text
                    style={[
                      styles.tdText,
                      styles.colTime,
                      { color: colors.primaryLight, fontWeight: '700' },
                    ]}
                  >
                    {formatDuration(grossSec)}
                  </Text>
                  <Text
                    style={[
                      styles.tdText,
                      styles.colTime,
                      { color: colors.primaryLight, fontWeight: '700' },
                    ]}
                  >
                    {formatDuration(activeWorkSec)}
                  </Text>
                  <Text
                    style={[
                      styles.tdText,
                      styles.colTime,
                      { color: colors.warning, fontWeight: '700' },
                    ]}
                  >
                    {formatDuration(totalIdleSec)}
                  </Text>
                  <Text
                    style={[
                      styles.tdText,
                      styles.colTime,
                      {
                        color: breakSeconds > 0 ? colors.warning : colors.textMuted,
                        fontWeight: '700',
                      },
                    ]}
                  >
                    {breakSeconds > 0 ? formatDuration(breakSeconds) : '-'}
                  </Text>
                  {/* General Workshop (First In / Idle / Active / Breaks) */}
                  <Text
                    style={[
                      styles.tdText,
                      styles.colSubBay,
                      { color: colors.textSecondary, fontWeight: '600' },
                    ]}
                  >
                    {formatFirstInTime(wsFirstIn)}
                  </Text>
                  <Text style={[styles.tdText, styles.colSubBay, { color: colors.warning }]}>
                    {wsIdle > 0 ? formatDuration(wsIdle) : '-'}
                  </Text>
                  <Text
                    style={[
                      styles.tdText,
                      styles.colSubBay,
                      wsActive > 7200
                        ? {
                            backgroundColor: colors.dangerDim,
                            color: colors.dangerLight,
                            fontWeight: '900',
                            borderRadius: 4,
                          }
                        : { color: colors.primaryLight, fontWeight: '700' },
                    ]}
                  >
                    {wsActive > 7200
                      ? `🚩 ${formatDuration(wsActive)}`
                      : wsActive > 0
                      ? formatDuration(wsActive)
                      : '-'}
                  </Text>
                  <Text
                    style={[
                      styles.tdText,
                      styles.colSubBay,
                      { color: wsBreak > 0 ? colors.warning : colors.textMuted },
                    ]}
                  >
                    {wsBreak > 0 ? formatDuration(wsBreak) : '-'}
                  </Text>
                  {/* Wheel Alignment (First In / Idle / Active / Breaks) */}
                  <Text
                    style={[
                      styles.tdText,
                      styles.colSubBay,
                      { color: colors.textSecondary, fontWeight: '600' },
                    ]}
                  >
                    {formatFirstInTime(alFirstIn)}
                  </Text>
                  <Text style={[styles.tdText, styles.colSubBay, { color: colors.warning }]}>
                    {alIdle > 0 ? formatDuration(alIdle) : '-'}
                  </Text>
                  <Text
                    style={[
                      styles.tdText,
                      styles.colSubBay,
                      alActive > 7200
                        ? {
                            backgroundColor: colors.dangerDim,
                            color: colors.dangerLight,
                            fontWeight: '900',
                            borderRadius: 4,
                          }
                        : { color: colors.primaryLight, fontWeight: '700' },
                    ]}
                  >
                    {alActive > 7200
                      ? `🚩 ${formatDuration(alActive)}`
                      : alActive > 0
                      ? formatDuration(alActive)
                      : '-'}
                  </Text>
                  <Text
                    style={[
                      styles.tdText,
                      styles.colSubBay,
                      { color: alBreak > 0 ? colors.warning : colors.textMuted },
                    ]}
                  >
                    {alBreak > 0 ? formatDuration(alBreak) : '-'}
                  </Text>
                  {/* Hoist Service (First In / Idle / Active / Breaks) */}
                  <Text
                    style={[
                      styles.tdText,
                      styles.colSubBay,
                      { color: colors.textSecondary, fontWeight: '600' },
                    ]}
                  >
                    {formatFirstInTime(hsFirstIn)}
                  </Text>
                  <Text style={[styles.tdText, styles.colSubBay, { color: colors.warning }]}>
                    {hsIdle > 0 ? formatDuration(hsIdle) : '-'}
                  </Text>
                  <Text
                    style={[
                      styles.tdText,
                      styles.colSubBay,
                      hsActive > 7200
                        ? {
                            backgroundColor: colors.dangerDim,
                            color: colors.dangerLight,
                            fontWeight: '900',
                            borderRadius: 4,
                          }
                        : { color: colors.primaryLight, fontWeight: '700' },
                    ]}
                  >
                    {hsActive > 7200
                      ? `🚩 ${formatDuration(hsActive)}`
                      : hsActive > 0
                      ? formatDuration(hsActive)
                      : '-'}
                  </Text>
                  <Text
                    style={[
                      styles.tdText,
                      styles.colSubBay,
                      { color: hsBreak > 0 ? colors.warning : colors.textMuted },
                    ]}
                  >
                    {hsBreak > 0 ? formatDuration(hsBreak) : '-'}
                  </Text>
                  <Text
                    style={[
                      styles.tdText,
                      styles.colTasks,
                      { color: colors.textPrimary, fontWeight: '600' },
                    ]}
                  >
                    {taskSummaryDisplay}
                    {v.is_booking ? ' · 📅' : ''}
                    {v.has_additional_repairs ? ' · 🔧' : ''}
                  </Text>
                  {/* Remarks & Priority Column */}
                  <View style={[styles.tdCell, styles.colRemarks, { gap: 3 }]}>
                    {isUrgent && (
                      <View style={{ alignSelf: 'flex-start' }}>
                        <StatusPill
                          variant="URGENT"
                          label={urgentNote ? `URGENT: ${urgentNote}` : 'URGENT'}
                          size="sm"
                        />
                      </View>
                    )}
                    {remarksText ? (
                      <Text
                        style={[styles.tdText, { color: colors.textPrimary, fontSize: 11 }]}
                        numberOfLines={2}
                      >
                        {remarksText}
                      </Text>
                    ) : !isUrgent ? (
                      <Text style={[styles.tdText, { color: colors.textMuted, fontSize: 11 }]}>
                        -
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  tableContainer: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  tableHeaderRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  tableTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  tableScroll: {
    minWidth: '100%',
  },
  thRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
  },
  thRowSub: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
  },
  thGroupHeader: {
    width: 280,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingVertical: 3,
    borderRadius: 4,
  },
  thGroupHeaderText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  thCell: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  thSubCell: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  tdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
  },
  tdCell: {
    paddingHorizontal: 4,
  },
  tdText: {
    fontSize: 11.5,
  },
  colPlate: { width: 130 },
  colStatus: { width: 100 },
  colDate: { width: 72 },
  colTime: { width: 95 },
  colSubBay: { width: 70, textAlign: 'center' },
  colTasks: { width: 85 },
  colRemarks: { width: 240 },
});
