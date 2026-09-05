import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useVehicles } from '../../context/VehicleContext';
import { useTheme } from '../../context/ThemeContext';
import {
  FileText,
  Download,
  Printer,
  X,
  Calendar,
  CheckCircle2,
  Clock,
  Wrench,
  Navigation,
  ShieldAlert,
  Car,
  Filter,
  Layers,
  Info,
} from 'lucide-react-native';
import {
  DateFilterPreset,
  StatusFilterPreset,
  filterVehiclesForReport,
  calculateReportKPIs,
  exportServiceLogsToCSV,
  exportServiceLogsToPDF,
  formatDuration,
  getStageTimingForZone,
  getVehicleTotalPausedSeconds,
  getVehicleIdleAndActiveTotals,
  getVehicleEffectiveCompletion,
} from '../../utils/reportExportUtils';
import { getNetWorkingSeconds, getBreakOverlap } from '../../utils/workshopHoursUtils';
import { LicensePlate } from '../shared/LicensePlate';
import { StatusPill } from '../shared/StatusPill';
import { BaseModal } from '../shared/BaseModal';
import { Vehicle } from '../../types/vehicle';

export const ServiceReportsModal: React.FC = () => {
  const { isReportsModalOpen, setIsReportsModalOpen, vehicles, fetchHistoricalVehicles } = useVehicles();
  const { colors, isDark } = useTheme();

  const [datePreset, setDatePreset] = useState<DateFilterPreset>('today');
  const [statusPreset, setStatusPreset] = useState<StatusFilterPreset>('all');
  const [reportVehicles, setReportVehicles] = useState<Vehicle[]>(vehicles);
  const [isLoadingReport, setIsLoadingReport] = useState<boolean>(false);

  const DATE_PRESETS: { id: DateFilterPreset; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: '7days', label: 'Last 7 Days' },
    { id: 'month', label: 'This Month' },
    { id: 'all', label: 'All Time' },
  ];

  const STATUS_PRESETS: { id: StatusFilterPreset; label: string }[] = [
    { id: 'all', label: 'All Status' },
    { id: 'completed', label: 'Completed Only' },
    { id: 'in_progress', label: 'In Progress Only' },
  ];

  // Fetch historical data whenever preset or modal visibility changes
  useEffect(() => {
    if (!isReportsModalOpen) return;
    let isCancelled = false;

    if (datePreset === 'today') {
      setReportVehicles(vehicles);
    } else {
      setIsLoadingReport(true);
      fetchHistoricalVehicles(datePreset)
        .then(data => {
          if (!isCancelled) setReportVehicles(data);
        })
        .finally(() => {
          if (!isCancelled) setIsLoadingReport(false);
        });
    }

    return () => { isCancelled = true; };
  }, [isReportsModalOpen, datePreset, vehicles, fetchHistoricalVehicles]);

  const filteredVehicles = useMemo(() => {
    return filterVehiclesForReport(reportVehicles, datePreset, statusPreset);
  }, [reportVehicles, datePreset, statusPreset]);

  const kpis = useMemo(() => {
    return calculateReportKPIs(filteredVehicles);
  }, [filteredVehicles]);

  const activeDateLabel = DATE_PRESETS.find(p => p.id === datePreset)?.label || 'All Time';
  const activeStatusLabel = STATUS_PRESETS.find(s => s.id === statusPreset)?.label || 'All Status';
  const activeFilterLabel = `${activeDateLabel} · ${activeStatusLabel}`;

  return (
    <BaseModal
      visible={isReportsModalOpen}
      onClose={() => setIsReportsModalOpen(false)}
      maxWidth={1000}
      cardStyle={{ width: '95%' }}
      scrollable={true}
      icon={<FileText size={20} color={colors.primaryLight} />}
      title="Service Logs & Telemetry Reports"
      subtitle="Export turnaround times (TAT), bay stage durations, and technician audit trails"
      footer={
        <View style={styles.footerInner}>
          <View style={styles.footerLeft}>
            <Text style={[styles.footerInfo, { color: colors.textMuted }]}>
              {filteredVehicles.length} records ready for download
            </Text>
          </View>

          <View style={styles.footerActionGroup}>
            {/* Download Excel */}
            <TouchableOpacity
              style={[styles.exportBtn, { backgroundColor: colors.success }]}
              onPress={() => exportServiceLogsToCSV(filteredVehicles, activeFilterLabel, kpis)}
              activeOpacity={0.8}
            >
              <Download size={15} color="#ffffff" />
              <Text style={styles.exportBtnText}>Download Excel</Text>
            </TouchableOpacity>

            {/* Export PDF */}
            <TouchableOpacity
              style={[styles.exportBtn, { backgroundColor: colors.primary }]}
              onPress={() => exportServiceLogsToPDF(filteredVehicles, kpis, activeFilterLabel)}
              activeOpacity={0.8}
            >
              <Printer size={15} color="#ffffff" />
              <Text style={styles.exportBtnText}>Export PDF</Text>
            </TouchableOpacity>
          </View>
        </View>
      }
    >
      <View style={styles.modalBody}>
          {/* Filter Bar */}
          <View style={[styles.filterSection, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)', borderColor: colors.borderGlass }]}>
            <View style={styles.filterGroup}>
              <View style={styles.filterLabelRow}>
                <Calendar size={13} color={colors.primaryLight} />
                <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>DATE RANGE PRESET:</Text>
              </View>
              <View style={styles.pillRow}>
                {DATE_PRESETS.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.filterPill,
                      datePreset === p.id && { backgroundColor: colors.primaryDim, borderColor: colors.primary }
                    ]}
                    onPress={() => setDatePreset(p.id)}
                  >
                    <Text style={[
                      styles.filterPillText,
                      { color: datePreset === p.id ? colors.primaryLight : colors.textMuted },
                      datePreset === p.id && styles.activePillText
                    ]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.filterGroup}>
              <View style={styles.filterLabelRow}>
                <Filter size={13} color={colors.primaryLight} />
                <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>JOB STATUS:</Text>
              </View>
              <View style={styles.pillRow}>
                {STATUS_PRESETS.map(s => (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.filterPill,
                      statusPreset === s.id && { backgroundColor: colors.primaryDim, borderColor: colors.primary }
                    ]}
                    onPress={() => setStatusPreset(s.id)}
                  >
                    <Text style={[
                      styles.filterPillText,
                      { color: statusPreset === s.id ? colors.primaryLight : colors.textMuted },
                      statusPreset === s.id && styles.activePillText
                    ]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Executive KPI Metric Cards */}
          <View style={styles.kpiContainer}>
            {/* Top Summary Row: Total & Completed */}
            <View style={styles.kpiSummaryRow}>
              <View style={[styles.kpiCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)', borderColor: colors.borderGlass }]}>
                <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>TOTAL VEHICLES</Text>
                <View style={styles.kpiValRow}>
                  <Car size={18} color={colors.primaryLight} />
                  <Text style={[styles.kpiVal, { color: colors.textPrimary }]}>{kpis.totalVehicles}</Text>
                </View>
                <Text style={[styles.kpiSubText, { color: colors.textMuted }]}>{kpis.inProgressCount} active · {kpis.completedCount} finished</Text>
              </View>

              <View style={[styles.kpiCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)', borderColor: colors.borderGlass }]}>
                <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>COMPLETED JOBS</Text>
                <View style={styles.kpiValRow}>
                  <CheckCircle2 size={18} color={colors.success} />
                  <Text style={[styles.kpiVal, { color: colors.success }]}>{kpis.completedCount}</Text>
                </View>
                <Text style={[styles.kpiSubText, { color: colors.textMuted }]}>Delivered / Ready</Text>
              </View>
            </View>

            {/* Bay Velocity Row: 3 Bays in 1 Row */}
            <View style={styles.kpiBayRow}>
              {/* General Workshop Bay KPI */}
              <View style={[styles.kpiCard, styles.kpiBayCard, { backgroundColor: colors.bayWorkshopDim, borderColor: colors.bayWorkshop }]}>
                <View style={styles.kpiCardHeaderRow}>
                  <Text style={[styles.kpiLabel, { color: colors.bayWorkshopLight }]}>WORKSHOP</Text>
                </View>

                {/* Gross Avg Bay Time */}
                <View style={styles.kpiValRow}>
                  <Wrench size={15} color={colors.bayWorkshopLight} />
                  <View style={styles.kpiMetricCol}>
                    <Text style={[styles.kpiVal, { color: colors.bayWorkshopLight }]}>
                      {formatDuration(kpis.workshopBay.avgStageSec)}
                    </Text>
                    <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>GROSS AVG TIME</Text>
                  </View>
                </View>

                {/* Bay Avg Active Time */}
                <View style={[styles.kpiValRow, styles.kpiActiveRow]}>
                  <Clock size={13} color={colors.success} />
                  <View style={styles.kpiMetricCol}>
                    <Text style={[styles.kpiActiveVal, { color: colors.success }]}>
                      {formatDuration(kpis.workshopBay.avgActiveSec)}
                    </Text>
                    <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>BAY AVG ACTIVE TIME</Text>
                  </View>
                </View>

                {/* Bottom Vehicle Count */}
                <View style={styles.kpiBottomRow}>
                  <Text style={[styles.kpiBottomText, { color: colors.textMuted }]}>
                    {kpis.workshopBay.vehicleCount} vehicles
                  </Text>
                </View>
              </View>

              {/* Wheel Alignment Bay KPI */}
              <View style={[styles.kpiCard, styles.kpiBayCard, { backgroundColor: colors.bayAlignmentDim, borderColor: colors.bayAlignment }]}>
                <View style={styles.kpiCardHeaderRow}>
                  <Text style={[styles.kpiLabel, { color: colors.bayAlignmentLight }]}>ALIGNMENT</Text>
                </View>

                {/* Gross Avg Bay Time */}
                <View style={styles.kpiValRow}>
                  <Navigation size={15} color={colors.bayAlignmentLight} />
                  <View style={styles.kpiMetricCol}>
                    <Text style={[styles.kpiVal, { color: colors.bayAlignmentLight }]}>
                      {formatDuration(kpis.alignmentBay.avgStageSec)}
                    </Text>
                    <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>GROSS AVG TIME</Text>
                  </View>
                </View>

                {/* Bay Avg Active Time */}
                <View style={[styles.kpiValRow, styles.kpiActiveRow]}>
                  <Clock size={13} color={colors.success} />
                  <View style={styles.kpiMetricCol}>
                    <Text style={[styles.kpiActiveVal, { color: colors.success }]}>
                      {formatDuration(kpis.alignmentBay.avgActiveSec)}
                    </Text>
                    <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>BAY AVG ACTIVE TIME</Text>
                  </View>
                </View>

                {/* Bottom Vehicle Count */}
                <View style={styles.kpiBottomRow}>
                  <Text style={[styles.kpiBottomText, { color: colors.textMuted }]}>
                    {kpis.alignmentBay.vehicleCount} vehicles
                  </Text>
                </View>
              </View>

              {/* Hoist Service Bay KPI */}
              <View style={[styles.kpiCard, styles.kpiBayCard, { backgroundColor: colors.bayHoistDim, borderColor: colors.bayHoist }]}>
                <View style={styles.kpiCardHeaderRow}>
                  <Text style={[styles.kpiLabel, { color: colors.bayHoistLight }]}>HOIST</Text>
                </View>

                {/* Gross Avg Bay Time */}
                <View style={styles.kpiValRow}>
                  <ShieldAlert size={15} color={colors.bayHoistLight} />
                  <View style={styles.kpiMetricCol}>
                    <Text style={[styles.kpiVal, { color: colors.bayHoistLight }]}>
                      {formatDuration(kpis.hoistBay.avgStageSec)}
                    </Text>
                    <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>GROSS AVG TIME</Text>
                  </View>
                </View>

                {/* Bay Avg Active Time */}
                <View style={[styles.kpiValRow, styles.kpiActiveRow]}>
                  <Clock size={13} color={colors.success} />
                  <View style={styles.kpiMetricCol}>
                    <Text style={[styles.kpiActiveVal, { color: colors.success }]}>
                      {formatDuration(kpis.hoistBay.avgActiveSec)}
                    </Text>
                    <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>BAY AVG ACTIVE TIME</Text>
                  </View>
                </View>

                {/* Bottom Vehicle Count */}
                <View style={styles.kpiBottomRow}>
                  <Text style={[styles.kpiBottomText, { color: colors.textMuted }]}>
                    {kpis.hoistBay.vehicleCount} vehicles
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Table Preview */}
          <View style={[styles.tableContainer, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)', borderColor: colors.borderGlass }]}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableTitle, { color: colors.textPrimary }]}>
                Report Records Preview ({filteredVehicles.length} vehicles matching)
              </Text>
            </View>

            {isLoadingReport ? (
              <View style={styles.emptyTable}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.emptyTableText, { color: colors.textSecondary, marginTop: 8 }]}>
                  Loading historical service records from server...
                </Text>
              </View>
            ) : filteredVehicles.length === 0 ? (
              <View style={styles.emptyTable}>
                <Car size={32} color={colors.textMuted} />
                <Text style={[styles.emptyTableText, { color: colors.textMuted }]}>
                  No vehicles found matching the selected date and status filters.
                </Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={styles.tableScroll}>
                <View>
                  {/* Table Header Row 1: Top Grouped Categories */}
                  <View style={[styles.thRowTop, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)', borderBottomColor: colors.borderGlass }]}>
                    <Text style={[styles.thCell, styles.colPlate, { color: colors.textSecondary }]}>PLATE</Text>
                    <Text style={[styles.thCell, styles.colStatus, { color: colors.textSecondary }]}>STATUS</Text>
                    <Text style={[styles.thCell, styles.colTime, { color: colors.textSecondary }]}>INTAKE</Text>
                    <Text style={[styles.thCell, styles.colTime, { color: colors.textSecondary }]}>FINISHED</Text>
                    <Text style={[styles.thCell, styles.colTime, { color: colors.textSecondary }]}>GROSS TAT</Text>
                    <Text style={[styles.thCell, styles.colTime, { color: colors.textSecondary }]}>ACTIVE WORK</Text>
                    <Text style={[styles.thCell, styles.colTime, { color: colors.textSecondary }]}>TOTAL IDLE</Text>
                    <Text style={[styles.thCell, styles.colTime, { color: '#fbbf24' }]}>BREAKS</Text>
                    <View style={[styles.thGroupHeader, { borderColor: colors.borderGlass, backgroundColor: colors.bayWorkshopDim }]}>
                      <Text style={[styles.thGroupHeaderText, { color: colors.bayWorkshopLight }]}>GENERAL WORKSHOP</Text>
                    </View>
                    <View style={[styles.thGroupHeader, { borderColor: colors.borderGlass, backgroundColor: colors.bayAlignmentDim }]}>
                      <Text style={[styles.thGroupHeaderText, { color: colors.bayAlignmentLight }]}>WHEEL ALIGNMENT</Text>
                    </View>
                    <View style={[styles.thGroupHeader, { borderColor: colors.borderGlass, backgroundColor: colors.bayHoistDim }]}>
                      <Text style={[styles.thGroupHeaderText, { color: colors.bayHoistLight }]}>HOIST SERVICE</Text>
                    </View>
                    <Text style={[styles.thCell, styles.colTasks, { color: colors.textSecondary }]}>TASKS</Text>
                  </View>

                  {/* Table Header Row 2: Sub-Headers (Idle / Active / Breaks per bay) */}
                  <View style={[styles.thRowSub, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)', borderBottomColor: colors.borderGlass }]}>
                    <View style={styles.colPlate} />
                    <View style={styles.colStatus} />
                    <View style={styles.colTime} />
                    <View style={styles.colTime} />
                    <View style={styles.colTime} />
                    <View style={styles.colTime} />
                    <View style={styles.colTime} />
                    <View style={styles.colTime} />
                    {/* General Workshop sub-headers */}
                    <Text style={[styles.thSubCell, styles.colSubBay, { color: colors.warning }]}>IDLE</Text>
                    <Text style={[styles.thSubCell, styles.colSubBay, { color: colors.primaryLight }]}>ACTIVE</Text>
                    <Text style={[styles.thSubCell, styles.colSubBay, { color: '#fbbf24' }]}>BREAKS</Text>
                    {/* Wheel Alignment sub-headers */}
                    <Text style={[styles.thSubCell, styles.colSubBay, { color: colors.warning }]}>IDLE</Text>
                    <Text style={[styles.thSubCell, styles.colSubBay, { color: colors.primaryLight }]}>ACTIVE</Text>
                    <Text style={[styles.thSubCell, styles.colSubBay, { color: '#fbbf24' }]}>BREAKS</Text>
                    {/* Hoist Service sub-headers */}
                    <Text style={[styles.thSubCell, styles.colSubBay, { color: colors.warning }]}>IDLE</Text>
                    <Text style={[styles.thSubCell, styles.colSubBay, { color: colors.primaryLight }]}>ACTIVE</Text>
                    <Text style={[styles.thSubCell, styles.colSubBay, { color: '#fbbf24' }]}>BREAKS</Text>
                    <View style={styles.colTasks} />
                  </View>

                  {/* Rows */}
                  {filteredVehicles.map(v => {
                    const { isEffectiveDone, effectiveCompletionDate } = getVehicleEffectiveCompletion(v);
                    const start = new Date(v.intake_at || v.created_at);
                    const end = effectiveCompletionDate ? effectiveCompletionDate : new Date();
                    const grossSec = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
                    const totalPausedSec = getVehicleTotalPausedSeconds(v);
                    const rawNetSec = getNetWorkingSeconds(start, end);
                    const netSec = Math.max(0, rawNetSec - totalPausedSec);
                    const { totalIdleSec, totalActiveSec } = getVehicleIdleAndActiveTotals(v);
                    const activeWorkSec = totalActiveSec > 0 ? totalActiveSec : netSec;
                    const { breakSeconds } = getBreakOverlap(start, end);

                    const intakeStr = !isNaN(start.getTime())
                      ? start.toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: true })
                      : '--:--';
                    const finishedStr = isEffectiveDone && effectiveCompletionDate && !isNaN(effectiveCompletionDate.getTime())
                      ? effectiveCompletionDate.toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: true })
                      : 'In Progress';

                    const workshopTiming = getStageTimingForZone(v, 'workshop');
                    const alignmentTiming = getStageTimingForZone(v, 'alignment');
                    const hoistTiming = getStageTimingForZone(v, 'hoist');

                    const completedTasks = v.tasks.filter(t => t.is_completed).length;
                    const totalTasks = v.tasks.filter(t => t.is_required).length;

                    return (
                      <View key={v.id} style={[styles.tdRow, { borderBottomColor: colors.borderGlass }]}>
                        <View style={[styles.tdCell, styles.colPlate]}>
                          <LicensePlate number={v.vehicle_no} size="sm" />
                        </View>
                        <View style={[styles.tdCell, styles.colStatus]}>
                          <StatusPill
                            variant={isEffectiveDone ? 'DONE' : 'ACTIVE'}
                            label={isEffectiveDone ? 'DONE' : v.current_zone.toUpperCase()}
                            size="sm"
                          />
                        </View>
                        <Text style={[styles.tdText, styles.colTime, { color: colors.textSecondary }]}>
                          {intakeStr}
                        </Text>
                        <Text style={[styles.tdText, styles.colTime, { color: isEffectiveDone ? colors.success : colors.warningLight, fontWeight: isEffectiveDone ? '700' : '400' }]}>
                          {finishedStr}
                        </Text>
                        <Text style={[styles.tdText, styles.colTime, { color: colors.primaryLight, fontWeight: '700' }]}>
                          {formatDuration(grossSec)}
                        </Text>
                        <Text style={[styles.tdText, styles.colTime, { color: colors.success, fontWeight: '700' }]}>
                          {formatDuration(activeWorkSec)}
                        </Text>
                        <Text style={[styles.tdText, styles.colTime, { color: colors.warning, fontWeight: '700' }]}>
                          {formatDuration(totalIdleSec)}
                        </Text>
                        <Text style={[styles.tdText, styles.colTime, { color: breakSeconds > 0 ? '#fbbf24' : colors.textMuted, fontWeight: '700' }]}>
                          {breakSeconds > 0 ? formatDuration(breakSeconds) : '-'}
                        </Text>
                        {/* General Workshop (Idle / Active / Breaks) */}
                        <Text style={[styles.tdText, styles.colSubBay, { color: colors.warning }]}>
                          {workshopTiming.idleSec > 0 ? formatDuration(workshopTiming.idleSec) : '-'}
                        </Text>
                        <Text style={[styles.tdText, styles.colSubBay, { color: colors.primaryLight, fontWeight: '700' }]}>
                          {workshopTiming.activeSec > 0 ? formatDuration(workshopTiming.activeSec) : '-'}
                        </Text>
                        <Text style={[styles.tdText, styles.colSubBay, { color: workshopTiming.breakSec > 0 ? '#fbbf24' : colors.textMuted }]}>
                          {workshopTiming.breakSec > 0 ? formatDuration(workshopTiming.breakSec) : '-'}
                        </Text>
                        {/* Wheel Alignment (Idle / Active / Breaks) */}
                        <Text style={[styles.tdText, styles.colSubBay, { color: colors.warning }]}>
                          {alignmentTiming.idleSec > 0 ? formatDuration(alignmentTiming.idleSec) : '-'}
                        </Text>
                        <Text style={[styles.tdText, styles.colSubBay, { color: colors.primaryLight, fontWeight: '700' }]}>
                          {alignmentTiming.activeSec > 0 ? formatDuration(alignmentTiming.activeSec) : '-'}
                        </Text>
                        <Text style={[styles.tdText, styles.colSubBay, { color: alignmentTiming.breakSec > 0 ? '#fbbf24' : colors.textMuted }]}>
                          {alignmentTiming.breakSec > 0 ? formatDuration(alignmentTiming.breakSec) : '-'}
                        </Text>
                        {/* Hoist Service (Idle / Active / Breaks) */}
                        <Text style={[styles.tdText, styles.colSubBay, { color: colors.warning }]}>
                          {hoistTiming.idleSec > 0 ? formatDuration(hoistTiming.idleSec) : '-'}
                        </Text>
                        <Text style={[styles.tdText, styles.colSubBay, { color: colors.primaryLight, fontWeight: '700' }]}>
                          {hoistTiming.activeSec > 0 ? formatDuration(hoistTiming.activeSec) : '-'}
                        </Text>
                        <Text style={[styles.tdText, styles.colSubBay, { color: hoistTiming.breakSec > 0 ? '#fbbf24' : colors.textMuted }]}>
                          {hoistTiming.breakSec > 0 ? formatDuration(hoistTiming.breakSec) : '-'}
                        </Text>
                        <Text style={[styles.tdText, styles.colTasks, { color: colors.textPrimary, fontWeight: '600' }]}>
                          {completedTasks}/{totalTasks}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>

          {/* Operational Calculation & Audit Note */}
          <View style={[styles.auditNoteCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)', borderColor: colors.borderGlass }]}>
            <View style={styles.auditNoteTitleRow}>
              <Info size={14} color={colors.primaryLight} />
              <Text style={[styles.auditNoteTitle, { color: colors.textPrimary }]}>
                Report Audit & Calculation Standard
              </Text>
            </View>
            <Text style={[styles.auditNoteText, { color: colors.textSecondary }]}>
              • <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Gross Avg Time:</Text> Working bay occupancy (Active Labor + Idle Time) for completed and dispatched stages to the next station. In-progress/undispatched stages are excluded to prevent diluting averages. Scheduled workshop downtime (lunch & tea breaks) is deducted.
            </Text>
            <Text style={[styles.auditNoteText, { color: colors.textSecondary }]}>
              • <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Bay Avg Active Time:</Text> Pure technician hands-on labor duration for completed & dispatched stages.
            </Text>
          </View>
      </View>
    </BaseModal>
  );
};

const styles = StyleSheet.create({
  footerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalBody: {
    width: '100%',
  },
  filterSection: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
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
  },
  filterLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  activePillText: {
    fontWeight: '800',
  },
  kpiContainer: {
    gap: 12,
    marginBottom: 16,
  },
  kpiSummaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  kpiBayRow: {
    flexDirection: 'row',
    gap: 12,
  },
  kpiCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  kpiBayCard: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  kpiMetricCol: {
    flex: 1,
    minWidth: 0,
  },
  kpiLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  kpiCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 2,
  },
  kpiVehicleBadge: {
    fontSize: 8.5,
    fontWeight: '700',
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  kpiValRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kpiVal: {
    fontSize: 14,
    fontWeight: '900',
  },
  kpiSubLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: 1,
  },
  kpiActiveRow: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  kpiActiveVal: {
    fontSize: 12,
    fontWeight: '800',
  },
  kpiBottomRow: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
  },
  kpiBottomText: {
    fontSize: 8.5,
    fontWeight: '700',
  },
  kpiSubText: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
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
  emptyTable: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyTableText: {
    fontSize: 13,
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
    width: 210,
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
  colTime: { width: 95 },
  colSubBay: { width: 70, textAlign: 'center' },
  colTasks: { width: 75 },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerInfo: {
    fontSize: 12,
    fontWeight: '600',
  },
  footerActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  exportBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  auditNoteCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
    marginBottom: 8,
  },
  auditNoteTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  auditNoteTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  auditNoteText: {
    fontSize: 10.5,
    lineHeight: 15,
  },
});
