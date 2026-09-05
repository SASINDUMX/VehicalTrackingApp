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
  workshopBay: BayKPI;
  alignmentBay: BayKPI;
  hoistBay: BayKPI;
  // Legacy aliases if needed
  totalBreakSeconds: number;
}

export type DateFilterPreset = 'today' | 'yesterday' | '7days' | 'month' | 'all';
export type StatusFilterPreset = 'all' | 'completed' | 'in_progress';

export const formatDuration = (totalSeconds: number): string => {
  if (isNaN(totalSeconds) || totalSeconds <= 0) return '0m 00s';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes < 10 ? '0' : ''}${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`;
  }
  return `${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`;
};

/**
 * Helper to determine if a vehicle is effectively finished/ready:
 * - Either explicitly marked is_finished = true
 * - Or has arrived in the 'inspection' zone (all workshop bay tasks completed)
 *
 * Returns the effective completion date (either v.completed_at or the moment it entered the inspection zone).
 */
export const getVehicleEffectiveCompletion = (v: Vehicle): { isEffectiveDone: boolean; effectiveCompletionDate: Date | null } => {
  if (v.is_finished && v.completed_at) {
    const d = new Date(v.completed_at);
    if (!isNaN(d.getTime())) {
      return { isEffectiveDone: true, effectiveCompletionDate: d };
    }
  }

  // If vehicle is in inspection or has an inspection log
  if (v.current_zone === 'inspection') {
    const inspLog = v.stage_logs.find(l => l.to_zone === 'inspection');
    if (inspLog?.entered_at) {
      const d = new Date(inspLog.entered_at);
      if (!isNaN(d.getTime())) {
        return { isEffectiveDone: true, effectiveCompletionDate: d };
      }
    }
    // Fallback if no log found but current_zone is inspection
    return { isEffectiveDone: true, effectiveCompletionDate: new Date() };
  }

  return { isEffectiveDone: false, effectiveCompletionDate: null };
};

export const filterVehiclesForReport = (
  vehicles: Vehicle[],
  datePreset: DateFilterPreset = 'all',
  statusPreset: StatusFilterPreset = 'all'
): Vehicle[] => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  const startOf7Days = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  return vehicles.filter(v => {
    // 1. Date Filter
    const intakeDate = new Date(v.intake_at || v.created_at);
    if (isNaN(intakeDate.getTime())) return true;

    if (datePreset === 'today' && intakeDate < startOfToday) return false;
    if (datePreset === 'yesterday' && (intakeDate < startOfYesterday || intakeDate >= startOfToday)) return false;
    if (datePreset === '7days' && intakeDate < startOf7Days) return false;
    if (datePreset === 'month' && intakeDate < startOfMonth) return false;

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
  vehicles?: Vehicle[]
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

    case 'all': {
      if (vehicles && vehicles.length > 0) {
        const timestamps = vehicles
          .map(v => new Date(v.intake_at || v.created_at).getTime())
          .filter(t => !isNaN(t));
        if (timestamps.length > 0) {
          const earliest = new Date(Math.min(...timestamps));
          return {
            label: 'All Time',
            rangeStr: `${formatShortDate(earliest)} – ${todayStr}`,
            isMultiDate: true,
          };
        }
      }
      return { label: 'All Time', rangeStr: `Up to ${todayStr}`, isMultiDate: true };
    }

    default:
      return { label: 'All Time', rangeStr: todayStr, isMultiDate: false };
  }
};

export const getVehicleTotalPausedSeconds = (v: Vehicle): number => {
  let total = 0;
  v.stage_logs.forEach(l => {
    if (l.paused_seconds && l.paused_seconds > 0) {
      total += l.paused_seconds;
    }
  });

  if (v.is_paused && v.paused_at) {
    const pausedAtMs = new Date(v.paused_at).getTime();
    if (!isNaN(pausedAtMs)) {
      total += Math.max(0, Math.floor((Date.now() - pausedAtMs) / 1000));
    }
  }

  return total;
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
      workshopBay: emptyBayKPI('workshop', 'General Service'),
      alignmentBay: emptyBayKPI('alignment', 'Wheel Alignment'),
      hoistBay: emptyBayKPI('hoist', 'Hoist Service'),
      totalBreakSeconds: 0,
    };
  }

  let totalBreaks = 0;
  let completed = 0;

  // Bay telemetry accumulators
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

    const start = new Date(v.intake_at || v.created_at);
    const end = effectiveCompletionDate ? effectiveCompletionDate : new Date();
    const { breakSeconds } = getBreakOverlap(start, end);
    totalBreaks += breakSeconds;

    // Workshop Bay (Only count officially dispatched stages)
    const workshopTiming = getStageTimingForZone(v, 'workshop');
    if (workshopTiming.isDispatched) {
      workshopVehicles++;
      workshopActive += workshopTiming.activeSec;
      workshopIdle += workshopTiming.idleSec;
      workshopStage += workshopTiming.totalSec;
    }

    // Alignment Bay (Only count officially dispatched stages)
    const alignmentTiming = getStageTimingForZone(v, 'alignment');
    if (alignmentTiming.isDispatched) {
      alignmentVehicles++;
      alignmentActive += alignmentTiming.activeSec;
      alignmentIdle += alignmentTiming.idleSec;
      alignmentStage += alignmentTiming.totalSec;
    }

    // Hoist Bay (Only count officially dispatched stages)
    const hoistTiming = getStageTimingForZone(v, 'hoist');
    if (hoistTiming.isDispatched) {
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
  const logs = v.stage_logs.filter(l => l.to_zone === zone);
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
  queueInSec: number;
  activeSec: number;
  queueOutSec: number;
  idleSec: number;
  breakSec: number;
  totalSec: number;
  isDispatched: boolean;
}

export const getStageTimingForZone = (v: Vehicle, zone: BayZone): BayTelemetry => {
  const logs = v.stage_logs.filter(l => l.to_zone === zone);
  let queueInSec = 0;
  let activeSec = 0;
  let queueOutSec = 0;
  let idleSec = 0;
  let breakSec = 0;
  let totalSec = 0;
  let isDispatched = false;

  // Find task corresponding to this zone to get work_completed_at
  const bayTaskType = getTaskTypeForBay(zone);
  const currentTask = v.tasks.find(t => t.task_type === bayTaskType && t.is_required) || v.tasks.find(t => t.task_type === bayTaskType);
  const workCompletedAt = currentTask?.is_completed ? currentTask.completed_at : null;

  logs.forEach(l => {
    // Stage is considered officially dispatched if exited_at is recorded or vehicle moved to a subsequent zone
    if (l.exited_at || v.current_zone !== zone || v.is_finished) {
      isDispatched = true;
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

  return { queueInSec, activeSec, queueOutSec, idleSec, breakSec, totalSec, isDispatched };
};

export const getVehicleIdleAndActiveTotals = (v: Vehicle): { totalIdleSec: number; totalActiveSec: number } => {
  let totalIdleSec = 0;
  let totalActiveSec = 0;

  v.stage_logs.forEach(l => {
    const bayTaskType = getTaskTypeForBay(l.to_zone);
    const currentTask = v.tasks.find(t => t.task_type === bayTaskType && t.is_required) || v.tasks.find(t => t.task_type === bayTaskType);
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
  vehicles: Vehicle[],
  datePresetLabel: string = 'All Time',
  kpis?: ReportKPIs
) => {
  const escapeCSV = (val: any): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows: string[] = [];
  // Title & Metadata
  rows.push(`"UNITED MOTORS - VEHICLE SERVICE LOGS REPORT"`);
  rows.push(`"Generated At: ${new Date().toLocaleString()}"`);
  rows.push(`"Applied Filters: ${datePresetLabel}"`);
  rows.push(`"Total Records: ${vehicles.length}"`);
  if (kpis) {
    rows.push(`"Summary: ${kpis.completedCount} Completed, ${kpis.inProgressCount} In Progress"`);
    rows.push(`"Bay Velocity - Workshop: Gross Avg Time ${formatDuration(kpis.workshopBay.avgStageSec)}, Bay Avg Active Time ${formatDuration(kpis.workshopBay.avgActiveSec)} (${kpis.workshopBay.vehicleCount} vehicles) | Alignment: Gross Avg Time ${formatDuration(kpis.alignmentBay.avgStageSec)}, Bay Avg Active Time ${formatDuration(kpis.alignmentBay.avgActiveSec)} (${kpis.alignmentBay.vehicleCount} vehicles) | Hoist: Gross Avg Time ${formatDuration(kpis.hoistBay.avgStageSec)}, Bay Avg Active Time ${formatDuration(kpis.hoistBay.avgActiveSec)} (${kpis.hoistBay.vehicleCount} vehicles)"`);
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
    'OVERALL EFFICIENCY',
    '',
    '',
    '',
    'GENERAL SERVICE',
    '',
    '',
    'WHEEL ALIGNMENT',
    '',
    '',
    'HOIST SERVICE',
    '',
    '',
    'AUDIT DETAILS',
    '',
    '',
  ];

  // Row 2: Sub-headers (Metric Columns)
  const subHeaders = [
    'Vehicle Reg No',
    'Status',
    'Current Station',
    'Intake Date',
    'Intake Time',
    'Completion Time',
    'Gross TAT',
    'Net Active Work',
    'Total Idle Time',
    'Total Shift Breaks',
    // General Service
    'Idle',
    'Active',
    'Breaks',
    // Wheel Alignment
    'Idle',
    'Active',
    'Breaks',
    // Hoist Service
    'Idle',
    'Active',
    'Breaks',
    'Tasks Completed',
    'Technician / Lead',
    'Remarks / Notes',
  ];

  rows.push(topHeaders.map(h => `"${h}"`).join(','));
  rows.push(subHeaders.map(h => `"${h}"`).join(','));

  // Data Rows
  vehicles.forEach(v => {
    const { isEffectiveDone, effectiveCompletionDate } = getVehicleEffectiveCompletion(v);
    const start = new Date(v.intake_at || v.created_at);
    const end = effectiveCompletionDate ? effectiveCompletionDate : new Date();
    const grossSec = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
    const totalPausedSec = getVehicleTotalPausedSeconds(v);
    const rawNetSec = getNetWorkingSeconds(start, end);
    const netSec = Math.max(0, rawNetSec - totalPausedSec);
    const { breakSeconds } = getBreakOverlap(start, end);

    const workshopTiming = getStageTimingForZone(v, 'workshop');
    const alignmentTiming = getStageTimingForZone(v, 'alignment');
    const hoistTiming = getStageTimingForZone(v, 'hoist');
    const { totalIdleSec, totalActiveSec } = getVehicleIdleAndActiveTotals(v);

    const completedTasksStr = v.tasks
      .filter(t => t.is_completed)
      .map(t => `${t.task_name} (by ${t.completed_by || 'Tech'})`)
      .join('; ');

    const statusLabel = isEffectiveDone ? 'DONE' : (v.current_zone === 'workshop' ? 'GENERAL' : v.current_zone.toUpperCase());
    const intakeDateStr = !isNaN(start.getTime())
      ? start.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Colombo' })
      : '--';
    const intakeTimeStr = !isNaN(start.getTime())
      ? start.toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: true })
      : '--:--';

    const row = [
      escapeCSV(v.vehicle_no),
      escapeCSV(statusLabel),
      escapeCSV(v.is_finished ? 'Delivered' : (isEffectiveDone ? 'Inspection' : (v.current_zone === 'workshop' ? 'General' : v.current_zone.toUpperCase()))),
      escapeCSV(intakeDateStr),
      escapeCSV(intakeTimeStr),
      escapeCSV(effectiveCompletionDate ? effectiveCompletionDate.toLocaleString('en-US', { timeZone: 'Asia/Colombo' }) : 'Pending'),
      escapeCSV(formatDuration(grossSec)),
      escapeCSV(formatDuration(totalActiveSec > 0 ? totalActiveSec : netSec)),
      escapeCSV(formatDuration(totalIdleSec)),
      escapeCSV(formatDuration(breakSeconds)),
      // General Service (Idle | Active | Breaks)
      escapeCSV(formatDuration(workshopTiming.idleSec)),
      escapeCSV(formatDuration(workshopTiming.activeSec)),
      escapeCSV(workshopTiming.breakSec > 0 ? formatDuration(workshopTiming.breakSec) : '-'),
      // Wheel Alignment (Idle | Active | Breaks)
      escapeCSV(formatDuration(alignmentTiming.idleSec)),
      escapeCSV(formatDuration(alignmentTiming.activeSec)),
      escapeCSV(alignmentTiming.breakSec > 0 ? formatDuration(alignmentTiming.breakSec) : '-'),
      // Hoist Service (Idle | Active | Breaks)
      escapeCSV(formatDuration(hoistTiming.idleSec)),
      escapeCSV(formatDuration(hoistTiming.activeSec)),
      escapeCSV(hoistTiming.breakSec > 0 ? formatDuration(hoistTiming.breakSec) : '-'),
      // Audit Details
      escapeCSV(completedTasksStr || 'None'),
      escapeCSV(v.assigned_tech || 'Unassigned'),
      escapeCSV(v.remarks || ''),
    ];

    rows.push(row.join(','));
  });

  // Calculation & Audit Policy Footnote
  rows.push('');
  rows.push(`"--- AUDIT & CALCULATION POLICY ---"`);
  rows.push(`"1. Gross Avg Time: Reflects actual operational bay occupancy (Active Labor + Idle Time) strictly for vehicles completed and dispatched to the next station. Undispatched stages are excluded to protect average accuracy. Official shift breaks (lunch & tea) are deducted."`);
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

/**
 * Generates an executive PDF report with Two-Tier Grouped Headers and printable styles.
 */
export const exportServiceLogsToPDF = (
  vehicles: Vehicle[],
  kpis: ReportKPIs,
  datePresetLabel: string = 'All Time'
) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  const tableRowsHtml = vehicles.map((v, i) => {
    const { isEffectiveDone, effectiveCompletionDate } = getVehicleEffectiveCompletion(v);
    const start = new Date(v.intake_at || v.created_at);
    const end = effectiveCompletionDate ? effectiveCompletionDate : new Date();
    const grossSec = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
    const totalPausedSec = getVehicleTotalPausedSeconds(v);
    const rawNetSec = getNetWorkingSeconds(start, end);
    const netSec = Math.max(0, rawNetSec - totalPausedSec);
    const { breakSeconds } = getBreakOverlap(start, end);

    const workshopTiming = getStageTimingForZone(v, 'workshop');
    const alignmentTiming = getStageTimingForZone(v, 'alignment');
    const hoistTiming = getStageTimingForZone(v, 'hoist');
    const { totalIdleSec, totalActiveSec } = getVehicleIdleAndActiveTotals(v);

    const completedTasksCount = v.tasks.filter(t => t.is_completed).length;
    const totalTasksCount = v.tasks.filter(t => t.is_required).length;

    const statusLabel = isEffectiveDone ? 'DONE' : (v.current_zone === 'workshop' ? 'GENERAL' : v.current_zone.toUpperCase());
    const statusBg = isEffectiveDone ? '#dcfce7' : v.current_zone === 'workshop' ? '#e0f2fe' : v.current_zone === 'alignment' ? '#ecfdf5' : '#fef3c7';
    const statusColor = isEffectiveDone ? '#15803d' : v.current_zone === 'workshop' ? '#0369a1' : v.current_zone === 'alignment' ? '#047857' : '#b45309';

    const intakeDateStr = !isNaN(start.getTime())
      ? start.toLocaleDateString('en-US', { day: '2-digit', month: 'short', timeZone: 'Asia/Colombo' })
      : '--';
    const intakeTimeStr = !isNaN(start.getTime())
      ? start.toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: true })
      : '--:--';

    return `
      <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
        <td style="padding: 8px 10px; font-weight: 700; font-family: monospace; font-size: 13px; color: #0f172a; border-bottom: 1px solid #e2e8f0;">
          ${v.vehicle_no}
        </td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 800; background: ${statusBg}; color: ${statusColor};">
            ${statusLabel}
          </span>
        </td>
        <td style="padding: 8px 6px; font-size: 11px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0;">
          ${intakeDateStr}
        </td>
        <td style="padding: 8px 8px; font-size: 11px; color: #475569; border-bottom: 1px solid #e2e8f0;">
          ${intakeTimeStr}
        </td>
        <td style="padding: 8px 10px; font-size: 11px; font-weight: ${isEffectiveDone ? '700' : '400'}; color: ${isEffectiveDone ? '#16a34a' : '#d97706'}; border-bottom: 1px solid #e2e8f0;">
          ${isEffectiveDone && effectiveCompletionDate ? effectiveCompletionDate.toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: true }) : 'In Progress'}
        </td>
        <td style="padding: 8px 10px; font-weight: 700; font-size: 11px; color: #0284c7; border-bottom: 1px solid #e2e8f0;">
          ${formatDuration(grossSec)}
        </td>
        <td style="padding: 8px 10px; font-weight: 700; font-size: 11px; color: #16a34a; border-bottom: 1px solid #e2e8f0;">
          ${formatDuration(totalActiveSec > 0 ? totalActiveSec : netSec)}
        </td>
        <td style="padding: 8px 10px; font-weight: 700; font-size: 11px; color: #d97706; border-bottom: 1px solid #e2e8f0;">
          ${formatDuration(totalIdleSec)}
        </td>
        <td style="padding: 8px 10px; font-size: 11px; color: #b45309; font-weight: 700; border-bottom: 1px solid #e2e8f0;">
          ${breakSeconds > 0 ? formatDuration(breakSeconds) : '-'}
        </td>
        <!-- General Workshop -->
        <td style="padding: 8px 6px; font-size: 11px; color: #d97706; text-align: center; border-bottom: 1px solid #e2e8f0;">
          ${workshopTiming.idleSec > 0 ? formatDuration(workshopTiming.idleSec) : '-'}
        </td>
        <td style="padding: 8px 6px; font-size: 11px; color: #16a34a; text-align: center; border-bottom: 1px solid #e2e8f0;">
          ${workshopTiming.activeSec > 0 ? formatDuration(workshopTiming.activeSec) : '-'}
        </td>
        <td style="padding: 8px 6px; font-size: 11px; color: #b45309; text-align: center; border-bottom: 1px solid #e2e8f0;">
          ${workshopTiming.breakSec > 0 ? formatDuration(workshopTiming.breakSec) : '-'}
        </td>
        <!-- Wheel Alignment -->
        <td style="padding: 8px 6px; font-size: 11px; color: #d97706; text-align: center; border-bottom: 1px solid #e2e8f0;">
          ${alignmentTiming.idleSec > 0 ? formatDuration(alignmentTiming.idleSec) : '-'}
        </td>
        <td style="padding: 8px 6px; font-size: 11px; color: #16a34a; text-align: center; border-bottom: 1px solid #e2e8f0;">
          ${alignmentTiming.activeSec > 0 ? formatDuration(alignmentTiming.activeSec) : '-'}
        </td>
        <td style="padding: 8px 6px; font-size: 11px; color: #b45309; text-align: center; border-bottom: 1px solid #e2e8f0;">
          ${alignmentTiming.breakSec > 0 ? formatDuration(alignmentTiming.breakSec) : '-'}
        </td>
        <!-- Hoist Service -->
        <td style="padding: 8px 6px; font-size: 11px; color: #d97706; text-align: center; border-bottom: 1px solid #e2e8f0;">
          ${hoistTiming.idleSec > 0 ? formatDuration(hoistTiming.idleSec) : '-'}
        </td>
        <td style="padding: 8px 6px; font-size: 11px; color: #16a34a; text-align: center; border-bottom: 1px solid #e2e8f0;">
          ${hoistTiming.activeSec > 0 ? formatDuration(hoistTiming.activeSec) : '-'}
        </td>
        <td style="padding: 8px 6px; font-size: 11px; color: #b45309; text-align: center; border-bottom: 1px solid #e2e8f0;">
          ${hoistTiming.breakSec > 0 ? formatDuration(hoistTiming.breakSec) : '-'}
        </td>
        <td style="padding: 8px 10px; font-size: 11px; color: #0f172a; border-bottom: 1px solid #e2e8f0;">
          ${completedTasksCount}/${totalTasksCount} done
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
          .kpi-row { display: flex; gap: 12px; margin-bottom: 18px; }
          .kpi-card { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
          .kpi-label { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; }
          .kpi-val { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 4px; }
          .table-container { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 10px; }
          .th-top { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
          .th-sub { font-size: 8.5px; font-weight: 700; text-transform: uppercase; }
          .footer-sign { display: flex; justify-content: space-between; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; }
          .sign-line { width: 180px; border-top: 1px dashed #94a3b8; margin-top: 30px; text-align: center; padding-top: 4px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="brand-title">UNITED MOTORS LANKA PLC</h1>
            <div class="brand-sub">Workshop Service & Telemetry Audit Log Report</div>
          </div>
          <div class="meta-box">
            <div>Report Filter: <span class="meta-highlight">${datePresetLabel}</span></div>
            <div>Generated: <span class="meta-highlight">${new Date().toLocaleString()}</span></div>
            <div>Total Vehicles: <span class="meta-highlight">${vehicles.length}</span></div>
          </div>
        </div>

        <div class="kpi-row">
          <div class="kpi-card">
            <div class="kpi-label" style="color: #0284c7;">Status</div>
            <div style="margin-top: 4px;">
              <div style="font-size: 14px; font-weight: 900; color: #0284c7;">${kpis.inProgressCount}</div>
              <div style="font-size: 8px; font-weight: 700; color: #64748b; letter-spacing: 0.3px;">ACTIVE IN PROGRESS</div>
            </div>
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #e2e8f0;">
              <div style="font-size: 12px; font-weight: 800; color: #16a34a;">${kpis.completedCount}</div>
              <div style="font-size: 8px; font-weight: 700; color: #64748b; letter-spacing: 0.3px;">COMPLETED JOBS</div>
            </div>
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #e2e8f0; font-size: 8.5px; font-weight: 700; color: #64748b; text-align: center;">
              ${kpis.totalVehicles} total vehicles
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label" style="color: #0284c7;">Workshop</div>
            <div style="margin-top: 4px;">
              <div style="font-size: 14px; font-weight: 900; color: #0284c7;">${formatDuration(kpis.workshopBay.avgStageSec)}</div>
              <div style="font-size: 8px; font-weight: 700; color: #64748b; letter-spacing: 0.3px;">GROSS AVG TIME</div>
            </div>
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #e2e8f0;">
              <div style="font-size: 12px; font-weight: 800; color: #16a34a;">${formatDuration(kpis.workshopBay.avgActiveSec)}</div>
              <div style="font-size: 8px; font-weight: 700; color: #64748b; letter-spacing: 0.3px;">BAY AVG ACTIVE TIME</div>
            </div>
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #e2e8f0; font-size: 8.5px; font-weight: 700; color: #64748b; text-align: center;">
              ${kpis.workshopBay.vehicleCount} vehicles
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label" style="color: #16a34a;">Alignment</div>
            <div style="margin-top: 4px;">
              <div style="font-size: 14px; font-weight: 900; color: #16a34a;">${formatDuration(kpis.alignmentBay.avgStageSec)}</div>
              <div style="font-size: 8px; font-weight: 700; color: #64748b; letter-spacing: 0.3px;">GROSS AVG TIME</div>
            </div>
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #e2e8f0;">
              <div style="font-size: 12px; font-weight: 800; color: #16a34a;">${formatDuration(kpis.alignmentBay.avgActiveSec)}</div>
              <div style="font-size: 8px; font-weight: 700; color: #64748b; letter-spacing: 0.3px;">BAY AVG ACTIVE TIME</div>
            </div>
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #e2e8f0; font-size: 8.5px; font-weight: 700; color: #64748b; text-align: center;">
              ${kpis.alignmentBay.vehicleCount} vehicles
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label" style="color: #d97706;">Hoist</div>
            <div style="margin-top: 4px;">
              <div style="font-size: 14px; font-weight: 900; color: #d97706;">${formatDuration(kpis.hoistBay.avgStageSec)}</div>
              <div style="font-size: 8px; font-weight: 700; color: #64748b; letter-spacing: 0.3px;">GROSS AVG TIME</div>
            </div>
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #e2e8f0;">
              <div style="font-size: 12px; font-weight: 800; color: #16a34a;">${formatDuration(kpis.hoistBay.avgActiveSec)}</div>
              <div style="font-size: 8px; font-weight: 700; color: #64748b; letter-spacing: 0.3px;">BAY AVG ACTIVE TIME</div>
            </div>
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #e2e8f0; font-size: 8.5px; font-weight: 700; color: #64748b; text-align: center;">
              ${kpis.hoistBay.vehicleCount} vehicles
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
              <th rowspan="2" style="padding: 8px 6px; text-align: left; border-right: 1px solid #334155;">Gross TAT</th>
              <th rowspan="2" style="padding: 8px 6px; text-align: left; border-right: 1px solid #334155;">Net Active</th>
              <th rowspan="2" style="padding: 8px 6px; text-align: left; border-right: 1px solid #334155;">Total Idle</th>
              <th rowspan="2" style="padding: 8px 6px; text-align: left; border-right: 1px solid #334155;">Breaks</th>
              <th colspan="3" style="padding: 6px; text-align: center; background: #0369a1; border-right: 1px solid #334155;">GENERAL SERVICE</th>
              <th colspan="3" style="padding: 6px; text-align: center; background: #047857; border-right: 1px solid #334155;">WHEEL ALIGNMENT</th>
              <th colspan="3" style="padding: 6px; text-align: center; background: #b45309; border-right: 1px solid #334155;">HOIST SERVICE</th>
              <th rowspan="2" style="padding: 8px 6px; text-align: left;">Tasks</th>
            </tr>
            <tr style="background: #1e293b; color: #94a3b8;">
              <!-- General Service -->
              <th style="padding: 4px; text-align: center; font-size: 8.5px; color: #fbbf24; border-right: 1px solid #334155;">Idle</th>
              <th style="padding: 4px; text-align: center; font-size: 8.5px; color: #34d399; border-right: 1px solid #334155;">Active</th>
              <th style="padding: 4px; text-align: center; font-size: 8.5px; color: #f59e0b; border-right: 1px solid #334155;">Breaks</th>
              <!-- Wheel Alignment -->
              <th style="padding: 4px; text-align: center; font-size: 8.5px; color: #fbbf24; border-right: 1px solid #334155;">Idle</th>
              <th style="padding: 4px; text-align: center; font-size: 8.5px; color: #34d399; border-right: 1px solid #334155;">Active</th>
              <th style="padding: 4px; text-align: center; font-size: 8.5px; color: #f59e0b; border-right: 1px solid #334155;">Breaks</th>
              <!-- Hoist Service -->
              <th style="padding: 4px; text-align: center; font-size: 8.5px; color: #fbbf24; border-right: 1px solid #334155;">Idle</th>
              <th style="padding: 4px; text-align: center; font-size: 8.5px; color: #34d399; border-right: 1px solid #334155;">Active</th>
              <th style="padding: 4px; text-align: center; font-size: 8.5px; color: #f59e0b; border-right: 1px solid #334155;">Breaks</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>

        <!-- Operational Audit Legend -->
        <div style="margin-top: 14px; padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 9.5px; color: #475569; line-height: 1.5;">
          <div><strong style="color: #0f172a;">Audit & Calculation Policy:</strong></div>
          <div>• <strong>Gross Avg Time:</strong> Working bay occupancy (Active Labor + Idle Time) strictly for vehicles completed and dispatched to the next station. Undispatched/in-progress stages are excluded to protect average accuracy. Scheduled breaks (morning/afternoon tea, lunch) are deducted.</div>
          <div>• <strong>Bay Avg Active Time:</strong> Pure hands-on labor duration by assigned technicians on completed & dispatched stages.</div>
        </div>

        <div class="footer-sign">
          <div>
            <div class="sign-line">Prepared by (Supervisor)</div>
          </div>
          <div>
            <div class="sign-line">Verified by (Service Advisor)</div>
          </div>
          <div>
            <div class="sign-line">Workshop General Manager</div>
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
