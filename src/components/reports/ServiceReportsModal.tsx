import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
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
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Wrench,
  Navigation,
  Droplets,
  Car,
  Filter,
  Layers,
  Info,
  AlertCircle,
  Coffee,
  Database,
  Zap,
  Shield,
  ClipboardList,
} from 'lucide-react-native';
import {
  DateFilterPreset,
  StatusFilterPreset,
  ReportKPIs,
  ServerReportRecord,
  filterVehiclesForReport,
  getDatePresetRangeDescription,
  calculateReportKPIs,
  exportServiceLogsToCSV,
  exportServiceLogsToPDF,
  formatDuration,
  getStageTimingForZone,
  getVehicleIdleAndActiveTotals,
  getVehicleEffectiveCompletion,
} from '../../utils/reportExportUtils';
import { vehicleService } from '../../services/vehicleService';
import { getNetWorkingSeconds, getBreakOverlap } from '../../utils/workshopHoursUtils';
import { LicensePlate } from '../shared/LicensePlate';
import { StatusPill } from '../shared/StatusPill';
import { BaseModal } from '../shared/BaseModal';
import { LoadingSpot } from '../shared/LoadingSpot';
import { EmptyStateCard } from '../shared/EmptyStateCard';
import { Vehicle } from '../../types/vehicle';
import { APP_TERMINOLOGY } from '../../constants/terminology';
import { usePermissions } from '../../hooks/usePermissions';
import { AuditTrailView } from './AuditTrailView';

