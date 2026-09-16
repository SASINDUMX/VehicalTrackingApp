import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView, Text } from 'react-native';
import { ArrowLeft, Download, Printer } from 'lucide-react-native';
import { useVehicles } from '../../context/VehicleContext';
import { useTheme } from '../../context/ThemeContext';
import { usePermissions } from '../../hooks/usePermissions';
import { vehicleService } from '../../services/vehicleService';
import { Vehicle } from '../../types/vehicle';
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
} from '../../utils/reportExportUtils';
import { ReportsFilterBar } from './ReportsFilterBar';
import { ReportsKPIGrid } from './ReportsKPIGrid';
import { ReportsTableView } from './ReportsTableView';
import { ReportsCalculationInfoModal } from './ReportsCalculationInfoModal';
import { AuditTrailView } from './AuditTrailView';

const DATE_PRESETS: { id: DateFilterPreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7days', label: 'Last 7 Days' },
  { id: 'month', label: 'This Month' },
  { id: '3months', label: 'Last 3 Months' },
];

const STATUS_PRESETS: { id: StatusFilterPreset; label: string }[] = [
  { id: 'all', label: 'All Status' },
  { id: 'completed', label: 'Completed Only' },
  { id: 'in_progress', label: 'In Progress Only' },
];

export const ServiceReportsModal: React.FC = () => {
  const {
    vehicles,
    fetchHistoricalVehicles,
    setIsReportsModalOpen,
    activeReportsTab,
    isCalculationInfoOpen,
    setIsCalculationInfoOpen,
    reportsRefreshTrigger,
  } = useVehicles();
  const { colors, isDark } = useTheme();
  const { canViewAuditLogs } = usePermissions();

  const [datePreset, setDatePreset] = useState<DateFilterPreset>('today');
  const [statusPreset, setStatusPreset] = useState<StatusFilterPreset>('all');
  const [reportVehicles, setReportVehicles] = useState<Vehicle[]>(vehicles);
  const [isLoadingReport, setIsLoadingReport] = useState<boolean>(false);

  // Initialize with today's date formatted as YYYY-MM-DD
  const [customDate, setCustomDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [customEndDate, setCustomEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  const [serverKPIs, setServerKPIs] = useState<ReportKPIs | null>(null);
  const [serverRecords, setServerRecords] = useState<ServerReportRecord[] | null>(null);

  const handleSelectPreset = (presetId: DateFilterPreset) => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    if (presetId === 'today') {
      setCustomDate(todayStr);
      setCustomEndDate(todayStr);
    } else if (presetId === 'yesterday') {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const yStr = yesterday.toISOString().split('T')[0];
      setCustomDate(yStr);
      setCustomEndDate(yStr);
    } else if (presetId === '7days') {
      const past7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      setCustomDate(past7.toISOString().split('T')[0]);
      setCustomEndDate(todayStr);
    } else if (presetId === 'month') {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setCustomDate(firstOfMonth.toISOString().split('T')[0]);
      setCustomEndDate(todayStr);
    } else if (presetId === '3months') {
      const past3Mo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      setCustomDate(past3Mo.toISOString().split('T')[0]);
      setCustomEndDate(todayStr);
    }
    setDatePreset(presetId);
  };

  const handleCustomDateChange = (fromStr: string) => {
    setCustomDate(fromStr);
    setDatePreset('custom');
  };

  const handleCustomEndDateChange = (toStr: string) => {
    setCustomEndDate(toStr);
    setDatePreset('custom');
  };

  const vehiclesRef = useRef(vehicles);
  useEffect(() => {
    vehiclesRef.current = vehicles;
  }, [vehicles]);

  // Fetch historical data whenever dates or status change
  useEffect(() => {
    let isCancelled = false;
    setServerKPIs(null);
    setServerRecords(null);

    let startDate: string | null = null;
    let endDate: string | null = null;

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
      // Single-day filter: End date defaults to 23:59:59 of the start day
      const parsedStart = new Date(startStr);
      endDate = new Date(parsedStart.getFullYear(), parsedStart.getMonth(), parsedStart.getDate(), 23, 59, 59, 999).toISOString();
    }

    setIsLoadingReport(true);

    // Primary: Call the hardened PostgreSQL get_service_report_data RPC
    vehicleService
      .fetchReportData({
        startDate,
        endDate,
        status: statusPreset,
      })
      .then((res) => {
        if (!isCancelled && res) {
          if (res.kpis) setServerKPIs(res.kpis as ReportKPIs);
          if (res.records && res.records.length > 0) {
            setServerRecords(res.records as ServerReportRecord[]);
            setIsLoadingReport(false);
            return;
          }
        }

        // Fallback: If RPC not yet applied, fallback to raw vehicles fetch
        const isTodayRange = customDate === new Date().toISOString().split('T')[0] && customEndDate === customDate;
        if (isTodayRange) {
          setReportVehicles(vehiclesRef.current);
          setIsLoadingReport(false);
        } else {
          fetchHistoricalVehicles(datePreset, startDate || undefined, endDate || undefined)
            .then((data) => {
              if (!isCancelled) setReportVehicles(data);
            })
            .finally(() => {
              if (!isCancelled) setIsLoadingReport(false);
            });
        }
      })
      .catch(() => {
        const isTodayRange = customDate === new Date().toISOString().split('T')[0] && customEndDate === customDate;
        if (isTodayRange) {
          setReportVehicles(vehiclesRef.current);
          setIsLoadingReport(false);
        } else {
          fetchHistoricalVehicles(datePreset, startDate || undefined, endDate || undefined)
            .then((data) => {
              if (!isCancelled) setReportVehicles(data);
            })
            .finally(() => {
              if (!isCancelled) setIsLoadingReport(false);
            });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [customDate, customEndDate, statusPreset, fetchHistoricalVehicles, datePreset, reportsRefreshTrigger]);

  const filteredVehicles = useMemo(() => {
    if (serverRecords) {
      return serverRecords;
    }

    let customRange: { start: string; end?: string } | undefined = undefined;
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
    return filterVehiclesForReport(reportVehicles, 'custom', statusPreset, customRange);
  }, [serverRecords, reportVehicles, statusPreset, customDate, customEndDate]);

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
  const activeStatusLabel = STATUS_PRESETS.find((s) => s.id === statusPreset)?.label || 'All Status';
  const activeFilterLabel = `${dateRangeInfo.label} (${dateRangeInfo.rangeStr}) · ${activeStatusLabel}`;

  return (
    <View style={[styles.outerContainer, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={true}
      >
        {canViewAuditLogs && activeReportsTab === 'audit' ? (
          <AuditTrailView />
        ) : (
          <>
            {/* Filter Bar */}
            <ReportsFilterBar
              datePreset={datePreset}
              statusPreset={statusPreset}
              customDate={customDate}
              customEndDate={customEndDate}
              dateRangeStr={dateRangeInfo.rangeStr}
              datePresets={DATE_PRESETS}
              statusPresets={STATUS_PRESETS}
              onSelectDatePreset={handleSelectPreset}
              onSelectStatusPreset={setStatusPreset}
              onCustomDateChange={handleCustomDateChange}
              onCustomEndDateChange={handleCustomEndDateChange}
            />

            {/* Executive KPI Metric Cards */}
            <ReportsKPIGrid kpis={kpis} />

            {/* Table Preview */}
            <ReportsTableView
              filteredVehicles={filteredVehicles}
              isLoadingReport={isLoadingReport}
              isMultiDate={isMultiDate}
            />
          </>
        )}
      </ScrollView>

      {/* Sticky Bottom Action Footer */}
      {(!canViewAuditLogs || activeReportsTab === 'kpi') && (
        <View
          style={[
            styles.stickyFooter,
            { backgroundColor: colors.surface, borderTopColor: colors.borderGlass },
          ]}
        >
          <View style={styles.stickyFooterLeft}>
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
            <TouchableOpacity
              style={[styles.exportBtn, { backgroundColor: colors.success }]}
              onPress={() => exportServiceLogsToCSV(filteredVehicles, activeFilterLabel, kpis)}
              activeOpacity={0.8}
            >
              <Download size={15} color="#ffffff" />
              <Text style={styles.exportBtnText}>Download Excel</Text>
            </TouchableOpacity>

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

      {/* Audit & Calculation Standard Modal */}
      <ReportsCalculationInfoModal
        visible={isCalculationInfoOpen}
        onClose={() => setIsCalculationInfoOpen(false)}
      />
    </View>
  );
};

export { ServiceReportsModal as ServiceReportsScreen };

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    position: 'relative',
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 80,
  },
  stickyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
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
