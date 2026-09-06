import { Vehicle, VehicleTask, BayZone, TaskType } from "../types/vehicle";
import { getNetWorkingSeconds, getBreakOverlap, getCurrentActiveBreak } from "./workshopHoursUtils";

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

export const getBayForTaskType = (taskType: TaskType): BayZone => {
  switch (taskType) {
    case "general_service": return "workshop";
    case "hoist_service": return "hoist";
    case "wheel_alignment": return "alignment";
    default: return "workshop";
  }
};

export const getVehicleEffectiveEndDate = (vehicle: Vehicle): Date => {
  // Dispatched to Advisor Inspection Zone marks the definitive end of all vehicle time calculations
  const inspLog = vehicle.stage_logs.find(l => l.to_zone === 'inspection');
  if (inspLog?.entered_at) {
    const d = new Date(inspLog.entered_at);
    if (!isNaN(d.getTime())) return d;
  }

  if (vehicle.completed_at) {
    const d = new Date(vehicle.completed_at);
    if (!isNaN(d.getTime())) return d;
  }

  return new Date();
};

export const calculateTotalGrossIntakeSec = (vehicle: Vehicle): number => {
  if (!vehicle || !vehicle.intake_at) return 0;
  const start = new Date(vehicle.intake_at).getTime();
  if (isNaN(start)) return 0;

  const end = getVehicleEffectiveEndDate(vehicle).getTime();
  return Math.max(0, Math.floor((end - start) / 1000));
};

