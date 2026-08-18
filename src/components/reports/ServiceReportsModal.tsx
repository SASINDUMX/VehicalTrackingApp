import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Dimensions,
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
  Car,
  Filter,
  Layers,
} from 'lucide-react-native';
import {
  DateFilterPreset,
  StatusFilterPreset,
  filterVehiclesForReport,
  calculateReportKPIs,
  exportServiceLogsToCSV,
  exportServiceLogsToPDF,
  formatDuration,
  getStageSecondsForZone,
} from '../../utils/reportExportUtils';
import { getNetWorkingSeconds } from '../../utils/workshopHoursUtils';
import { LicensePlate } from '../shared/LicensePlate';

export const ServiceReportsModal: React.FC = () => {
  const { isReportsModalOpen, setIsReportsModalOpen, vehicles } = useVehicles();
  const { colors, isDark } = useTheme();

  const [datePreset, setDatePreset] = useState<DateFilterPreset>('today');
  const [statusPreset, setStatusPreset] = useState<StatusFilterPreset>('all');

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

  const filteredVehicles = useMemo(() => {
    return filterVehiclesForReport(vehicles, datePreset, statusPreset);
  }, [vehicles, datePreset, statusPreset]);

  const kpis = useMemo(() => {
    return calculateReportKPIs(filteredVehicles);
  }, [filteredVehicles]);

  const activeDateLabel = DATE_PRESETS.find(p => p.id === datePreset)?.label || 'All Time';

  if (!isReportsModalOpen) return null;

  return (
    <View style={styles.modalOverlay}>
      <TouchableOpacity
        style={[styles.backdrop, { backgroundColor: colors.backdrop }]}
        activeOpacity={1}
        onPress={() => setIsReportsModalOpen(false)}
      />

      <View style={[
        styles.modalContainer,
        {
          backgroundColor: colors.surface,
          borderColor: colors.borderGlassBright,
        }
      ]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.borderGlass }]}>
          <View style={styles.headerTitleGroup}>
            <View style={[styles.headerIconWrapper, { backgroundColor: colors.primaryDim, borderColor: colors.primaryBorder }]}>
              <FileText size={20} color={colors.primaryLight} />
            </View>
            <View style={styles.headerTextContainer}>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Service Logs & Telemetry Reports</Text>
              <Text style={[styles.headerSub, { color: colors.textMuted }]} numberOfLines={2}>
                Export turnaround times (TAT), bay stage durations, and technician audit trails
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)', borderColor: colors.borderGlass }]}
            onPress={() => setIsReportsModalOpen(false)}
          >
            <X size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Scrollable Content */}
        <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
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
          <View style={styles.kpiGrid}>
            <View style={[styles.kpiCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)', borderColor: colors.borderGlass }]}>
              <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>TOTAL VEHICLES</Text>
              <View style={styles.kpiValRow}>
                <Car size={18} color={colors.primaryLight} />
                <Text style={[styles.kpiVal, { color: colors.textPrimary }]}>{kpis.totalVehicles}</Text>
              </View>
            </View>

            <View style={[styles.kpiCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)', borderColor: colors.borderGlass }]}>
              <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>COMPLETED JOBS</Text>
              <View style={styles.kpiValRow}>
                <CheckCircle2 size={18} color={colors.success} />
                <Text style={[styles.kpiVal, { color: colors.success }]}>{kpis.completedCount}</Text>
              </View>
            </View>

            <View style={[styles.kpiCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)', borderColor: colors.borderGlass }]}>
              <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>AVG GROSS TAT</Text>
              <View style={styles.kpiValRow}>
                <Clock size={18} color={colors.primaryLight} />
                <Text style={[styles.kpiVal, { color: colors.primaryLight }]}>{formatDuration(kpis.avgGrossSeconds)}</Text>
              </View>
            </View>

            <View style={[styles.kpiCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)', borderColor: colors.borderGlass }]}>
              <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>AVG NET WORK TIME</Text>
              <View style={styles.kpiValRow}>
                <Wrench size={18} color={colors.success} />
                <Text style={[styles.kpiVal, { color: colors.success }]}>{formatDuration(kpis.avgNetSeconds)}</Text>
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

            {filteredVehicles.length === 0 ? (
              <View style={styles.emptyTable}>
                <Car size={32} color={colors.textMuted} />
                <Text style={[styles.emptyTableText, { color: colors.textMuted }]}>
                  No vehicles found matching the selected date and status filters.
                </Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={styles.tableScroll}>
                <View>
                  {/* Table Header */}
                  <View style={[styles.thRow, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)', borderBottomColor: colors.borderGlass }]}>
                    <Text style={[styles.thCell, styles.colPlate, { color: colors.textSecondary }]}>PLATE</Text>
                    <Text style={[styles.thCell, styles.colStatus, { color: colors.textSecondary }]}>STATUS</Text>
                    <Text style={[styles.thCell, styles.colTime, { color: colors.textSecondary }]}>GROSS TAT</Text>
                    <Text style={[styles.thCell, styles.colTime, { color: colors.textSecondary }]}>NET WORK</Text>
                    <Text style={[styles.thCell, styles.colBay, { color: colors.textSecondary }]}>BAY 01</Text>
                    <Text style={[styles.thCell, styles.colBay, { color: colors.textSecondary }]}>BAY 03</Text>
                    <Text style={[styles.thCell, styles.colBay, { color: colors.textSecondary }]}>BAY 02</Text>
                    <Text style={[styles.thCell, styles.colBay, { color: colors.textSecondary }]}>INSPECT</Text>
                    <Text style={[styles.thCell, styles.colTasks, { color: colors.textSecondary }]}>TASKS</Text>
                  </View>

                  {/* Rows */}
                  {filteredVehicles.map(v => {
                    const start = new Date(v.intake_at || v.created_at);
                    const end = v.completed_at ? new Date(v.completed_at) : new Date();
                    const grossSec = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
                    const netSec = getNetWorkingSeconds(start, end);

                    const workshopSec = getStageSecondsForZone(v, 'workshop');
                    const alignmentSec = getStageSecondsForZone(v, 'alignment');
                    const hoistSec = getStageSecondsForZone(v, 'hoist');
                    const inspectionSec = getStageSecondsForZone(v, 'inspection');

                    const completedTasks = v.tasks.filter(t => t.is_completed).length;
                    const totalTasks = v.tasks.filter(t => t.is_required).length;

                    return (
                      <View key={v.id} style={[styles.tdRow, { borderBottomColor: colors.borderGlass }]}>
                        <View style={[styles.tdCell, styles.colPlate]}>
                          <LicensePlate number={v.vehicle_no} size="sm" />
                        </View>
                        <View style={[styles.tdCell, styles.colStatus]}>
                          <View style={[
                            styles.statusBadge,
                            { backgroundColor: v.is_finished ? colors.successDim : colors.primaryDim, borderColor: v.is_finished ? colors.successBorder : colors.primaryBorder }
                          ]}>
                            <Text style={[styles.statusBadgeText, { color: v.is_finished ? colors.success : colors.primaryLight }]}>
                              {v.is_finished ? 'DONE' : v.current_zone.toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.tdText, styles.colTime, { color: colors.primaryLight, fontWeight: '700' }]}>
                          {formatDuration(grossSec)}
                        </Text>
                        <Text style={[styles.tdText, styles.colTime, { color: colors.success, fontWeight: '700' }]}>
                          {formatDuration(netSec)}
                        </Text>
                        <Text style={[styles.tdText, styles.colBay, { color: colors.textSecondary }]}>
                          {formatDuration(workshopSec)}
                        </Text>
                        <Text style={[styles.tdText, styles.colBay, { color: colors.textSecondary }]}>
                          {formatDuration(alignmentSec)}
                        </Text>
                        <Text style={[styles.tdText, styles.colBay, { color: colors.textSecondary }]}>
                          {formatDuration(hoistSec)}
                        </Text>
                        <Text style={[styles.tdText, styles.colBay, { color: colors.textSecondary }]}>
                          {formatDuration(inspectionSec)}
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
        </ScrollView>

        {/* Footer with Export Actions */}
        <View style={[styles.footer, { borderTopColor: colors.borderGlass, backgroundColor: colors.surfaceElevated }]}>
          <View style={styles.footerLeft}>
            <Text style={[styles.footerInfo, { color: colors.textMuted }]}>
              {filteredVehicles.length} records ready for download
            </Text>
          </View>

          <View style={styles.footerActionGroup}>
            {/* Download Excel */}
            <TouchableOpacity
              style={[styles.exportBtn, { backgroundColor: colors.success }]}
              onPress={() => exportServiceLogsToCSV(filteredVehicles, activeDateLabel)}
              activeOpacity={0.8}
            >
              <Download size={15} color="#ffffff" />
              <Text style={styles.exportBtnText}>Download Excel</Text>
            </TouchableOpacity>

            {/* Export PDF */}
            <TouchableOpacity
              style={[styles.exportBtn, { backgroundColor: colors.primary }]}
              onPress={() => exportServiceLogsToPDF(filteredVehicles, kpis, activeDateLabel)}
              activeOpacity={0.8}
            >
              <Printer size={15} color="#ffffff" />
              <Text style={styles.exportBtnText}>Export PDF</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    padding: 16,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    ...(Platform.OS === 'web' ? { position: 'fixed' as any } : {}),
  },
  modalContainer: {
    width: '100%',
    maxWidth: 950,
    maxHeight: '90%',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 10000,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0px 16px 40px rgba(0, 0, 0, 0.4)' } as any)
      : { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12 }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  headerIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: 20,
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
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    minWidth: 160,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  kpiValRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kpiVal: {
    fontSize: 18,
    fontWeight: '900',
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
  thRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
  },
  thCell: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
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
  colBay: { width: 85 },
  colTasks: { width: 75 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    flexWrap: 'wrap',
    gap: 8,
  },
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
});
