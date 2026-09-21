import { Platform } from 'react-native';
import { Vehicle, BayZone } from '../types/vehicle';
import { getBreakOverlap, getNetWorkingSeconds } from './workshopHoursUtils';
import { getStageTiming, getTaskTypeForBay } from './vehicleUtils';

export interface BayKPI {
  zone: BayZone;
  name: string;
  vehicleCount: number;
  totalActiveSec: number;
  avgActiveSec: number;
  totalIdleSec: number;
  avgIdleSec: number;
  totalStageSec: number;
  avgStageSec: number;
}

export interface ReportKPIs {
  totalVehicles: number;
  completedCount: number;
  inProgressCount: number;
  bookingCount: number;
  additionalRepairsCount: number;
  onHoldCount?: number;
  washingBay?: BayKPI;
  workshopBay: BayKPI;
  alignmentBay: BayKPI;
  hoistBay: BayKPI;
  // Optional telemetry
  totalBreakSeconds?: number;
}

export interface ServerReportRecord {
  id: string;
  vehicle_no: string;
  status: string;
  current_zone: BayZone;
  is_finished: boolean;
  is_effective_done: boolean;
  is_paused?: boolean;
  pause_reason?: string | null;
  is_on_hold?: boolean;
  is_booking: boolean;
  has_additional_repairs: boolean;
  technician_name: string | null;
  assigned_tech: string | null;
  remarks: string | null;
  intake_at: string | null;
  created_at: string;
  effective_completed_at: string | null;
  gross_tat_seconds: number;
  net_tat_seconds: number;
  total_break_seconds: number;
  total_idle_sec: number;
  total_active_sec: number;
  workshop_first_in?: string | null;
  workshop_idle: number;
  workshop_active: number;
  workshop_break: number;
  alignment_first_in?: string | null;
  alignment_idle: number;
  alignment_active: number;
  alignment_break: number;
  hoist_first_in?: string | null;
  hoist_idle: number;
  hoist_active: number;
  hoist_break: number;
  completed_tasks_str: string;
  tasks_completed_count?: number;
  tasks_total_count?: number;
  is_urgent?: boolean;
  urgent_note?: string | null;
}

export type DateFilterPreset = 'today' | 'yesterday' | '7days' | 'month' | '3months' | 'custom';
export type StatusFilterPreset = 'all' | 'completed' | 'in_progress';