export const calculateTotalNetWorkingSec = (vehicle: Vehicle): number => {
  if (!vehicle || !vehicle.intake_at) return 0;
  const end = getVehicleEffectiveEndDate(vehicle);
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

export interface VehicleModalTimers {
  totalElapsedStr: string;
  grossElapsedStr: string;
  activeStageDuration: string;
  activeStageDurationRaw: string;
}

/**
 * Computes modal overview timers: Net Labor TAT, Gross Intake TAT, and Active Bay Stage Duration.
 * Pure business calculation decoupled from UI component state.
 */
export const computeVehicleModalTimers = (vehicle: Vehicle): VehicleModalTimers => {
  const now = new Date();
  const effectiveEnd = getVehicleEffectiveEndDate(vehicle);

  // Net & Gross Elapsed Time since Intake (stops when entering inspection zone or finished)
  const netSec = getNetWorkingSeconds(vehicle.intake_at, effectiveEnd);
  const intakeMs = new Date(vehicle.intake_at).getTime();
  const grossSec = isNaN(intakeMs) ? 0 : Math.max(0, Math.floor((effectiveEnd.getTime() - intakeMs) / 1000));

  let stageDuration = '0m 00s';
  let stageDurationRaw = '0m 00s';
  const lastLog = vehicle.stage_logs[vehicle.stage_logs.length - 1];

  if (vehicle.is_finished) {
    stageDuration = 'COMPLETED';
    stageDurationRaw = '0m 00s';
  } else if (vehicle.current_zone === 'inspection') {
    stageDuration = 'READY';
    stageDurationRaw = '0m 00s';
  } else if (lastLog && !lastLog.exited_at) {
    const bayTaskType = getTaskTypeForBay(vehicle.current_zone);
    const currentTask =
      vehicle.tasks.find(t => t.task_type === bayTaskType && t.is_required) ||
      vehicle.tasks.find(t => t.task_type === bayTaskType);

    if (!lastLog.work_started_at) {
      const enterMs = new Date(lastLog.entered_at).getTime();
      const idleSec = isNaN(enterMs) ? 0 : Math.max(0, Math.floor((now.getTime() - enterMs) / 1000));
      const formatted = formatDurationString(idleSec, true);
      stageDuration = `IDLE · ${formatted}`;
      stageDurationRaw = formatted;
    } else if (currentTask && currentTask.is_completed && currentTask.completed_at) {
      const completedMs = new Date(currentTask.completed_at).getTime();
      const postIdleSec = isNaN(completedMs) ? 0 : Math.max(0, Math.floor((now.getTime() - completedMs) / 1000));
      const formatted = formatDurationString(postIdleSec, true);
      stageDuration = `IDLE · ${formatted}`;
      stageDurationRaw = formatted;
    } else {
      const workStartMs = new Date(lastLog.work_started_at).getTime();
      const activeSec = isNaN(workStartMs) ? 0 : Math.max(0, Math.floor((now.getTime() - workStartMs) / 1000));
      const timeStr = formatDurationString(activeSec, true);
      const activeBreak = getCurrentActiveBreak(now);
      if (activeBreak) {
        stageDuration = `⏸ ${timeStr}`;
        stageDurationRaw = `⏸ ${timeStr}`;
      } else {
        stageDuration = timeStr;
        stageDurationRaw = timeStr;
      }
    }
  }

  return {
    totalElapsedStr: formatDurationString(netSec, true),
    grossElapsedStr: formatDurationString(grossSec, true),
    activeStageDuration: stageDuration,
    activeStageDurationRaw: stageDurationRaw,
  };
};

export interface StageBreakdownResult {
  netSec: number;
  grossSec: number;
  breakSec: number;
  idleSec: number;
  queueInSec: number;
  activeSec: number;
  queueOutSec: number;
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
  idleSeconds: number; // Total idle (queueIn + queueOut)
  queueInSeconds: number; // Waiting for tech to start
  activeSeconds: number; // True mechanical labor
  queueOutSeconds: number; // Task done, waiting for dispatch
  breakSeconds: number; // Shift breaks
  totalStageSeconds: number;
  displaySeconds: number;
  displayText: string;
}

/**
 * Calculates 4-tier timing for a stage:
 * 1. Queue In (Pre-Idle): entered_at -> work_started_at
 * 2. Active Labor: work_started_at -> work_completed_at (excluding breaks)
 * 3. Queue Out (Post-Idle): work_completed_at -> exited_at
 * 4. Shift Breaks: overlap with scheduled breaks
 */
export const getStageTiming = (
  enteredAt?: string | null,
  workStartedAt?: string | null,
  exitedAt?: string | null,
  recordedIdleSeconds?: number,
  recordedDurationSeconds?: number,
  workCompletedAt?: string | null
): StageTimingResult => {
  if (!enteredAt) {
    return {
      isIdle: true,
      idleSeconds: 0,
      queueInSeconds: 0,
      activeSeconds: 0,
      queueOutSeconds: 0,
      breakSeconds: 0,
      totalStageSeconds: 0,
      displaySeconds: 0,
      displayText: '0m 00s',
    };
  }

  const enteredMs = new Date(enteredAt).getTime();
  const isClosed = Boolean(exitedAt);
  const endMs = isClosed && exitedAt ? new Date(exitedAt).getTime() : Date.now();
  const rawTotalSec = recordedDurationSeconds && recordedDurationSeconds > 0
    ? recordedDurationSeconds
    : Math.max(0, Math.floor((endMs - enteredMs) / 1000));

  const { breakSeconds } = getBreakOverlap(new Date(enteredAt), new Date(endMs));
  // Deduct breaks from operational stage duration
  const totalSec = Math.max(0, rawTotalSec - breakSeconds);

  // Case 1: Work hasn't started yet -> 100% Queue In (Pre-Idle, excluding breaks)
  if (!workStartedAt) {
    return {
      isIdle: true,
      idleSeconds: totalSec,
      queueInSeconds: totalSec,
      activeSeconds: 0,
      queueOutSeconds: 0,
      breakSeconds,
      totalStageSeconds: totalSec,
      displaySeconds: totalSec,
      displayText: formatDurationString(totalSec, true),
    };
  }

  // Work has started
  const workStartedMs = new Date(workStartedAt).getTime();
  const queueInSec = Math.max(0, Math.floor((workStartedMs - enteredMs) / 1000));

  // Case 2: Work has completed during this stage (Task marked Done on or before exit)
  const completedMs = workCompletedAt ? new Date(workCompletedAt).getTime() : NaN;
  const isDoneInThisStage = !isNaN(completedMs) && completedMs <= endMs;

  if (isDoneInThisStage) {
    // Clamp completedMs between workStartedMs and endMs
    const validCompletedMs = Math.min(Math.max(completedMs, workStartedMs), endMs);
    const rawActiveSec = Math.max(0, Math.floor((validCompletedMs - workStartedMs) / 1000));
    const { breakSeconds: activeBreakSec } = getBreakOverlap(new Date(workStartedMs), new Date(validCompletedMs));
    const activeSec = Math.max(0, rawActiveSec - activeBreakSec);
    const queueOutSec = Math.max(0, Math.floor((endMs - validCompletedMs) / 1000));
    const totalIdleSec = queueInSec + queueOutSec;

    return {
      isIdle: false,
      idleSeconds: totalIdleSec,
      queueInSeconds: queueInSec,
      activeSeconds: activeSec,
      queueOutSeconds: queueOutSec,
      breakSeconds,
      totalStageSeconds: totalSec,
      displaySeconds: activeSec,
      displayText: isClosed
        ? formatDurationString(activeSec, true)
        : formatDurationString(queueOutSec, true),
    };
  }

  // Case 3: Work started and currently IN PROGRESS
  const rawActiveSec = Math.max(0, Math.floor((endMs - workStartedMs) / 1000));
  const { breakSeconds: activeBreakSec } = getBreakOverlap(new Date(workStartedMs), new Date(endMs));
  const activeSec = Math.max(0, rawActiveSec - activeBreakSec);

  return {
    isIdle: false,
    idleSeconds: queueInSec,
    queueInSeconds: queueInSec,
    activeSeconds: activeSec,
    queueOutSeconds: 0,
    breakSeconds,
    totalStageSeconds: totalSec,
    displaySeconds: activeSec,
    displayText: formatDurationString(activeSec, true),
  };
};

export const getActiveStageNetSeconds = (
  enteredAt?: string | null,
  exitedAt?: string | null
): number => {
  if (!enteredAt) return 0;
  const start = new Date(enteredAt);
  const end = exitedAt ? new Date(exitedAt) : new Date();
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return 0;

  return getNetWorkingSeconds(start, end);
};

export const getStageDurationBreakdown = (
  enteredAt?: string | null,
  exitedAt?: string | null,
  workStartedAt?: string | null,
  recordedIdleSeconds?: number,
  workCompletedAt?: string | null
): StageBreakdownResult => {
  if (!enteredAt) {
    return {
      netSec: 0,
      grossSec: 0,
      breakSec: 0,
      idleSec: 0,
      queueInSec: 0,
      activeSec: 0,
      queueOutSec: 0,
      isIdle: true,
      pausedSec: 0,
      isPaused: false,
      netStr: '0m',
      grossStr: '0m',
      breakNote: null,
    };
  }

  const timing = getStageTiming(enteredAt, workStartedAt, exitedAt, recordedIdleSeconds, undefined, workCompletedAt);
  const start = new Date(enteredAt);
  const end = exitedAt ? new Date(exitedAt) : new Date();

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return {
      netSec: 0,
      grossSec: 0,
      breakSec: 0,
      idleSec: timing.idleSeconds,
      queueInSec: timing.queueInSeconds,
      activeSec: timing.activeSeconds,
      queueOutSec: timing.queueOutSeconds,
      isIdle: timing.isIdle,
      pausedSec: 0,
      isPaused: false,
      netStr: '0m',
      grossStr: '0m',
      breakNote: timing.isIdle ? '⏳ Waiting to start (Queue In)' : null,
    };
  }

  const grossSec = Math.floor((end.getTime() - start.getTime()) / 1000);
  const { breakSeconds, breakNames } = getBreakOverlap(start, end);
  const netSec = Math.max(0, grossSec - breakSeconds);

  let queueNote: string | null = null;
  if (timing.isIdle) {
    queueNote = `Idle: ${formatDurationString(timing.queueInSeconds, false)}`;
  } else {
    const parts: string[] = [];
    parts.push(`Active: ${formatDurationString(timing.activeSeconds, false)}`);
    if (timing.idleSeconds > 0) {
      parts.push(`Idle: ${formatDurationString(timing.idleSeconds, false)}`);
    }
    queueNote = parts.join(' · ');
  }

  const breakMins = Math.round(breakSeconds / 60);
  let breakNote: string | null = null;
  if (breakMins > 0 && breakNames.length > 0) {
    const breakNamesStr = breakNames.join(', ');
    breakNote = `Deducted ${breakMins}m ${breakNamesStr}`;
  }

  return {
    netSec,
    grossSec,
    breakSec: breakSeconds,
    idleSec: timing.idleSeconds,
    queueInSec: timing.queueInSeconds,
    activeSec: timing.activeSeconds,
    queueOutSec: timing.queueOutSeconds,
    isIdle: timing.isIdle,
    pausedSec: 0,
    isPaused: false,
    netStr: formatDurationString(netSec, true),
    grossStr: formatDurationString(grossSec, false),
    breakNote,
    queueNote,
  };
};

