import { Vehicle, VehicleTask, BayZone, TaskType } from "../types/vehicle";
import { getNetWorkingSeconds, getBreakOverlap } from "./workshopHoursUtils";

export interface ProgressResult {
  completedCount: number;
  totalRequired: number;
  percent: number;
}

export const calculateJobSheetProgress = (tasks: VehicleTask[] = []): ProgressResult => {
  const completedCount = tasks.filter(t => t.is_completed).length;
  const totalRequired = tasks.filter(t => t.is_required).length;
  const percent = totalRequired ? Math.round((completedCount / totalRequired) * 100) : 0;

  return { completedCount, totalRequired, percent };
};

export const getTaskTypeForBay = (zone: BayZone): TaskType => {
  switch (zone) {
    case "workshop": return "general_service";
    case "hoist": return "hoist_service";
    case "alignment": return "wheel_alignment";
    default: return "general_service";
  }
};

export const calculateTotalGrossIntakeSec = (vehicle: Vehicle): number => {
  if (!vehicle || !vehicle.intake_at) return 0;
  const start = new Date(vehicle.intake_at).getTime();
  if (isNaN(start)) return 0;

  const end = vehicle.completed_at ? new Date(vehicle.completed_at).getTime() : Date.now();
  return Math.max(0, Math.floor((end - start) / 1000));
};

export const calculateTotalNetWorkingSec = (vehicle: Vehicle): number => {
  if (!vehicle || !vehicle.intake_at) return 0;
  const end = vehicle.completed_at || new Date().toISOString();
  return getNetWorkingSeconds(vehicle.intake_at, end);
};

export const formatDurationString = (totalSec: number, showSeconds: boolean = false): string => {
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (showSeconds) {
    if (hours > 0) {
      return `${hours}h ${mins}m ${secs}s`;
    }
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  }

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
};

export const formatTotalTATString = (vehicle: Vehicle): string => {
  const netSec = calculateTotalNetWorkingSec(vehicle);
  return formatDurationString(netSec, false);
};

export interface StageBreakdownResult {
  netSec: number;
  grossSec: number;
  breakSec: number;
  idleSec: number;
  activeSec: number;
  isIdle: boolean;
  pausedSec: number;
  isPaused: boolean;
  netStr: string;
  grossStr: string;
  breakNote: string | null;
  queueNote?: string | null;
}

export interface StageTimingResult {
  isIdle: boolean;
  idleSeconds: number;
  activeSeconds: number;
  totalStageSeconds: number;
  displaySeconds: number;
  displayText: string;
}

/**
 * Calculates Idle vs Active timing for a stage log:
 * - If work_started_at is null: stage is IDLE (waiting in bay)
 * - If work_started_at is set: stage is ACTIVE (work in progress)
 */
export const getStageTiming = (
  enteredAt?: string | null,
  workStartedAt?: string | null,
  exitedAt?: string | null,
  recordedIdleSeconds?: number,
  recordedDurationSeconds?: number
): StageTimingResult => {
  if (!enteredAt) {
    return {
      isIdle: true,
      idleSeconds: 0,
      activeSeconds: 0,
      totalStageSeconds: 0,
      displaySeconds: 0,
      displayText: '0m 00s',
    };
  }

  const enteredMs = new Date(enteredAt).getTime();
  const isClosed = Boolean(exitedAt);
  const endMs = isClosed && exitedAt ? new Date(exitedAt).getTime() : Date.now();
  const totalSec = recordedDurationSeconds && recordedDurationSeconds > 0
    ? recordedDurationSeconds
    : Math.max(0, Math.floor((endMs - enteredMs) / 1000));

  if (!workStartedAt) {
    // Work hasn't started yet -> this stage is IDLE
    const idleSec = isClosed ? totalSec : totalSec;
    return {
      isIdle: true,
      idleSeconds: idleSec,
      activeSeconds: 0,
      totalStageSeconds: totalSec,
      displaySeconds: idleSec,
      displayText: `IDLE · ${formatDurationString(idleSec, true)}`,
    };
  }

  // Work has started -> this stage is ACTIVE
  const workStartedMs = new Date(workStartedAt).getTime();
  const idleSec = (typeof recordedIdleSeconds === 'number' && recordedIdleSeconds >= 0)
    ? recordedIdleSeconds
    : Math.max(0, Math.floor((workStartedMs - enteredMs) / 1000));

  const activeEndMs = isClosed && exitedAt ? new Date(exitedAt).getTime() : Date.now();
  const activeSec = Math.max(0, Math.floor((activeEndMs - workStartedMs) / 1000));

  return {
    isIdle: false,
    idleSeconds: idleSec,
    activeSeconds: activeSec,
    totalStageSeconds: idleSec + activeSec,
    displaySeconds: activeSec,
    displayText: formatDurationString(activeSec, true),
  };
};