export const ServiceReportsModal: React.FC = () => {
  const { vehicles, fetchHistoricalVehicles, setIsReportsModalOpen } = useVehicles();
  const { colors, isDark } = useTheme();
  const { isSuperAdmin } = usePermissions();

  const [activeReportTab, setActiveReportTab] = useState<'kpi' | 'audit'>('kpi');
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('today');
  const [statusPreset, setStatusPreset] = useState<StatusFilterPreset>('all');
  const [reportVehicles, setReportVehicles] = useState<Vehicle[]>(vehicles);
  const [isLoadingReport, setIsLoadingReport] = useState<boolean>(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);

  const [customDate, setCustomDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  const DATE_PRESETS: { id: DateFilterPreset; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: '7days', label: 'Last 7 Days' },
    { id: 'month', label: 'This Month' },
    { id: '3months', label: 'Last 3 Months' },
    { id: 'custom', label: 'Custom Date / Range' },
  ];

  const STATUS_PRESETS: { id: StatusFilterPreset; label: string }[] = [
    { id: 'all', label: 'All Status' },
    { id: 'completed', label: 'Completed Only' },
    { id: 'in_progress', label: 'In Progress Only' },
  ];

  const [serverKPIs, setServerKPIs] = useState<ReportKPIs | null>(null);
  const [serverRecords, setServerRecords] = useState<ServerReportRecord[] | null>(null);

  // Fetch historical data whenever preset changes
  useEffect(() => {
    let isCancelled = false;
    setServerKPIs(null);
    setServerRecords(null);

    const now = new Date();
    let startDate: string | null = null;
    let endDate: string | null = null;

    if (datePreset === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    } else if (datePreset === 'yesterday') {
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      startDate = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000).toISOString();
      endDate = startOfToday.toISOString();
    } else if (datePreset === '7days') {
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (datePreset === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    } else if (datePreset === '3months') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).toISOString();
    } else if (datePreset === 'custom') {
      const startStr = customDate.trim();
      const endStr = customEndDate.trim();

      if (startStr) {
        const parsedStart = new Date(startStr);
        if (!Number.isNaN(parsedStart.getTime())) {
          startDate = new Date(parsedStart.getFullYear(), parsedStart.getMonth(), parsedStart.getDate()).toISOString();
        }
      }

      if (endStr) {
        const parsedEnd = new Date(endStr);
        if (!Number.isNaN(parsedEnd.getTime())) {
          endDate = new Date(parsedEnd.getFullYear(), parsedEnd.getMonth(), parsedEnd.getDate(), 23, 59, 59, 999).toISOString();
        }
      } else if (startDate) {
        // Single-day custom filter: End date defaults to 23:59:59 of the start day
        const parsedStart = new Date(startStr);
        endDate = new Date(parsedStart.getFullYear(), parsedStart.getMonth(), parsedStart.getDate(), 23, 59, 59, 999).toISOString();
      }
    }

    setIsLoadingReport(true);

    // Primary: Call the hardened PostgreSQL get_service_report_data RPC
    vehicleService.fetchReportData({
      startDate,
      endDate,
      status: statusPreset,
    }).then(res => {
      if (!isCancelled && res) {
        if (res.kpis) setServerKPIs(res.kpis as ReportKPIs);
        if (res.records && res.records.length > 0) {
          setServerRecords(res.records as ServerReportRecord[]);
          setIsLoadingReport(false);
          return;
        }
      }
      
      // Fallback: If RPC not yet applied, fallback to raw vehicles fetch
      if (datePreset === 'today') {
        setReportVehicles(vehicles);
        setIsLoadingReport(false);
      } else {
        fetchHistoricalVehicles(datePreset, startDate || undefined, endDate || undefined)
          .then(data => {
            if (!isCancelled) setReportVehicles(data);
          })
          .finally(() => {
            if (!isCancelled) setIsLoadingReport(false);
          });
      }
    }).catch(() => {
      if (datePreset === 'today') {
        setReportVehicles(vehicles);
        setIsLoadingReport(false);
      } else {
        fetchHistoricalVehicles(datePreset, startDate || undefined, endDate || undefined)
          .then(data => {
            if (!isCancelled) setReportVehicles(data);
          })
          .finally(() => {
            if (!isCancelled) setIsLoadingReport(false);
          });
      }
    });

    return () => { isCancelled = true; };
  }, [datePreset, statusPreset, customDate, customEndDate, vehicles, fetchHistoricalVehicles]);

  const filteredVehicles = useMemo(() => {
    // If server returned pre-computed records, use them directly with zero client loops
    if (serverRecords) {
      return serverRecords;
    }

    let customRange: { start: string; end?: string } | undefined = undefined;
    if (datePreset === 'custom') {
      const startStr = customDate.trim();
      const endStr = customEndDate.trim();
      if (startStr) {
        const parsedStart = new Date(startStr);
        if (!Number.isNaN(parsedStart.getTime())) {
          const startIso = new Date(parsedStart.getFullYear(), parsedStart.getMonth(), parsedStart.getDate()).toISOString();
          let endIso: string;
          if (endStr) {
            const parsedEnd = new Date(endStr);
            endIso = !Number.isNaN(parsedEnd.getTime())
              ? new Date(parsedEnd.getFullYear(), parsedEnd.getMonth(), parsedEnd.getDate(), 23, 59, 59, 999).toISOString()
              : new Date(parsedStart.getFullYear(), parsedStart.getMonth(), parsedStart.getDate(), 23, 59, 59, 999).toISOString();
          } else {
            endIso = new Date(parsedStart.getFullYear(), parsedStart.getMonth(), parsedStart.getDate(), 23, 59, 59, 999).toISOString();
          }
          customRange = { start: startIso, end: endIso };
        }
      }
    }
    return filterVehiclesForReport(reportVehicles, datePreset, statusPreset, customRange);
  }, [serverRecords, reportVehicles, datePreset, statusPreset, customDate, customEndDate]);

  // Server KPIs are authoritative: computed directly in PostgreSQL.
  // Falls back to client calculation only if offline or RPC is unavailable.
  const kpis = useMemo(() => {
    if (
      serverKPIs &&
      serverKPIs.workshopBay &&
      serverKPIs.alignmentBay &&
      serverKPIs.hoistBay
    ) {
      return serverKPIs;
    }
    return calculateReportKPIs(filteredVehicles as any);
  }, [serverKPIs, filteredVehicles]);

  const dateRangeInfo = useMemo(() => {
    return getDatePresetRangeDescription(datePreset, customDate, customEndDate);
  }, [datePreset, customDate, customEndDate]);

  const isMultiDate = dateRangeInfo.isMultiDate;
  const activeStatusLabel = STATUS_PRESETS.find(s => s.id === statusPreset)?.label || 'All Status';
  const activeFilterLabel = `${dateRangeInfo.label} (${dateRangeInfo.rangeStr}) · ${activeStatusLabel}`;

  return (
    <View style={[styles.outerContainer, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={true}
      >
        {/* Top Header Bar */}
        <View style={[styles.topHeaderBar, { backgroundColor: colors.surface, borderColor: colors.borderGlass }]}>
          <View style={styles.headerLeftGroup}>
            <View style={[styles.headerIconBox, { backgroundColor: colors.primaryDim, borderColor: colors.primaryBorder }]}>
              <FileText size={18} color={colors.primaryLight} />
            </View>
            <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>
              Service Logs & Reports
            </Text>
            {/* Calculation Standard & Rules Info Button */}
            <TouchableOpacity
              style={[styles.infoIconButtonOnly, { backgroundColor: colors.primaryDim, borderColor: colors.primaryBorder, borderRadius: 14, borderWidth: 1, padding: 4 }]}
              onPress={() => setIsAuditModalOpen(true)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Info size={16} color={colors.primaryLight} />
            </TouchableOpacity>
          </View>
        </View>
        {/* Super Admin Executive View Switcher */}
        {isSuperAdmin && (
          <View style={[styles.tabSwitcherBar, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)', borderColor: colors.borderGlass }]}>
            <TouchableOpacity
              style={[
                styles.tabSwitcherBtn,
                activeReportTab === 'kpi' && { backgroundColor: colors.primary },
              ]}
              onPress={() => setActiveReportTab('kpi')}
              activeOpacity={0.8}
            >
              <FileText size={14} color={activeReportTab === 'kpi' ? '#ffffff' : colors.textMuted} />
              <Text style={[styles.tabSwitcherBtnText, { color: activeReportTab === 'kpi' ? '#ffffff' : colors.textMuted }]}>
                OPERATIONAL REPORTS & KPIS
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabSwitcherBtn,
                activeReportTab === 'audit' && { backgroundColor: colors.primary },
              ]}
              onPress={() => setActiveReportTab('audit')}
              activeOpacity={0.8}
            >
              <ClipboardList size={14} color={activeReportTab === 'audit' ? '#ffffff' : colors.textMuted} />
              <Text style={[styles.tabSwitcherBtnText, { color: activeReportTab === 'audit' ? '#ffffff' : colors.textMuted }]}>
                ACTIVITY & AUDIT LOG 📋
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {isSuperAdmin && activeReportTab === 'audit' ? (
          <AuditTrailView />
        ) : (
          <>
            {/* Filter Bar */}
            <View style={[styles.filterSection, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)', borderColor: colors.borderGlass }]}>
              <View style={styles.filterGroup}>
                <View style={styles.filterLabelRow}>
                  <Calendar size={13} color={colors.primaryLight} />
                  <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>DATE RANGE PRESET:</Text>
                  <View style={[styles.activeRangeBadge, { backgroundColor: colors.primaryDim, borderColor: colors.primaryBorder }]}>
                    <Text style={[styles.activeRangeBadgeText, { color: colors.primaryLight }]}>
                      {dateRangeInfo.rangeStr}
                    </Text>
                  </View>
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

              {/* Custom Date / Range Input Fields */}
              {datePreset === 'custom' && (
                <View style={{ gap: 8, marginTop: 10, paddingVertical: 4 }}>
                  {/* Quick Preset Chips inside Custom */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textMuted, marginRight: 2 }}>
                      QUICK FILL:
                    </Text>
                    {[
                      {
                        label: 'Today',
                        action: () => {
                          const now = new Date();
                          const dStr = now.toISOString().split('T')[0];
                          setCustomDate(dStr);
                          setCustomEndDate('');
                        },
                      },
                      {
                        label: 'Yesterday',
                        action: () => {
                          const y = new Date(Date.now() - 24 * 60 * 60 * 1000);
                          const dStr = y.toISOString().split('T')[0];
                          setCustomDate(dStr);
                          setCustomEndDate('');
                        },
                      },
                      {
                        label: 'This Week',
                        action: () => {
                          const now = new Date();
                          const past7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                          setCustomDate(past7.toISOString().split('T')[0]);
                          setCustomEndDate(now.toISOString().split('T')[0]);
                        },
                      },
                      {
                        label: 'This Month',
                        action: () => {
                          const now = new Date();
                          const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                          setCustomDate(firstOfMonth.toISOString().split('T')[0]);
                          setCustomEndDate(now.toISOString().split('T')[0]);
                        },
                      },
                    ].map((chip) => (
                      <TouchableOpacity
                        key={chip.label}
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 6,
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                          borderWidth: 1,
                          borderColor: colors.borderGlass,
                        }}
                        onPress={chip.action}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 10.5, fontWeight: '600', color: colors.primaryLight }}>
                          {chip.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Input Fields Row */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                    {/* From Date */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>
                        FROM:
                      </Text>
                      <TextInput
                        style={{
                          borderWidth: 1,
                          borderColor: colors.borderGlass,
                          backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#ffffff',
                          color: colors.textPrimary,
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: '600',
                          width: 125,
                        }}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={colors.textMuted}
                        value={customDate}
                        onChangeText={setCustomDate}
                      />
                    </View>

                    {/* To Date */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>
                        TO:
                      </Text>
                      <TextInput
                        style={{
                          borderWidth: 1,
                          borderColor: colors.borderGlass,
                          backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#ffffff',
                          color: colors.textPrimary,
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: '600',
                          width: 125,
                        }}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={colors.textMuted}
                        value={customEndDate}
                        onChangeText={setCustomEndDate}
                      />
                    </View>

                    <Text style={{ fontSize: 11, color: colors.textMuted }}>
                      (Leave "TO" empty for single-day report)
                    </Text>
                  </View>
                </View>
              )}
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
            {/* Top Summary: 3-Pillar Fleet & Job Status Card */}
            <View style={[styles.kpiUnifiedCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)', borderColor: colors.borderGlass }]}>
              <View style={styles.kpiCardHeaderRow}>
                <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>SERVICE OVERVIEW</Text>
                <Text style={[styles.kpiBottomText, { color: colors.textMuted }]}>
                  {(kpis?.totalVehicles ?? 0) > 0 ? Math.round(((kpis?.completedCount ?? 0) / (kpis?.totalVehicles ?? 1)) * 100) : 0}% COMPLETION RATE
                </Text>
              </View>
              <View style={styles.kpiThreeColRow}>
                {/* Pillar 1: Total Fleet */}
                <View style={styles.kpiCol}>
                  <View style={styles.kpiValRow}>
                    <Car size={16} color={colors.primaryLight} />
                    <Text style={[styles.kpiBigVal, { color: colors.textPrimary }]}>{kpis?.totalVehicles ?? 0}</Text>
                  </View>
                  <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>TOTAL FLEET</Text>
                </View>

                {/* Pillar 2: Active */}
                <View style={styles.kpiCol}>
                  <View style={styles.kpiValRow}>
                    <Clock size={16} color={colors.primaryLight} />
                    <Text style={[styles.kpiBigVal, { color: colors.primaryLight }]}>{kpis?.inProgressCount ?? 0}</Text>
                  </View>
                  <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>ACTIVE</Text>
                </View>

                {/* Pillar 3: Completed */}
                <View style={styles.kpiCol}>
                  <View style={styles.kpiValRow}>
                    <CheckCircle2 size={16} color={colors.success} />
                    <Text style={[styles.kpiBigVal, { color: colors.success }]}>{kpis?.completedCount ?? 0}</Text>
                  </View>
                  <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>COMPLETED</Text>
                </View>

                {/* Pillar 4: Prior Bookings */}
                <View style={styles.kpiCol}>
                  <View style={styles.kpiValRow}>
                    <Calendar size={16} color="#38bdf8" />
                    <Text style={[styles.kpiBigVal, { color: '#38bdf8' }]}>{kpis?.bookingCount ?? 0}</Text>
                  </View>
                  <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>BOOKINGS</Text>
                </View>

                {/* Pillar 5: Additional Repairs */}
                <View style={styles.kpiCol}>
                  <View style={styles.kpiValRow}>
                    <Wrench size={16} color="#f59e0b" />
                    <Text style={[styles.kpiBigVal, { color: '#f59e0b' }]}>{kpis?.additionalRepairsCount ?? 0}</Text>
                  </View>
                  <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>EXTRA REPAIRS</Text>
                </View>
              </View>
            </View>

            {/* Bay Velocity Row: 3 Bays in 1 Row */}
            <View style={styles.kpiBayRow}>
              {/* Workshop Bay KPI */}
              <View style={[styles.kpiCard, styles.kpiBayCard, { backgroundColor: colors.bayWorkshopDim, borderColor: colors.bayWorkshop }]}>
                <View style={styles.kpiCardHeaderRow}>
                  <Text style={[styles.kpiLabel, { color: colors.bayWorkshopLight }]}>WORKSHOP</Text>
                </View>

                {/* Gross Avg Bay Time */}
                <View style={styles.kpiValRow}>
                  <Wrench size={15} color={colors.bayWorkshopLight} />
                  <View style={styles.kpiMetricCol}>
                    <Text style={[styles.kpiVal, { color: colors.bayWorkshopLight }]}>
                      {formatDuration(kpis?.workshopBay?.avgStageSec ?? 0)}
                    </Text>
                    <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>BAY GROSS AVG STAY TIME</Text>
                  </View>
                </View>

                {/* Bay Avg Active Time */}
                <View style={[styles.kpiValRow, styles.kpiActiveRow]}>
                  <Clock size={13} color={colors.primaryLight} />
                  <View style={styles.kpiMetricCol}>
                    <Text style={[styles.kpiActiveVal, { color: colors.primaryLight }]}>
                      {formatDuration(kpis?.workshopBay?.avgActiveSec ?? 0)}
                    </Text>
                    <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>BAY AVG ACTIVE TIME</Text>
                  </View>
                </View>

                {/* Bottom Vehicle Count */}
                <View style={styles.kpiBottomRow}>
                  <Text style={[styles.kpiBottomText, { color: colors.textMuted }]}>
                    {kpis?.workshopBay?.vehicleCount ?? 0} vehicles
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
                      {formatDuration(kpis?.alignmentBay?.avgStageSec ?? 0)}
                    </Text>
                    <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>BAY GROSS AVG STAY TIME</Text>
                  </View>
                </View>

                {/* Bay Avg Active Time */}
                <View style={[styles.kpiValRow, styles.kpiActiveRow]}>
                  <Clock size={13} color={colors.primaryLight} />
                  <View style={styles.kpiMetricCol}>
                    <Text style={[styles.kpiActiveVal, { color: colors.primaryLight }]}>
                      {formatDuration(kpis?.alignmentBay?.avgActiveSec ?? 0)}
                    </Text>
                    <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>BAY AVG ACTIVE TIME</Text>
                  </View>
                </View>

                {/* Bottom Vehicle Count */}
                <View style={styles.kpiBottomRow}>
                  <Text style={[styles.kpiBottomText, { color: colors.textMuted }]}>
                    {kpis?.alignmentBay?.vehicleCount ?? 0} vehicles
                  </Text>
                </View>
              </View>

              {/* Hoist Bay KPI */}
              <View style={[styles.kpiCard, styles.kpiBayCard, { backgroundColor: colors.bayHoistDim, borderColor: colors.bayHoist }]}>
                <View style={styles.kpiCardHeaderRow}>
                  <Text style={[styles.kpiLabel, { color: colors.bayHoistLight }]}>HOIST</Text>
                </View>

                {/* Gross Avg Bay Time */}
                <View style={styles.kpiValRow}>
                  <Droplets size={15} color={colors.bayHoistLight} />
                  <View style={styles.kpiMetricCol}>
                    <Text style={[styles.kpiVal, { color: colors.bayHoistLight }]}>
                      {formatDuration(kpis?.hoistBay?.avgStageSec ?? 0)}
                    </Text>
                    <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>BAY GROSS AVG STAY TIME</Text>
                  </View>
                </View>

                {/* Bay Avg Active Time */}
                <View style={[styles.kpiValRow, styles.kpiActiveRow]}>
                  <Clock size={13} color={colors.success} />
                  <View style={styles.kpiMetricCol}>
                    <Text style={[styles.kpiActiveVal, { color: colors.success }]}>
                      {formatDuration(kpis?.hoistBay?.avgActiveSec ?? 0)}
                    </Text>
                    <Text style={[styles.kpiSubLabel, { color: colors.textMuted }]}>BAY AVG ACTIVE TIME</Text>
                  </View>
                </View>

                {/* Bottom Vehicle Count */}
                <View style={styles.kpiBottomRow}>
                  <Text style={[styles.kpiBottomText, { color: colors.textMuted }]}>
                    {kpis?.hoistBay?.vehicleCount ?? 0} vehicles
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
              <LoadingSpot message={APP_TERMINOLOGY.telemetry.loadingReportRecords} />
            ) : filteredVehicles.length === 0 ? (
              <EmptyStateCard
                icon={Car}
                title={APP_TERMINOLOGY.emptyStates.noReportRecordsTitle}
                subtitle={APP_TERMINOLOGY.emptyStates.noReportRecordsSubtitle}
              />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={styles.tableScroll}>
                <View>
                  {/* Table Header Row 1: Top Grouped Categories */}
                  <View style={[styles.thRowTop, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)', borderBottomColor: colors.borderGlass }]}>
                    <Text style={[styles.thCell, styles.colPlate, { color: colors.textSecondary }]}>VEHICLE NO</Text>
                    <Text style={[styles.thCell, styles.colStatus, { color: colors.textSecondary }]}>STATUS</Text>
                    {isMultiDate && (
                      <Text style={[styles.thCell, styles.colDate, { color: colors.textSecondary }]}>DATE</Text>
                    )}
                    <Text style={[styles.thCell, styles.colTime, { color: colors.textSecondary }]}>INTAKE</Text>
                    <Text style={[styles.thCell, styles.colTime, { color: colors.textSecondary }]}>FINISHED</Text>
                    <Text style={[styles.thCell, styles.colTime, { color: colors.textSecondary }]}>TOTAL STAY</Text>
                    <Text style={[styles.thCell, styles.colTime, { color: colors.textSecondary }]}>ACTIVE WORK</Text>
                    <Text style={[styles.thCell, styles.colTime, { color: colors.textSecondary }]}>TOTAL IDLE</Text>
                    <Text style={[styles.thCell, styles.colTime, { color: '#fbbf24' }]}>BREAKS</Text>
                    <View style={[styles.thGroupHeader, { borderColor: colors.borderGlass, backgroundColor: colors.bayWorkshopDim }]}>
                      <Text style={[styles.thGroupHeaderText, { color: colors.bayWorkshopLight }]}>{APP_TERMINOLOGY.tasks.general_service.label.toUpperCase()}</Text>
                    </View>
                    <View style={[styles.thGroupHeader, { borderColor: colors.borderGlass, backgroundColor: colors.bayAlignmentDim }]}>
                      <Text style={[styles.thGroupHeaderText, { color: colors.bayAlignmentLight }]}>{APP_TERMINOLOGY.tasks.wheel_alignment.label.toUpperCase()}</Text>
                    </View>
                    <View style={[styles.thGroupHeader, { borderColor: colors.borderGlass, backgroundColor: colors.bayHoistDim }]}>
                      <Text style={[styles.thGroupHeaderText, { color: colors.bayHoistLight }]}>{APP_TERMINOLOGY.tasks.hoist_service.label.toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.thCell, styles.colTasks, { color: colors.textSecondary }]}>TASKS</Text>
                  </View>

                  {/* Table Header Row 2: Sub-Headers (Idle / Active / Breaks per bay) */}
                  <View style={[styles.thRowSub, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)', borderBottomColor: colors.borderGlass }]}>
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
                    let wsIdle = 0, wsActive = 0, wsBreak = 0;
                    let alIdle = 0, alActive = 0, alBreak = 0;
                    let hsIdle = 0, hsActive = 0, hsBreak = 0;
                    let taskSummaryDisplay = '';

                    if (isServerRecord) {
                      const rec = v as ServerReportRecord;
                      isEffectiveDone = rec.is_effective_done;
                      const start = new Date(rec.intake_at || rec.created_at);
                      if (!Number.isNaN(start.getTime())) {
                        intakeDateStr = start.toLocaleDateString('en-US', { day: '2-digit', month: 'short', timeZone: 'Asia/Colombo' });
                        intakeStr = start.toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: true });
                      }

                      if (rec.effective_completed_at) {
                        const end = new Date(rec.effective_completed_at);
                        if (!Number.isNaN(end.getTime())) {
                          finishedStr = end.toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: true });
                        }
                      }

                      grossSec = rec.gross_tat_seconds;
                      activeWorkSec = rec.total_active_sec;
                      totalIdleSec = rec.total_idle_sec;
                      breakSeconds = rec.total_break_seconds;
                      wsIdle = rec.workshop_idle;
                      wsActive = rec.workshop_active;
                      wsBreak = rec.workshop_break;
                      alIdle = rec.alignment_idle;
                      alActive = rec.alignment_active;
                      alBreak = rec.alignment_break;
                      hsIdle = rec.hoist_idle;
                      hsActive = rec.hoist_active;
                      hsBreak = rec.hoist_break;
                      taskSummaryDisplay = rec.completed_tasks_str !== 'None' ? 'Complete' : 'Standard';
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
                        intakeDateStr = start.toLocaleDateString('en-US', { day: '2-digit', month: 'short', timeZone: 'Asia/Colombo' });
                        intakeStr = start.toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: true });
                      }
                      finishedStr = isEffectiveDone && eff.effectiveCompletionDate && !Number.isNaN(eff.effectiveCompletionDate.getTime())
                        ? eff.effectiveCompletionDate.toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: true })
                        : 'In Progress';

                      const workshopTiming = getStageTimingForZone(v, 'workshop');
                      const alignmentTiming = getStageTimingForZone(v, 'alignment');
                      const hoistTiming = getStageTimingForZone(v, 'hoist');
                      wsIdle = workshopTiming.idleSec;
                      wsActive = workshopTiming.activeSec;
                      wsBreak = workshopTiming.breakSec;
                      alIdle = alignmentTiming.idleSec;
                      alActive = alignmentTiming.activeSec;
                      alBreak = alignmentTiming.breakSec;
                      hsIdle = hoistTiming.idleSec;
                      hsActive = hoistTiming.activeSec;
                      hsBreak = hoistTiming.breakSec;

                      const completedTasks = (v.tasks || []).filter((t: any) => t.is_completed).length;
                      const totalTasks = (v.tasks || []).filter((t: any) => t.is_required).length;
                      taskSummaryDisplay = `${completedTasks}/${totalTasks}`;
                    }

                    return (
                      <View key={v.id} style={[styles.tdRow, { borderBottomColor: colors.borderGlass }]}>
                        <View style={[styles.tdCell, styles.colPlate]}>
                          <LicensePlate number={v.vehicle_no} size="sm" />
                        </View>
                        <View style={[styles.tdCell, styles.colStatus]}>
                          <StatusPill
                            variant={isEffectiveDone ? 'DONE' : 'ACTIVE'}
                            label={isEffectiveDone ? 'DONE' : (v.current_zone === 'workshop' ? 'GENERAL' : v.current_zone.toUpperCase())}
                            size="sm"
                          />
                        </View>
                        {isMultiDate && (
                          <Text style={[styles.tdText, styles.colDate, { color: colors.textSecondary, fontWeight: '600' }]}>
                            {intakeDateStr}
                          </Text>
                        )}
                        <Text style={[styles.tdText, styles.colTime, { color: colors.textSecondary }]}>
                          {intakeStr}
                        </Text>
                        <Text style={[styles.tdText, styles.colTime, { color: isEffectiveDone ? colors.success : colors.warningLight, fontWeight: isEffectiveDone ? '700' : '400' }]}>
                          {finishedStr}
                        </Text>
                        <Text style={[styles.tdText, styles.colTime, { color: colors.primaryLight, fontWeight: '700' }]}>
                          {formatDuration(grossSec)}
                        </Text>
                        <Text style={[styles.tdText, styles.colTime, { color: colors.primaryLight, fontWeight: '700' }]}>
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
                          {wsIdle > 0 ? formatDuration(wsIdle) : '-'}
                        </Text>
                        <Text style={[
                          styles.tdText, 
                          styles.colSubBay, 
                          wsActive > 7200 
                            ? { backgroundColor: '#fee2e2', color: '#b91c1c', fontWeight: '900', borderRadius: 4 } 
                            : { color: colors.primaryLight, fontWeight: '700' }
                        ]}>
                          {wsActive > 7200 ? `🚩 ${formatDuration(wsActive)}` : wsActive > 0 ? formatDuration(wsActive) : '-'}
                        </Text>
                        <Text style={[styles.tdText, styles.colSubBay, { color: wsBreak > 0 ? '#fbbf24' : colors.textMuted }]}>
                          {wsBreak > 0 ? formatDuration(wsBreak) : '-'}
                        </Text>
                        {/* Wheel Alignment (Idle / Active / Breaks) */}
                        <Text style={[styles.tdText, styles.colSubBay, { color: colors.warning }]}>
                          {alIdle > 0 ? formatDuration(alIdle) : '-'}
                        </Text>
                        <Text style={[
                          styles.tdText, 
                          styles.colSubBay, 
                          alActive > 7200 
                            ? { backgroundColor: '#fee2e2', color: '#b91c1c', fontWeight: '900', borderRadius: 4 } 
                            : { color: colors.primaryLight, fontWeight: '700' }
                        ]}>
                          {alActive > 7200 ? `🚩 ${formatDuration(alActive)}` : alActive > 0 ? formatDuration(alActive) : '-'}
                        </Text>
                        <Text style={[styles.tdText, styles.colSubBay, { color: alBreak > 0 ? '#fbbf24' : colors.textMuted }]}>
                          {alBreak > 0 ? formatDuration(alBreak) : '-'}
                        </Text>
                        {/* Hoist Service (Idle / Active / Breaks) */}
                        <Text style={[styles.tdText, styles.colSubBay, { color: colors.warning }]}>
                          {hsIdle > 0 ? formatDuration(hsIdle) : '-'}
                        </Text>
                        <Text style={[
                          styles.tdText, 
                          styles.colSubBay, 
                          hsActive > 7200 
                            ? { backgroundColor: '#fee2e2', color: '#b91c1c', fontWeight: '900', borderRadius: 4 } 
                            : { color: colors.primaryLight, fontWeight: '700' }
                        ]}>
                          {hsActive > 7200 ? `🚩 ${formatDuration(hsActive)}` : hsActive > 0 ? formatDuration(hsActive) : '-'}
                        </Text>
                        <Text style={[styles.tdText, styles.colSubBay, { color: hsBreak > 0 ? '#fbbf24' : colors.textMuted }]}>
                          {hsBreak > 0 ? formatDuration(hsBreak) : '-'}
                        </Text>
                        <Text style={[styles.tdText, styles.colTasks, { color: colors.textPrimary, fontWeight: '600' }]}>
                          {taskSummaryDisplay}
                          {v.is_booking ? ' · 📅' : ''}
                          {v.has_additional_repairs ? ' · 🔧' : ''}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>
        </>
      )}

      </ScrollView>

      {/* Sticky Bottom Action Footer */}
      {(!isSuperAdmin || activeReportTab === 'kpi') && (
        <View style={[styles.stickyFooter, { backgroundColor: colors.surface, borderTopColor: colors.borderGlass }]}>
          <View style={styles.stickyFooterLeft}>
            {/* Back Button matching right-side action buttons */}
            <TouchableOpacity
              style={[
                styles.exportBtn,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                  borderWidth: 1,
                  borderColor: colors.borderGlass,
                },
              ]}
              onPress={() => setIsReportsModalOpen(false)}
              activeOpacity={0.8}
            >
              <ArrowLeft size={15} color={colors.textPrimary} />
              <Text style={[styles.exportBtnText, { color: colors.textPrimary }]}>Back</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.stickyFooterRight}>
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
      )}

      {/* Audit & Calculation Standard Modal (Extracted to keep report uncluttered) */}
      <BaseModal
        visible={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        maxWidth={560}
        maxHeight="85%"
        icon={<Info size={20} color={colors.primaryLight} />}
        title="Report Audit & Calculation Standard"
        subtitle="Operational formulas and vehicle metrics standard"
        footer={
          <View style={styles.auditModalFooter}>
            <TouchableOpacity
              style={[styles.auditCloseBtn, { backgroundColor: colors.primary }]}
              onPress={() => setIsAuditModalOpen(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.auditCloseBtnText}>Understand & Close</Text>
            </TouchableOpacity>
          </View>
        }
      >
        <View style={styles.auditModalBody}>
          {/* 1. Automated Break Deductions */}
          <View style={[styles.auditRuleCard, { backgroundColor: colors.warningDim, borderColor: colors.warning }]}>
            <View style={styles.auditRuleHeader}>
              <Coffee size={15} color={colors.warningLight} />
              <Text style={[styles.auditRuleTitle, { color: colors.warningLight }]}>
                Workshop Shift Break Deductions
              </Text>
            </View>
            <Text style={[styles.auditRuleDesc, { color: colors.textSecondary }]}>
              Statutory workshop rest periods are automatically calculated down to the exact second of vehicle tenure overlap and deducted from net working durations:
            </Text>
            <View style={styles.auditBreakScheduleRow}>
              <View style={[styles.auditBreakBadge, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)' }]}>
                <Text style={[styles.auditBreakBadgeText, { color: colors.textPrimary }]}>☕ Morning Tea: 09:45 – 10:00 (15m)</Text>
              </View>
              <View style={[styles.auditBreakBadge, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)' }]}>
                <Text style={[styles.auditBreakBadgeText, { color: colors.textPrimary }]}>🍱 Lunch: 12:30 – 13:00 (30m)</Text>
              </View>
              <View style={[styles.auditBreakBadge, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)' }]}>
                <Text style={[styles.auditBreakBadgeText, { color: colors.textPrimary }]}>☕ Evening Tea: 14:45 – 15:00 (15m)</Text>
              </View>
            </View>
          </View>

          {/* 2. Bay Gross Avg Stay Time (Dispatched Bay Velocity) */}
          <View style={[styles.auditRuleCard, { backgroundColor: colors.bayWorkshopDim, borderColor: colors.bayWorkshop }]}>
            <View style={styles.auditRuleHeader}>
              <Wrench size={15} color={colors.bayWorkshopLight} />
              <Text style={[styles.auditRuleTitle, { color: colors.bayWorkshopLight }]}>
                Bay Gross Avg Stay Time & Velocity
              </Text>
            </View>
            <Text style={[styles.auditRuleDesc, { color: colors.textSecondary }]}>
              Working bay occupancy (<Text style={{ fontWeight: '700', color: colors.textPrimary }}>Active Labor + Staging Idle</Text>) calculated strictly for vehicles that have completed their tasks and dispatched to the next station.
            </Text>
            <View style={[styles.auditPillNote, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)' }]}>
              <Text style={[styles.auditPillNoteText, { color: colors.textMuted }]}>
                ⏱ In-progress vehicles currently sitting undispatched are excluded from bay averages to ensure historical KPI integrity.
              </Text>
            </View>
          </View>

          {/* 3. Pure Active Labor vs Idle Time Breakdown */}
          <View style={[styles.auditRuleCard, { backgroundColor: colors.bayAlignmentDim, borderColor: colors.bayAlignment }]}>
            <View style={styles.auditRuleHeader}>
              <Clock size={15} color={colors.bayAlignmentLight} />
              <Text style={[styles.auditRuleTitle, { color: colors.bayAlignmentLight }]}>
                Net Active Time vs. Idle time
              </Text>
            </View>
            <Text style={[styles.auditRuleDesc, { color: colors.textSecondary }]}>
              <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Net Working Time</Text> = Gross Turnaround − Shift Breaks.
            </Text>
            <Text style={[styles.auditRuleDesc, { color: colors.textSecondary, marginTop: 4 }]}>
              • <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Net Active Time</Text>: Pure hands-on labor duration logged during active checklist execution.
            </Text>
            <Text style={[styles.auditRuleDesc, { color: colors.textSecondary, marginTop: 2 }]}>
              • <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Idle time</Text>: Duration vehicle spent queued in bay waiting for technician allocation or parts movement.
            </Text>
          </View>

          {/* 4. Autonomous Retention & Daily Rollover */}
          <View style={[styles.auditRuleCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)', borderColor: colors.borderGlass }]}>
            <View style={styles.auditRuleHeader}>
              <Database size={15} color={colors.primaryLight} />
              <Text style={[styles.auditRuleTitle, { color: colors.primaryLight }]}>
                Autonomous Retention & Rollover
              </Text>
            </View>
            <Text style={[styles.auditRuleDesc, { color: colors.textSecondary }]}>
              Historical vehicle logs are preserved for <Text style={{ fontWeight: '700', color: colors.textPrimary }}>90 days</Text> with automatic archiving. Completed inspection vehicles roll over autonomously.
            </Text>
          </View>
        </View>
      </BaseModal>
    </View>
  );
};

export { ServiceReportsModal as ServiceReportsScreen };

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 24,
    gap: 16,
  },
  stickyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 16,
    zIndex: 50,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.15)',
        } as any)
      : {
          elevation: 8,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.2,
          shadowRadius: 6,
        }),
  },
  stickyFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stickyFooterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  headerIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pageTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  infoIconButtonOnly: {
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  recordBadge: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  recordBadgeText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  auditModalBody: {
    gap: 12,
  },
  auditRuleCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
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
    letterSpacing: 0.3,
  },
  auditRuleDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  auditPillNote: {
    padding: 8,
    borderRadius: 6,
    marginTop: 2,
  },
  auditPillNoteText: {
    fontSize: 10,
    lineHeight: 14,
  },
  auditBreakScheduleRow: {
    flexDirection: 'column',
    gap: 4,
    marginTop: 6,
  },
  auditBreakBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  auditBreakBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  auditModalFooter: {
    width: '100%',
    alignItems: 'flex-end',
  },
  auditCloseBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  auditCloseBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
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
  activeRangeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    marginLeft: 4,
  },
  activeRangeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
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
  kpiUnifiedCard: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    marginBottom: 14,
  },
  kpiThreeColRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  kpiCol: {
    flex: 1,
    gap: 3,
  },
  kpiBigVal: {
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 26,
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
  colDate: { width: 72 },
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
  tabSwitcherBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  tabSwitcherBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  tabSwitcherBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