export const formatDuration = (totalSeconds: number): string => {
  if (Number.isNaN(totalSeconds) || totalSeconds <= 0) return '0m 00s';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes < 10 ? '0' : ''}${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`;
  }
  return `${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`;
};

export const formatFirstInTime = (isoString?: string | null): string => {
  if (!isoString) return '-';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Colombo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

/**
 * Helper to determine if a vehicle is effectively finished/ready:
 * - Either explicitly marked is_finished = true
 * - Or has arrived in the 'inspection' zone (all workshop bay tasks completed)
 *
 * Returns the effective completion date (either v.completed_at or the moment it entered the inspection zone).
 */
export const getVehicleEffectiveCompletion = (v: Vehicle): { isEffectiveDone: boolean; effectiveCompletionDate: Date | null } => {
  // Dispatched to inspection zone marks the definitive end of all vehicle time calculations
  const inspLog = (v.stage_logs || []).find(l => l.to_zone === 'inspection');
  if (inspLog?.entered_at) {
    const d = new Date(inspLog.entered_at);
    if (!Number.isNaN(d.getTime())) {
      return { isEffectiveDone: true, effectiveCompletionDate: d };
    }
  }

  if (v.current_zone === 'inspection') {
    return { isEffectiveDone: true, effectiveCompletionDate: new Date() };
  }

  if (v.is_finished && v.completed_at) {
    const d = new Date(v.completed_at);
    if (!Number.isNaN(d.getTime())) {
      return { isEffectiveDone: true, effectiveCompletionDate: d };
    }
  }

  return { isEffectiveDone: false, effectiveCompletionDate: null };
};

export const filterVehiclesForReport = (
  vehicles: Vehicle[],
  datePreset: DateFilterPreset = '3months',
  statusPreset: StatusFilterPreset = 'all',
  customDateRange?: { start: string; end?: string }
): Vehicle[] => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  const startOf7Days = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOf3Months = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());

  return vehicles.filter(v => {
    // 1. Date Filter
    const intakeDate = new Date(v.intake_at || v.created_at);
    if (Number.isNaN(intakeDate.getTime())) return true;

    if (datePreset === 'today' && intakeDate < startOfToday) return false;
    if (datePreset === 'yesterday' && (intakeDate < startOfYesterday || intakeDate >= startOfToday)) return false;
    if (datePreset === '7days' && intakeDate < startOf7Days) return false;
    if (datePreset === 'month' && intakeDate < startOfMonth) return false;
    if (datePreset === '3months' && intakeDate < startOf3Months) return false;
    if (datePreset === 'custom' && customDateRange?.start) {
      const customStart = new Date(customDateRange.start);
      if (!Number.isNaN(customStart.getTime()) && intakeDate < customStart) return false;
      if (customDateRange.end) {
        const customEnd = new Date(customDateRange.end);
        if (!Number.isNaN(customEnd.getTime()) && intakeDate > customEnd) return false;
      }
    }

    // 2. Status Filter (Vehicles in inspection zone are treated as completed/ready)
    const { isEffectiveDone } = getVehicleEffectiveCompletion(v);
    if (statusPreset === 'completed' && !isEffectiveDone) return false;
    if (statusPreset === 'in_progress' && isEffectiveDone) return false;

    return true;
  });
};

/**
 * Returns user-friendly date boundary description for a given preset, e.g. "05 Sep 2026" or "29 Aug – 05 Sep 2026".
 */
export const getDatePresetRangeDescription = (
  preset: DateFilterPreset,
  customDate?: string,
  customEndDate?: string
): { label: string; rangeStr: string; isMultiDate: boolean } => {
  const now = new Date();
  const formatFullDate = (d: Date) =>
    d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Colombo' });
  const formatShortDate = (d: Date) =>
    d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', timeZone: 'Asia/Colombo' });

  const todayStr = formatFullDate(now);

  switch (preset) {
    case 'today':
      return { label: 'Today', rangeStr: todayStr, isMultiDate: false };

    case 'yesterday': {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return { label: 'Yesterday', rangeStr: formatFullDate(yesterday), isMultiDate: false };
    }

    case '7days': {
      const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { label: 'Last 7 Days', rangeStr: `${formatShortDate(past7)} – ${todayStr}`, isMultiDate: true };
    }

    case 'month': {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return { label: 'This Month', rangeStr: `${formatShortDate(firstOfMonth)} – ${todayStr}`, isMultiDate: true };
    }

    case '3months': {
      const past3Mo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      return { label: 'Last 3 Months', rangeStr: `${formatShortDate(past3Mo)} – ${todayStr}`, isMultiDate: true };
    }

    case 'custom': {
      if (customDate && customEndDate && customDate !== customEndDate) {
        return {
          label: 'Custom Range',
          rangeStr: `${customDate} – ${customEndDate}`,
          isMultiDate: true,
        };
      }
      return {
        label: 'Custom Date',
        rangeStr: customDate ? customDate : 'Select Date',
        isMultiDate: false,
      };
    }

    default:
      return { label: 'Today', rangeStr: todayStr, isMultiDate: false };
  }
};


export const calculateReportKPIs = (filteredVehicles: Vehicle[]): ReportKPIs => {
  const emptyBayKPI = (zone: BayZone, name: string): BayKPI => ({
    zone,
    name,
    vehicleCount: 0,
    totalActiveSec: 0,
    avgActiveSec: 0,
    totalIdleSec: 0,
    avgIdleSec: 0,
    totalStageSec: 0,
    avgStageSec: 0,
  });

  if (filteredVehicles.length === 0) {
    return {
      totalVehicles: 0,
      completedCount: 0,
      inProgressCount: 0,
      bookingCount: 0,
      additionalRepairsCount: 0,
      workshopBay: emptyBayKPI('workshop', 'General Service'),
      alignmentBay: emptyBayKPI('alignment', 'Wheel Alignment'),
      hoistBay: emptyBayKPI('hoist', 'Hoist Service'),
      totalBreakSeconds: 0,
    };
  }

  let totalBreaks = 0;
  let completed = 0;
  let bookingCount = 0;
  let additionalRepairsCount = 0;
  let onHoldCount = 0;

  // Bay telemetry accumulators (Excludes additional repairs & on-hold vehicles from standard benchmark velocity)
  let workshopVehicles = 0;
  let workshopActive = 0;
  let workshopIdle = 0;
  let workshopStage = 0;

  let alignmentVehicles = 0;
  let alignmentActive = 0;
  let alignmentIdle = 0;
  let alignmentStage = 0;

  let hoistVehicles = 0;
  let hoistActive = 0;
  let hoistIdle = 0;
  let hoistStage = 0;

  filteredVehicles.forEach(v => {
    const { isEffectiveDone, effectiveCompletionDate } = getVehicleEffectiveCompletion(v);
    if (isEffectiveDone) completed++;
    if (v.is_booking) bookingCount++;
    if (v.has_additional_repairs) additionalRepairsCount++;
    const isHold = Boolean(v.is_paused || v.status === 'on_hold');
    if (isHold) onHoldCount++;

    const start = new Date(v.intake_at || v.created_at);
    const end = effectiveCompletionDate ? effectiveCompletionDate : new Date();
    const { breakSeconds } = getBreakOverlap(start, end);
    totalBreaks += breakSeconds;

    // RULE: Vehicles flagged with additional repairs OR on hold/major repairs are excluded from benchmark averages
    const isExcludedFromAverage = Boolean(v.has_additional_repairs || isHold);

    // Workshop Bay (Only count officially completed AND dispatched vehicles)
    const workshopTiming = getStageTimingForZone(v, 'workshop');
    if (workshopTiming.isCompletedAndDispatched && !isExcludedFromAverage) {
      workshopVehicles++;
      workshopActive += workshopTiming.activeSec;
      workshopIdle += workshopTiming.idleSec;
      workshopStage += workshopTiming.totalSec;
    }

    // Alignment Bay (Only count officially completed AND dispatched vehicles)
    const alignmentTiming = getStageTimingForZone(v, 'alignment');
    if (alignmentTiming.isCompletedAndDispatched && !isExcludedFromAverage) {
      alignmentVehicles++;
      alignmentActive += alignmentTiming.activeSec;
      alignmentIdle += alignmentTiming.idleSec;
      alignmentStage += alignmentTiming.totalSec;
    }

    // Hoist Bay (Only count officially completed AND dispatched vehicles)
    const hoistTiming = getStageTimingForZone(v, 'hoist');
    if (hoistTiming.isCompletedAndDispatched && !isExcludedFromAverage) {
      hoistVehicles++;
      hoistActive += hoistTiming.activeSec;
      hoistIdle += hoistTiming.idleSec;
      hoistStage += hoistTiming.totalSec;
    }
  });

  return {
    totalVehicles: filteredVehicles.length,
    completedCount: completed,
    inProgressCount: filteredVehicles.length - completed,
    bookingCount,
    additionalRepairsCount,
    onHoldCount,
    workshopBay: {
      zone: 'workshop',
      name: 'General Service',
      vehicleCount: workshopVehicles,
      totalActiveSec: workshopActive,
      avgActiveSec: workshopVehicles > 0 ? Math.floor(workshopActive / workshopVehicles) : 0,
      totalIdleSec: workshopIdle,
      avgIdleSec: workshopVehicles > 0 ? Math.floor(workshopIdle / workshopVehicles) : 0,
      totalStageSec: workshopStage,
      avgStageSec: workshopVehicles > 0 ? Math.floor(workshopStage / workshopVehicles) : 0,
    },
    alignmentBay: {
      zone: 'alignment',
      name: 'Wheel Alignment',
      vehicleCount: alignmentVehicles,
      totalActiveSec: alignmentActive,
      avgActiveSec: alignmentVehicles > 0 ? Math.floor(alignmentActive / alignmentVehicles) : 0,
      totalIdleSec: alignmentIdle,
      avgIdleSec: alignmentVehicles > 0 ? Math.floor(alignmentIdle / alignmentVehicles) : 0,
      totalStageSec: alignmentStage,
      avgStageSec: alignmentVehicles > 0 ? Math.floor(alignmentStage / alignmentVehicles) : 0,
    },
    hoistBay: {
      zone: 'hoist',
      name: 'Hoist Service',
      vehicleCount: hoistVehicles,
      totalActiveSec: hoistActive,
      avgActiveSec: hoistVehicles > 0 ? Math.floor(hoistActive / hoistVehicles) : 0,
      totalIdleSec: hoistIdle,
      avgIdleSec: hoistVehicles > 0 ? Math.floor(hoistIdle / hoistVehicles) : 0,
      totalStageSec: hoistStage,
      avgStageSec: hoistVehicles > 0 ? Math.floor(hoistStage / hoistVehicles) : 0,
    },
    totalBreakSeconds: totalBreaks,
  };
};

export const getStageSecondsForZone = (v: Vehicle, zone: BayZone): number => {
  const logs = (v.stage_logs || []).filter(l => l.to_zone === zone);
  let total = 0;
  logs.forEach(l => {
    if (l.duration_seconds && l.duration_seconds > 0) {
      total += l.duration_seconds;
    } else if (l.entered_at) {
      const enter = new Date(l.entered_at);
      const isLogPaused = Boolean(l.is_paused || (v.current_zone === zone && v.is_paused));
      const pausedAt = l.paused_at || (v.current_zone === zone ? v.paused_at : null);
      const pausedSec = l.paused_seconds || (v.current_zone === zone ? v.paused_seconds : 0) || 0;
      const exit = isLogPaused && pausedAt ? new Date(pausedAt) : (l.exited_at ? new Date(l.exited_at) : new Date());
      const rawSec = Math.max(0, Math.floor((exit.getTime() - enter.getTime()) / 1000));
      total += Math.max(0, rawSec - pausedSec);
    }
  });
  return total;
};

export interface BayTelemetry {
  firstIn: string | null;
  queueInSec: number;
  activeSec: number;
  queueOutSec: number;
  idleSec: number;
  breakSec: number;
  totalSec: number;
  isDispatched: boolean;
  isCompleted: boolean;
  isCompletedAndDispatched: boolean;
}

export const getStageTimingForZone = (v: Vehicle, zone: BayZone): BayTelemetry => {
  const logs = (v.stage_logs || []).filter(l => l.to_zone === zone);
  let firstIn: string | null = null;
  if (logs.length > 0) {
    const validLogs = logs.filter(l => l.entered_at);
    if (validLogs.length > 0) {
      const earliest = validLogs.reduce((min, l) =>
        new Date(l.entered_at!).getTime() < new Date(min.entered_at!).getTime() ? l : min
      );
      firstIn = earliest.entered_at;
    }
  }

  let queueInSec = 0;
  let activeSec = 0;
  let queueOutSec = 0;
  let idleSec = 0;
  let breakSec = 0;
  let totalSec = 0;
  let hasClosedLog = false;

  // Find task corresponding to this zone to get completion status and work_completed_at
  const bayTaskType = getTaskTypeForBay(zone);
  const tasks = v.tasks || [];
  const currentTask = tasks.find(t => t.task_type === bayTaskType && t.is_required) || tasks.find(t => t.task_type === bayTaskType);
  const isCompleted = Boolean(currentTask?.is_completed);
  const workCompletedAt = currentTask?.is_completed ? currentTask.completed_at : null;

  logs.forEach(l => {
    if (l.exited_at) {
      hasClosedLog = true;
    }

    const timing = getStageTiming(
      l.entered_at,
      l.work_started_at,
      l.exited_at,
      l.idle_seconds,
      l.duration_seconds,
      workCompletedAt
    );
    queueInSec += timing.queueInSeconds;
    activeSec += timing.activeSeconds;
    queueOutSec += timing.queueOutSeconds;
    idleSec += timing.idleSeconds;
    totalSec += timing.totalStageSeconds;

    if (l.entered_at) {
      const { effectiveCompletionDate } = getVehicleEffectiveCompletion(v);
      const enter = new Date(l.entered_at);
      const exit = l.exited_at
        ? new Date(l.exited_at)
        : (effectiveCompletionDate || new Date());
      const { breakSeconds } = getBreakOverlap(enter, exit);
      breakSec += breakSeconds;
    }
  });

  // Dispatched requires a stamped exit log, or vehicle having moved on to a different zone
  const isDispatched = hasClosedLog || (logs.length > 0 && v.current_zone !== zone);
  const isCompletedAndDispatched = isCompleted && isDispatched;

  return { firstIn, queueInSec, activeSec, queueOutSec, idleSec, breakSec, totalSec, isDispatched, isCompleted, isCompletedAndDispatched };
};

export const getVehicleIdleAndActiveTotals = (v: Vehicle): { totalIdleSec: number; totalActiveSec: number } => {
  let totalIdleSec = 0;
  let totalActiveSec = 0;

  // Filter strictly to working bays ('workshop' | 'alignment' | 'hoist').
  // The 'inspection' zone represents the post-service completion stage and is never counted as bay idle/active time.
  const workingBayLogs = (v.stage_logs || []).filter(l => l.to_zone === 'workshop' || l.to_zone === 'alignment' || l.to_zone === 'hoist');

  workingBayLogs.forEach(l => {
    const bayTaskType = getTaskTypeForBay(l.to_zone);
    const tasks = v.tasks || [];
    const currentTask = tasks.find(t => t.task_type === bayTaskType && t.is_required) || tasks.find(t => t.task_type === bayTaskType);
    const workCompletedAt = currentTask?.is_completed ? currentTask.completed_at : null;

    const timing = getStageTiming(
      l.entered_at,
      l.work_started_at,
      l.exited_at,
      l.idle_seconds,
      l.duration_seconds,
      workCompletedAt
    );
    totalIdleSec += timing.idleSeconds;
    totalActiveSec += timing.activeSeconds;
  });

  return { totalIdleSec, totalActiveSec };
};

/**
 * Generates an Excel-compatible CSV with UTF-8 BOM encoding and Two-Tier Grouped Headers.
 */
export const exportServiceLogsToCSV = (
  vehicles: (Vehicle | ServerReportRecord)[],
  datePresetLabel: string = 'All Time',
  kpis?: ReportKPIs
) => {
  const escapeCSV = (val: any): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' }).replace(/-/g, ''); // YYYYMMDD
  const timeParts = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Colombo', hour12: false }).replace(/:/g, ''); // HHMMSS
  const batchRefId = `UML-RPT-${dateStr}-${timeParts}-V${vehicles.length}`;

  const rows: string[] = [];
  // Title & Metadata
  rows.push(`"UNITED MOTORS - VEHICLE SERVICE LOGS REPORT"`);
  rows.push(`"Batch Reference: ${batchRefId}"`);
  rows.push(`"Generated At: ${now.toLocaleString('en-US', { timeZone: 'Asia/Colombo' })}"`);
  rows.push(`"Applied Filters: ${datePresetLabel}"`);
  rows.push(`"Total Records: ${vehicles.length}"`);
  if (kpis) {
    const onHoldTxt = kpis.onHoldCount !== undefined ? `, ${kpis.onHoldCount} On Hold` : '';
    rows.push(`"Summary: ${kpis.completedCount ?? 0} Completed, ${kpis.inProgressCount ?? 0} In Progress, ${kpis.bookingCount ?? 0} Bookings${onHoldTxt}"`);
    rows.push(`"Bay Velocity - Workshop: Bay Gross Avg Stay Time ${formatDuration(kpis.workshopBay?.avgStageSec ?? 0)}, Bay Avg Active Time ${formatDuration(kpis.workshopBay?.avgActiveSec ?? 0)} (${kpis.workshopBay?.vehicleCount ?? 0} vehicles) | Alignment: Bay Gross Avg Stay Time ${formatDuration(kpis.alignmentBay?.avgStageSec ?? 0)}, Bay Avg Active Time ${formatDuration(kpis.alignmentBay?.avgActiveSec ?? 0)} (${kpis.alignmentBay?.vehicleCount ?? 0} vehicles) | Hoist: Bay Gross Avg Stay Time ${formatDuration(kpis.hoistBay?.avgStageSec ?? 0)}, Bay Avg Active Time ${formatDuration(kpis.hoistBay?.avgActiveSec ?? 0)} (${kpis.hoistBay?.vehicleCount ?? 0} vehicles)"`);
  }
  rows.push(''); // Empty line

  // Row 1: Grouped Category Super-Headers
  const topHeaders = [
    'VEHICLE DETAILS',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'OVERALL EFFICIENCY',
    '',
    '',
    '',
    'GENERAL SERVICE',
    '',
    '',
    '',
    'WHEEL ALIGNMENT',
    '',
    '',
    '',
    'HOIST SERVICE',
    '',
    '',
    '',
    'AUDIT DETAILS',
    '',
    '',
    '',
  ];

  // Row 2: Sub-headers (Metric Columns)
  const subHeaders = [
    'Vehicle Reg No',
    'Status',
    'Current Station',
    'Booking',
    'Extra Repairs',
    'Intake Date',
    'Intake Time',
    'Completion Time',
    'Total Stay',
    'Net Active Work',
    'Total Idle Time',
    'Total Shift Breaks',
    // General Service
    'First In',
    'Idle',
    'Active',
    'Breaks',
    // Wheel Alignment
    'First In',
    'Idle',
    'Active',
    'Breaks',
    // Hoist Service
    'First In',
    'Idle',
    'Active',
    'Breaks',
    'Tasks Completed',
    'Mechanic Name',
    'Assigned Lead',
    'Remarks / Notes',
  ];

  rows.push(topHeaders.map(h => `"${h}"`).join(','));
  rows.push(subHeaders.map(h => `"${h}"`).join(','));

  // Data Rows
  vehicles.forEach((v: any) => {
    // Check if record is pre-computed from PostgreSQL get_service_report_data RPC
    const isServerRecord = 'total_idle_sec' in v && 'workshop_idle' in v;

    let vehicleNo = v.vehicle_no;
    let statusLabel = '';
    let stationLabel = '';
    let isBookingStr = v.is_booking ? 'Yes' : 'No';
    let extraRepairsStr = v.has_additional_repairs ? 'Yes' : 'No';
    let intakeDateStr = '--';
    let intakeTimeStr = '--:--';
    let finishedStr = 'Pending';
    let grossSec = 0;
    let totalActiveSec = 0;
    let totalIdleSec = 0;
    let breakSeconds = 0;
    let wsFirstIn: string | null = null;
    let wsIdle = 0, wsActive = 0, wsBreak = 0;
    let alFirstIn: string | null = null;
    let alIdle = 0, alActive = 0, alBreak = 0;
    let hsFirstIn: string | null = null;
    let hsIdle = 0, hsActive = 0, hsBreak = 0;
    let completedTasksStr = '';
    let techName = v.technician_name || '-';
    let assignedLead = v.assigned_tech || 'Unassigned';
    let remarks = v.remarks || '';

    if (isServerRecord) {
      const rec = v as ServerReportRecord;
      statusLabel = (rec.is_paused || rec.status === 'on_hold')
        ? 'ON HOLD'
        : rec.is_effective_done
          ? 'DONE'
          : (rec.current_zone === 'workshop' ? 'GENERAL' : rec.current_zone.toUpperCase());
      stationLabel = rec.is_finished
        ? 'Delivered'
        : (rec.is_paused || rec.status === 'on_hold')
          ? 'On Hold'
          : (rec.is_effective_done ? 'Inspection' : (rec.current_zone === 'workshop' ? 'General' : rec.current_zone.toUpperCase()));
      
      const start = new Date(rec.intake_at || rec.created_at);
      if (!Number.isNaN(start.getTime())) {
        intakeDateStr = start.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Colombo' });
        intakeTimeStr = start.toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: true });
      }

      if (rec.effective_completed_at) {
        const end = new Date(rec.effective_completed_at);
        if (!Number.isNaN(end.getTime())) {
          finishedStr = end.toLocaleString('en-US', { timeZone: 'Asia/Colombo' });
        }
      }

      grossSec = rec.gross_tat_seconds > 0
        ? rec.gross_tat_seconds
        : Math.max(0, Math.floor(((rec.effective_completed_at ? new Date(rec.effective_completed_at).getTime() : Date.now()) - start.getTime()) / 1000));
      totalActiveSec = rec.total_active_sec;
      totalIdleSec = rec.total_idle_sec;
      breakSeconds = rec.total_break_seconds;
      wsFirstIn = rec.workshop_first_in || null;
      wsIdle = rec.workshop_idle;
      wsActive = rec.workshop_active;
      wsBreak = rec.workshop_break;
      alFirstIn = rec.alignment_first_in || null;
      alIdle = rec.alignment_idle;
      alActive = rec.alignment_active;
      alBreak = rec.alignment_break;
      hsFirstIn = rec.hoist_first_in || null;
      hsIdle = rec.hoist_idle;
      hsActive = rec.hoist_active;
      hsBreak = rec.hoist_break;
      let taskSummaryStr = '0/0';
      if (rec.tasks_total_count !== undefined && rec.tasks_total_count > 0) {
        taskSummaryStr = `${rec.tasks_completed_count ?? 0}/${rec.tasks_total_count}`;
      } else if (rec.completed_tasks_str && rec.completed_tasks_str !== 'None') {
        const count = rec.completed_tasks_str.split(';').length;
        taskSummaryStr = `${count}/${count}`;
      }
      completedTasksStr = taskSummaryStr;
      if (rec.is_urgent) {
        remarks = rec.urgent_note ? `[URGENT: ${rec.urgent_note}] ${remarks}` : `[URGENT] ${remarks}`;
      }
    } else {
      const { isEffectiveDone, effectiveCompletionDate } = getVehicleEffectiveCompletion(v);
      const start = new Date(v.intake_at || v.created_at);
      const end = effectiveCompletionDate ? effectiveCompletionDate : new Date();
      grossSec = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
      const totals = getVehicleIdleAndActiveTotals(v);
      totalIdleSec = totals.totalIdleSec;
      totalActiveSec = totals.totalActiveSec;
      const breaks = getBreakOverlap(start, end);
      breakSeconds = breaks.breakSeconds;

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
      completedTasksStr = `${completedTasks}/${totalTasks}`;

      const isHold = Boolean(v.is_paused || v.status === 'on_hold');
      statusLabel = isHold
        ? 'ON HOLD'
        : isEffectiveDone
          ? 'DONE'
          : (v.current_zone === 'workshop' ? 'GENERAL' : v.current_zone.toUpperCase());
      stationLabel = v.is_finished
        ? 'Delivered'
        : isHold
          ? 'On Hold'
          : (isEffectiveDone ? 'Inspection' : (v.current_zone === 'workshop' ? 'General' : v.current_zone.toUpperCase()));
      if (!Number.isNaN(start.getTime())) {
        intakeDateStr = start.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Colombo' });
        intakeTimeStr = start.toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: true });
      }
      finishedStr = effectiveCompletionDate ? effectiveCompletionDate.toLocaleString('en-US', { timeZone: 'Asia/Colombo' }) : 'Pending';
    }

    const row = [
      escapeCSV(vehicleNo),
      escapeCSV(statusLabel),
      escapeCSV(stationLabel),
      escapeCSV(isBookingStr),
      escapeCSV(extraRepairsStr),
      escapeCSV(intakeDateStr),
      escapeCSV(intakeTimeStr),
      escapeCSV(finishedStr),
      escapeCSV(formatDuration(grossSec)),
      escapeCSV(formatDuration(totalActiveSec)),
      escapeCSV(formatDuration(totalIdleSec)),
      escapeCSV(formatDuration(breakSeconds)),
      // General Service (First In | Idle | Active | Breaks)
      escapeCSV(formatFirstInTime(wsFirstIn)),
      escapeCSV(formatDuration(wsIdle)),
      escapeCSV(formatDuration(wsActive)),
      escapeCSV(wsBreak > 0 ? formatDuration(wsBreak) : '-'),
      // Wheel Alignment (First In | Idle | Active | Breaks)
      escapeCSV(formatFirstInTime(alFirstIn)),
      escapeCSV(formatDuration(alIdle)),
      escapeCSV(formatDuration(alActive)),
      escapeCSV(alBreak > 0 ? formatDuration(alBreak) : '-'),
      // Hoist Service (First In | Idle | Active | Breaks)
      escapeCSV(formatFirstInTime(hsFirstIn)),
      escapeCSV(formatDuration(hsIdle)),
      escapeCSV(formatDuration(hsActive)),
      escapeCSV(hsBreak > 0 ? formatDuration(hsBreak) : '-'),
      // Audit Details
      escapeCSV(completedTasksStr || 'None'),
      escapeCSV(techName),
      escapeCSV(assignedLead),
      escapeCSV(remarks),
    ];

    rows.push(row.join(','));
  });

  // Calculation & Audit Policy Footnote
  rows.push('');
  rows.push(`"--- AUDIT & CALCULATION POLICY ---"`);
  rows.push(`"1. Bay Gross Avg Stay Time: Reflects actual operational bay occupancy (Active Labor + Idle Time) strictly for vehicles completed and dispatched to the next station. Undispatched stages are excluded to protect average accuracy. Official shift breaks (lunch & tea) are deducted."`);
  rows.push(`"2. Bay Avg Active Time: Pure technician hands-on labor duration for completed & dispatched stages."`);

  const csvContent = '\uFEFF' + rows.join('\r\n'); // Add UTF-8 BOM for Microsoft Excel

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `UnitedMotors_ServiceReport_${datePresetLabel.replace(/\s+/g, '_')}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};

export const REPORT_THEME_COLORS = {
  primary: '#0284c7',
  primaryLight: '#0369a1',
  primaryBg: '#e0f2fe',
  success: '#15803d',
  successBg: '#dcfce7',
  warning: '#f59e0b',
  warningLight: '#b45309',
  warningBg: '#fef3c7',
  warningAccent: '#fbbf24',
  danger: '#b91c1c',
  dangerBg: '#fee2e2',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#64748b',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  cardBg: '#f8fafc',
  alignmentBg: '#ecfdf5',
  alignmentColor: '#047857',
} as const;

/**
 * Generates an executive PDF report with Two-Tier Grouped Headers and printable styles.
 */
export const exportServiceLogsToPDF = (
  vehicles: (Vehicle | ServerReportRecord)[],
  kpis: ReportKPIs,
  datePresetLabel: string = 'All Time'
) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' }).replace(/-/g, ''); // YYYYMMDD
  const timeParts = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Colombo', hour12: false }).replace(/:/g, ''); // HHMMSS
  const batchRefId = `UML-RPT-${dateStr}-${timeParts}-V${vehicles.length}`;

  const tableRowsHtml = vehicles.map((v: any, i) => {
    const isServerRecord = 'total_idle_sec' in v && 'workshop_idle' in v;

    let vehicleNo = v.vehicle_no;
    let isEffectiveDone = false;
    let statusLabel = '';
    let statusBg: string = REPORT_THEME_COLORS.primaryBg;
    let statusColor: string = REPORT_THEME_COLORS.primaryLight;
    let intakeDateStr = '--';
    let intakeTimeStr = '--:--';
    let finishedStr = 'In Progress';
    let grossSec = 0;
    let totalActiveSec = 0;
    let totalIdleSec = 0;
    let breakSeconds = 0;
    let wsFirstIn: string | null = null;
    let wsIdle = 0, wsActive = 0, wsBreak = 0;
    let alFirstIn: string | null = null;
    let alIdle = 0, alActive = 0, alBreak = 0;
    let hsFirstIn: string | null = null;
    let hsIdle = 0, hsActive = 0, hsBreak = 0;
    let taskProgressStr = '';
    let techName = v.technician_name || null;
    let remarks = v.remarks ? String(v.remarks).trim() : '';
    let isUrgent = false;
    let urgentNote: string | null = null;

    if (isServerRecord) {
      const rec = v as ServerReportRecord;
      const isHold = Boolean(rec.is_paused || rec.status === 'on_hold');
      statusLabel = isHold ? 'ON HOLD' : isEffectiveDone ? 'DONE' : (rec.current_zone === 'workshop' ? 'GENERAL' : rec.current_zone.toUpperCase());
      statusBg = isHold
        ? REPORT_THEME_COLORS.warningBg
        : isEffectiveDone
        ? REPORT_THEME_COLORS.successBg
        : rec.current_zone === 'workshop'
        ? REPORT_THEME_COLORS.primaryBg
        : rec.current_zone === 'alignment'
        ? REPORT_THEME_COLORS.alignmentBg
        : REPORT_THEME_COLORS.warningBg;
      statusColor = isHold
        ? REPORT_THEME_COLORS.warningLight
        : isEffectiveDone
        ? REPORT_THEME_COLORS.success
        : rec.current_zone === 'workshop'
        ? REPORT_THEME_COLORS.primaryLight
        : rec.current_zone === 'alignment'
        ? REPORT_THEME_COLORS.alignmentColor
        : REPORT_THEME_COLORS.warningLight;

      const start = new Date(rec.intake_at || rec.created_at);
      if (!Number.isNaN(start.getTime())) {
        intakeDateStr = start.toLocaleDateString('en-US', { day: '2-digit', month: 'short', timeZone: 'Asia/Colombo' });
        intakeTimeStr = start.toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: true });
      }

      if (rec.effective_completed_at) {
        const end = new Date(rec.effective_completed_at);
        if (!Number.isNaN(end.getTime())) {
          finishedStr = end.toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: true });
        }
      }

      grossSec = rec.gross_tat_seconds > 0
        ? rec.gross_tat_seconds
        : Math.max(0, Math.floor(((rec.effective_completed_at ? new Date(rec.effective_completed_at).getTime() : Date.now()) - start.getTime()) / 1000));
      totalActiveSec = rec.total_active_sec;
      totalIdleSec = rec.total_idle_sec;
      breakSeconds = rec.total_break_seconds;
      wsFirstIn = rec.workshop_first_in || null;
      wsIdle = rec.workshop_idle;
      wsActive = rec.workshop_active;
      wsBreak = rec.workshop_break;
      alFirstIn = rec.alignment_first_in || null;
      alIdle = rec.alignment_idle;
      alActive = rec.alignment_active;
      alBreak = rec.alignment_break;
      hsFirstIn = rec.hoist_first_in || null;
      hsIdle = rec.hoist_idle;
      hsActive = rec.hoist_active;
      hsBreak = rec.hoist_break;
      if (rec.tasks_total_count !== undefined && rec.tasks_total_count > 0) {
        taskProgressStr = `${rec.tasks_completed_count ?? 0}/${rec.tasks_total_count}`;
      } else if (rec.completed_tasks_str && rec.completed_tasks_str !== 'None') {
        const count = rec.completed_tasks_str.split(';').length;
        taskProgressStr = `${count}/${count}`;
      } else {
        taskProgressStr = '0/0';
      }
    } else {
      const eff = getVehicleEffectiveCompletion(v);
      isEffectiveDone = eff.isEffectiveDone;
      const start = new Date(v.intake_at || v.created_at);
      const end = eff.effectiveCompletionDate ? eff.effectiveCompletionDate : new Date();
      grossSec = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
      const totals = getVehicleIdleAndActiveTotals(v);
      totalIdleSec = totals.totalIdleSec;
      totalActiveSec = totals.totalActiveSec;
      const breaks = getBreakOverlap(start, end);
      breakSeconds = breaks.breakSeconds;

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

      const completedTasksCount = (v.tasks || []).filter((t: any) => t.is_completed).length;
      const totalTasksCount = (v.tasks || []).filter((t: any) => t.is_required).length;
      taskProgressStr = `${completedTasksCount}/${totalTasksCount}`;

      const isHold = Boolean(v.is_paused || v.status === 'on_hold');
      statusLabel = isHold ? 'ON HOLD' : isEffectiveDone ? 'DONE' : (v.current_zone === 'workshop' ? 'GENERAL' : v.current_zone.toUpperCase());
      statusBg = isHold
        ? REPORT_THEME_COLORS.warningBg
        : isEffectiveDone
        ? REPORT_THEME_COLORS.successBg
        : v.current_zone === 'workshop'
        ? REPORT_THEME_COLORS.primaryBg
        : v.current_zone === 'alignment'
        ? REPORT_THEME_COLORS.alignmentBg
        : REPORT_THEME_COLORS.warningBg;
      statusColor = isHold
        ? REPORT_THEME_COLORS.warningLight
        : isEffectiveDone
        ? REPORT_THEME_COLORS.success
        : v.current_zone === 'workshop'
        ? REPORT_THEME_COLORS.primaryLight
        : v.current_zone === 'alignment'
        ? REPORT_THEME_COLORS.alignmentColor
        : REPORT_THEME_COLORS.warningLight;

      if (!Number.isNaN(start.getTime())) {
        intakeDateStr = start.toLocaleDateString('en-US', { day: '2-digit', month: 'short', timeZone: 'Asia/Colombo' });
        intakeTimeStr = start.toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: true });
      }
      finishedStr = isEffectiveDone && eff.effectiveCompletionDate ? eff.effectiveCompletionDate.toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: true }) : 'In Progress';
    }

    const bookingBadge = v.is_booking
      ? `<span style="display: inline-block; padding: 1px 5px; border-radius: 4px; font-size: 8px; font-weight: 800; background: #e0f2fe; color: #0369a1; margin-top: 2px;">BOOKING</span>`
      : '';
    const extraRepairsBadge = v.has_additional_repairs
      ? `<span style="display: inline-block; padding: 1px 5px; border-radius: 4px; font-size: 8px; font-weight: 800; background: #fef3c7; color: #b45309; margin-top: 2px; margin-left: 2px;">EXTRA</span>`
      : '';

    return `
      <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
        <td style="padding: 8px 10px; font-weight: 700; font-family: monospace; font-size: 13px; color: #0f172a; border-bottom: 1px solid #e2e8f0;">
          <div>${vehicleNo}</div>
          <div>${bookingBadge}${extraRepairsBadge}</div>
          ${techName ? `<div style="font-size: 9px; color: #0284c7; font-weight: 600; margin-top: 2px;">🔧 ${techName}</div>` : ''}
        </td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 800; background: ${statusBg}; color: ${statusColor};">
            ${statusLabel}
          </span>
        </td>
        <td style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #475569; border-bottom: 1px solid #e2e8f0;">
          ${intakeDateStr}
        </td>
        <td style="padding: 8px 8px; font-size: 11px; font-weight: 700; color: #475569; border-bottom: 1px solid #e2e8f0;">
          ${intakeTimeStr}
        </td>
        <td style="padding: 8px 10px; font-size: 11px; font-weight: 700; color: ${isEffectiveDone ? '#16a34a' : '#d97706'}; border-bottom: 1px solid #e2e8f0;">
          ${finishedStr}
        </td>
        <td style="padding: 8px 10px; font-weight: 700; font-size: 11px; color: #0284c7; border-bottom: 1px solid #e2e8f0;">
          ${formatDuration(grossSec)}
        </td>
        <td style="padding: 8px 10px; font-weight: 700; font-size: 11px; color: #0284c7; border-bottom: 1px solid #e2e8f0;">
          ${formatDuration(totalActiveSec)}
        </td>
        <td style="padding: 8px 10px; font-weight: 700; font-size: 11px; color: #f59e0b; border-bottom: 1px solid #e2e8f0;">
          ${formatDuration(totalIdleSec)}
        </td>
        <td style="padding: 8px 10px; font-size: 11px; color: #fbbf24; font-weight: 700; border-bottom: 1px solid #e2e8f0;">
          ${breakSeconds > 0 ? formatDuration(breakSeconds) : '-'}
        </td>
        <!-- General Workshop -->
        <td style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #38bdf8; text-align: center; border-bottom: 1px solid #e2e8f0;">
          ${formatFirstInTime(wsFirstIn)}
        </td>
        <td style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #f59e0b; text-align: center; border-bottom: 1px solid #e2e8f0;">
          ${wsIdle > 0 ? formatDuration(wsIdle) : '-'}
        </td>
        <td style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #0284c7; text-align: center; border-bottom: 1px solid #e2e8f0;">
          ${wsActive > 0 ? formatDuration(wsActive) : '-'}
        </td>
        <td style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #fbbf24; text-align: center; border-bottom: 1px solid #e2e8f0;">
          ${wsBreak > 0 ? formatDuration(wsBreak) : '-'}
        </td>
        <!-- Wheel Alignment -->
        <td style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #34d399; text-align: center; border-bottom: 1px solid #e2e8f0;">
          ${formatFirstInTime(alFirstIn)}
        </td>
        <td style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #f59e0b; text-align: center; border-bottom: 1px solid #e2e8f0;">
          ${alIdle > 0 ? formatDuration(alIdle) : '-'}
        </td>
        <td style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #0284c7; text-align: center; border-bottom: 1px solid #e2e8f0;">
          ${alActive > 0 ? formatDuration(alActive) : '-'}
        </td>
        <td style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #fbbf24; text-align: center; border-bottom: 1px solid #e2e8f0;">
          ${alBreak > 0 ? formatDuration(alBreak) : '-'}
        </td>
        <!-- Hoist Service -->
        <td style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #fbbf24; text-align: center; border-bottom: 1px solid #e2e8f0;">
          ${formatFirstInTime(hsFirstIn)}
        </td>
        <td style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #f59e0b; text-align: center; border-bottom: 1px solid #e2e8f0;">
          ${hsIdle > 0 ? formatDuration(hsIdle) : '-'}
        </td>
        <td style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #0284c7; text-align: center; border-bottom: 1px solid #e2e8f0;">
          ${hsActive > 0 ? formatDuration(hsActive) : '-'}
        </td>
        <td style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #fbbf24; text-align: center; border-bottom: 1px solid #e2e8f0;">
          ${hsBreak > 0 ? formatDuration(hsBreak) : '-'}
        </td>
        <td style="padding: 8px 10px; font-size: 11px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0;">
          ${taskProgressStr}
        </td>
        <td style="padding: 8px 10px; font-size: 11px; color: #475569; border-bottom: 1px solid #e2e8f0;">
          ${isUrgent ? `<span style="display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 800; background: #fee2e2; color: #b91c1c; margin-right: 4px;">URGENT${urgentNote ? `: ${urgentNote}` : ''}</span>` : ''}
          <span>${remarks || '-'}</span>
        </td>
      </tr>
    `;
  }).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>United Motors - Service Logs Report</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 10px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 16px; }
          .brand-title { font-size: 22px; font-weight: 900; letter-spacing: 1px; color: #0284c7; margin: 0; }
          .brand-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
          .meta-box { text-align: right; font-size: 11px; color: #64748b; }
          .meta-highlight { font-weight: 700; color: #0f172a; }
          .batch-badge { display: inline-block; font-family: monospace; font-size: 10px; font-weight: 700; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; margin-top: 3px; letter-spacing: 0.5px; }
          .kpi-row { display: flex; gap: 12px; margin-bottom: 18px; }
          .kpi-card { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
          .kpi-label { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; }
          .kpi-val { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 4px; }
          .table-container { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 10px; }
          .table-container thead { display: table-header-group; }
          .table-container tr { page-break-inside: avoid; break-inside: avoid; }
          .table-container td { font-weight: 700; }
          .th-top { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
          .th-sub { font-size: 8.5px; font-weight: 700; text-transform: uppercase; }
          .report-closing-block { page-break-inside: avoid; break-inside: avoid; margin-top: 28px; }
          .footer-sign { display: flex; justify-content: flex-end; padding-top: 10px; font-size: 11px; color: #64748b; }
          .sign-line { width: 220px; border-top: 1px dashed #94a3b8; margin-top: 35px; text-align: center; padding-top: 6px; font-weight: 600; }
          .policy-footnote { margin-top: 20px; padding-top: 8px; border-top: 1px solid #f1f5f9; font-size: 8px; color: #94a3b8; line-height: 1.4; display: flex; justify-content: space-between; align-items: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="brand-title">UNITED MOTORS LANKA PLC</h1>
            <div class="brand-sub">Workshop Service & Telemetry Audit Log Report</div>
          </div>
          <div class="meta-box">
            <div>Batch Ref: <span class="batch-badge">${batchRefId}</span></div>
            <div style="margin-top: 3px;">Report Filter: <span class="meta-highlight">${datePresetLabel}</span></div>
            <div>Generated: <span class="meta-highlight">${new Date().toLocaleString()}</span></div>
            <div>Total Vehicles: <span class="meta-highlight">${vehicles.length}</span></div>
          </div>
        </div>

        <div class="kpi-row">
          <div class="kpi-card">
            <div class="kpi-label" style="color: #0284c7;">Status & Bookings</div>
            <div style="margin-top: 4px;">
              <div style="font-size: 14px; font-weight: 900; color: #0284c7;">${kpis.inProgressCount} <span style="font-size: 9px; font-weight: 700; color: #64748b;">ACTIVE</span></div>
            </div>
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-size: 12px; font-weight: 800; color: #16a34a;">${kpis.completedCount}</div>
                <div style="font-size: 8px; font-weight: 700; color: #64748b; letter-spacing: 0.3px;">COMPLETED</div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 12px; font-weight: 800; color: #0284c7;">${kpis.bookingCount ?? 0}</div>
                <div style="font-size: 8px; font-weight: 700; color: #64748b; letter-spacing: 0.3px;">BOOKINGS</div>
              </div>
            </div>
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #e2e8f0; font-size: 8.5px; font-weight: 700; color: #64748b; text-align: center;">
              ${kpis.totalVehicles ?? 0} total vehicles${(kpis.onHoldCount ?? 0) > 0 ? ` · ${kpis.onHoldCount} on hold` : ''}
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label" style="color: #0284c7;">Workshop</div>
            <div style="margin-top: 4px;">
              <div style="font-size: 14px; font-weight: 900; color: #0284c7;">${formatDuration(kpis.workshopBay?.avgStageSec ?? 0)}</div>
              <div style="font-size: 8px; font-weight: 700; color: #64748b; letter-spacing: 0.3px;">BAY GROSS AVG STAY TIME</div>
            </div>
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #e2e8f0;">
              <div style="font-size: 12px; font-weight: 800; color: #0284c7;">${formatDuration(kpis.workshopBay?.avgActiveSec ?? 0)}</div>
              <div style="font-size: 8px; font-weight: 700; color: #64748b; letter-spacing: 0.3px;">BAY AVG ACTIVE TIME</div>
            </div>
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #e2e8f0; font-size: 8.5px; font-weight: 700; color: #64748b; text-align: center;">
              ${kpis.workshopBay?.vehicleCount ?? 0} vehicles
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label" style="color: #16a34a;">Alignment</div>
            <div style="margin-top: 4px;">
              <div style="font-size: 14px; font-weight: 900; color: #16a34a;">${formatDuration(kpis.alignmentBay?.avgStageSec ?? 0)}</div>
              <div style="font-size: 8px; font-weight: 700; color: #64748b; letter-spacing: 0.3px;">BAY GROSS AVG STAY TIME</div>
            </div>
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #e2e8f0;">
              <div style="font-size: 12px; font-weight: 800; color: #0284c7;">${formatDuration(kpis.alignmentBay?.avgActiveSec ?? 0)}</div>
              <div style="font-size: 8px; font-weight: 700; color: #64748b; letter-spacing: 0.3px;">BAY AVG ACTIVE TIME</div>
            </div>
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #e2e8f0; font-size: 8.5px; font-weight: 700; color: #64748b; text-align: center;">
              ${kpis.alignmentBay?.vehicleCount ?? 0} vehicles
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label" style="color: #d97706;">Hoist</div>
            <div style="margin-top: 4px;">
              <div style="font-size: 14px; font-weight: 900; color: #d97706;">${formatDuration(kpis.hoistBay?.avgStageSec ?? 0)}</div>
              <div style="font-size: 8px; font-weight: 700; color: #64748b; letter-spacing: 0.3px;">BAY GROSS AVG STAY TIME</div>
            </div>
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #e2e8f0;">
              <div style="font-size: 12px; font-weight: 800; color: #0284c7;">${formatDuration(kpis.hoistBay?.avgActiveSec ?? 0)}</div>
              <div style="font-size: 8px; font-weight: 700; color: #64748b; letter-spacing: 0.3px;">BAY AVG ACTIVE TIME</div>
            </div>
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #e2e8f0; font-size: 8.5px; font-weight: 700; color: #64748b; text-align: center;">
              ${kpis.hoistBay?.vehicleCount ?? 0} vehicles
            </div>
          </div>
        </div>

        <table class="table-container">
          <thead>
            <tr style="background: #0f172a; color: #ffffff;">
              <th rowspan="2" style="padding: 8px 6px; text-align: left; border-right: 1px solid #334155;">Vehicle No</th>
              <th rowspan="2" style="padding: 8px 6px; text-align: left; border-right: 1px solid #334155;">Status</th>
              <th rowspan="2" style="padding: 8px 6px; text-align: left; border-right: 1px solid #334155;">Date</th>
              <th rowspan="2" style="padding: 8px 6px; text-align: left; border-right: 1px solid #334155;">Intake</th>
              <th rowspan="2" style="padding: 8px 6px; text-align: left; border-right: 1px solid #334155;">Finished</th>
              <th rowspan="2" style="padding: 8px 6px; text-align: left; border-right: 1px solid #334155;">Total Stay</th>
              <th rowspan="2" style="padding: 8px 6px; text-align: left; border-right: 1px solid #334155;">Net Active</th>
              <th rowspan="2" style="padding: 8px 6px; text-align: left; border-right: 1px solid #334155;">Total Idle</th>
              <th rowspan="2" style="padding: 8px 6px; text-align: left; border-right: 1px solid #334155;">Breaks</th>
              <th colspan="4" style="padding: 6px; text-align: center; background: #0369a1; border-right: 1px solid #334155;">GENERAL SERVICE</th>
              <th colspan="4" style="padding: 6px; text-align: center; background: #047857; border-right: 1px solid #334155;">WHEEL ALIGNMENT</th>
              <th colspan="4" style="padding: 6px; text-align: center; background: #b45309; border-right: 1px solid #334155;">HOIST SERVICE</th>
              <th rowspan="2" style="padding: 8px 6px; text-align: left; border-right: 1px solid #334155;">Tasks</th>
              <th rowspan="2" style="padding: 8px 6px; text-align: left;">Remarks / Priority</th>
            </tr>
            <tr style="background: #1e293b; color: #94a3b8;">
              <!-- General Service -->
              <th style="padding: 4px; text-align: center; font-size: 8.5px; color: #38bdf8; border-right: 1px solid #334155;">First In</th>
              <th style="padding: 4px; text-align: center; font-size: 8.5px; color: #f59e0b; border-right: 1px solid #334155;">Idle</th>
              <th style="padding: 4px; text-align: center; font-size: 8.5px; color: #0284c7; border-right: 1px solid #334155;">Active</th>
              <th style="padding: 4px; text-align: center; font-size: 8.5px; color: #fbbf24; border-right: 1px solid #334155;">Breaks</th>
              <!-- Wheel Alignment -->
              <th style="padding: 4px; text-align: center; font-size: 8.5px; color: #34d399; border-right: 1px solid #334155;">First In</th>
              <th style="padding: 4px; text-align: center; font-size: 8.5px; color: #f59e0b; border-right: 1px solid #334155;">Idle</th>
              <th style="padding: 4px; text-align: center; font-size: 8.5px; color: #0284c7; border-right: 1px solid #334155;">Active</th>
              <th style="padding: 4px; text-align: center; font-size: 8.5px; color: #fbbf24; border-right: 1px solid #334155;">Breaks</th>
              <!-- Hoist Service -->
              <th style="padding: 4px; text-align: center; font-size: 8.5px; color: #fbbf24; border-right: 1px solid #334155;">First In</th>
              <th style="padding: 4px; text-align: center; font-size: 8.5px; color: #f59e0b; border-right: 1px solid #334155;">Idle</th>
              <th style="padding: 4px; text-align: center; font-size: 8.5px; color: #0284c7; border-right: 1px solid #334155;">Active</th>
              <th style="padding: 4px; text-align: center; font-size: 8.5px; color: #fbbf24; border-right: 1px solid #334155;">Breaks</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>

        <!-- Final Page Report Closing Block (Sign-off & Footnote) -->
        <div class="report-closing-block">
          <div class="footer-sign">
            <div>
              <div class="sign-line">Assistant General Manager</div>
            </div>
          </div>

          <!-- Document Footnote & Batch Identifier -->
          <div class="policy-footnote">
            <div style="flex: 1; padding-right: 20px;">
              <span style="font-weight: 700; color: #64748b;">Policy Footnote:</span> Bay Gross Stay Time measures completed & dispatched bay occupancy minus scheduled shift breaks (tea & lunch). Pure hands-on labor duration is recorded under Net Active Time. Jobs flagged with Additional Repairs or placed On Hold for major repairs are strictly excluded from standard bay speed benchmarks.
            </div>
            <div style="font-family: monospace; font-size: 8.5px; font-weight: 700; color: #64748b; white-space: nowrap;">
              Ref: ${batchRefId} · End of Report
            </div>
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }
};