/**
 * Computes live formatted timer strings for vehicles across bays.
 * Standardizes:
 * - Advisor inspection: always 'READY' (no timer countdown)
 * - Idle state: 'IDLE · Xm Ys'
 * - Active state: 'Xm Ys' (or paused break: '⏸ Xm Ys (Break Name)')
 */
export const computeVehicleTimersMap = (vehicleList: Vehicle[]): Record<string, string> => {
  const updated: Record<string, string> = {};
  const now = new Date();
  const activeBreak = getCurrentActiveBreak(now);

  vehicleList.forEach((v) => {
    if (v.is_finished) {
      updated[v.id] = 'COMPLETED';
      return;
    }

    // Advisor inspection zone is the final handover staging area - zero labor, no countdown
    if (v.current_zone === 'inspection') {
      updated[v.id] = 'READY';
      return;
    }

    const lastLog = v.stage_logs[v.stage_logs.length - 1];

    if (lastLog && !lastLog.exited_at) {
      if (!lastLog.work_started_at) {
        // IDLE state: waiting for technician to start work
        const enterMs = new Date(lastLog.entered_at).getTime();
        const idleSec = isNaN(enterMs) ? 0 : Math.max(0, Math.floor((now.getTime() - enterMs) / 1000));
        updated[v.id] = formatDurationString(idleSec, true);
      } else {
        // ACTIVE state: technician work in progress
        const workStartMs = new Date(lastLog.work_started_at).getTime();
        const activeSec = isNaN(workStartMs) ? 0 : Math.max(0, Math.floor((now.getTime() - workStartMs) / 1000));
        const timeStr = formatDurationString(activeSec, true);

        // Check if task for current bay is already marked completed (Queue Out state)
        const bayTaskType = getTaskTypeForBay(v.current_zone);
        const currentTask = v.tasks.find(t => t.task_type === bayTaskType && t.is_required) || v.tasks.find(t => t.task_type === bayTaskType);

        if (currentTask && currentTask.is_completed && currentTask.completed_at) {
          const completedMs = new Date(currentTask.completed_at).getTime();
          const queueOutSec = isNaN(completedMs) ? 0 : Math.max(0, Math.floor((now.getTime() - completedMs) / 1000));
          updated[v.id] = formatDurationString(queueOutSec, true);
        } else if (activeBreak) {
          updated[v.id] = `⏸ ${timeStr}`;
        } else {
          updated[v.id] = timeStr;
        }
      }
    } else {
      updated[v.id] = '0m 00s';
    }
  });

  return updated;
};

