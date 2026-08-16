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
  netStr: string;
  grossStr: string;
  breakNote: string | null;
}

export const getStageDurationBreakdown = (
  enteredAt?: string | null,
  exitedAt?: string | null
): StageBreakdownResult => {
  if (!enteredAt) {
    return {
      netSec: 0,
      grossSec: 0,
      breakSec: 0,
      netStr: '0m',
      grossStr: '0m',
      breakNote: null,
    };
  }

  const start = new Date(enteredAt);
  const end = exitedAt ? new Date(exitedAt) : new Date();

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return {
      netSec: 0,
      grossSec: 0,
      breakSec: 0,
      netStr: '0m',
      grossStr: '0m',
      breakNote: null,
    };
  }

  const grossSec = Math.floor((end.getTime() - start.getTime()) / 1000);
  const { breakSeconds, breakNames } = getBreakOverlap(start, end);
  const netSec = Math.max(0, grossSec - breakSeconds);

  const breakMins = Math.round(breakSeconds / 60);
  let breakNote: string | null = null;

  if (breakMins > 0 && breakNames.length > 0) {
    const breakNamesStr = breakNames.join(', ');
    breakNote = `Gross: ${formatDurationString(grossSec, false)} · ${breakMins}m ${breakNamesStr} deducted`;
  }

  return {
    netSec,
    grossSec,
    breakSec: breakSeconds,
    netStr: formatDurationString(netSec, true),
    grossStr: formatDurationString(grossSec, false),
    breakNote,
  };
};