export const getActiveStageNetSeconds = (
  enteredAt?: string | null,
  exitedAt?: string | null,
  isPaused: boolean = false,
  pausedAt?: string | null,
  pausedSeconds: number = 0
): number => {
  if (!enteredAt) return 0;
  const start = new Date(enteredAt);
  const end = isPaused && pausedAt ? new Date(pausedAt) : (exitedAt ? new Date(exitedAt) : new Date());
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return 0;

  const baseNet = getNetWorkingSeconds(start, end);
  return Math.max(0, baseNet - (pausedSeconds || 0));
};

export const getStageDurationBreakdown = (
  enteredAt?: string | null,
  exitedAt?: string | null,
  isPaused: boolean = false,
  pausedAt?: string | null,
  pausedSeconds: number = 0,
  workStartedAt?: string | null,
  recordedIdleSeconds?: number
): StageBreakdownResult => {
  if (!enteredAt) {
    return {
      netSec: 0,
      grossSec: 0,
      breakSec: 0,
      idleSec: 0,
      activeSec: 0,
      isIdle: true,
      pausedSec: 0,
      isPaused: false,
      netStr: '0m',
      grossStr: '0m',
      breakNote: null,
    };
  }

  const timing = getStageTiming(enteredAt, workStartedAt, exitedAt, recordedIdleSeconds);
  const start = new Date(enteredAt);
  const end = exitedAt ? new Date(exitedAt) : new Date();

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return {
      netSec: 0,
      grossSec: 0,
      breakSec: 0,
      idleSec: timing.idleSeconds,
      activeSec: timing.activeSeconds,
      isIdle: timing.isIdle,
      pausedSec: 0,
      isPaused: false,
      netStr: '0m',
      grossStr: '0m',
      breakNote: timing.isIdle ? '⏳ Waiting to start (IDLE)' : null,
    };
  }

  const grossSec = Math.floor((end.getTime() - start.getTime()) / 1000);
  const { breakSeconds, breakNames } = getBreakOverlap(start, end);
  const netSec = Math.max(0, grossSec - breakSeconds);

  let queueNote: string | null = null;
  if (timing.isIdle) {
    queueNote = `⏳ IDLE / Queue: ${formatDurationString(timing.idleSeconds, false)}`;
  } else if (timing.idleSeconds > 0) {
    queueNote = `Queue: ${formatDurationString(timing.idleSeconds, false)} · Active: ${formatDurationString(timing.activeSeconds, false)}`;
  }

  const breakMins = Math.round(breakSeconds / 60);
  let breakNote: string | null = null;
  if (breakMins > 0 && breakNames.length > 0) {
    const breakNamesStr = breakNames.join(', ');
    breakNote = `☕ Deducted ${breakMins}m ${breakNamesStr} (scheduled break)`;
  }

  return {
    netSec,
    grossSec,
    breakSec: breakSeconds,
    idleSec: timing.idleSeconds,
    activeSec: timing.activeSeconds,
    isIdle: timing.isIdle,
    pausedSec: 0,
    isPaused: false,
    netStr: formatDurationString(netSec, true),
    grossStr: formatDurationString(grossSec, false),
    breakNote,
    queueNote,
  };
};