/**
 * Standard workshop vehicle queue sort:
 * 1. Urgent priority vehicles first (is_urgent = true)
 * 2. Pinned vehicles second (isPinned = true)
 * 3. FIFO intake / entry timestamp order (earliest time first)
 */
export const sortWorkshopVehicles = (
  vehicles: Vehicle[],
  isPinnedFn?: (id: string) => boolean
): Vehicle[] => {
  return [...vehicles].sort((a, b) => {
    if (a.is_urgent && !b.is_urgent) return -1;
    if (!a.is_urgent && b.is_urgent) return 1;

    if (isPinnedFn) {
      const aPinned = isPinnedFn(a.id);
      const bPinned = isPinnedFn(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
    }

    const lastLogA = a.stage_logs[a.stage_logs.length - 1];
    const lastLogB = b.stage_logs[b.stage_logs.length - 1];
    const timeA = lastLogA?.entered_at ? new Date(lastLogA.entered_at).getTime() : new Date(a.intake_at).getTime();
    const timeB = lastLogB?.entered_at ? new Date(lastLogB.entered_at).getTime() : new Date(b.intake_at).getTime();
    const safeA = isNaN(timeA) ? 0 : timeA;
    const safeB = isNaN(timeB) ? 0 : timeB;
    return safeA - safeB;
  });
};


