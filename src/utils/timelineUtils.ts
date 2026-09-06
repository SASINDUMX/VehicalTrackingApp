import { Vehicle, BayZone, TaskType } from "../types/vehicle";
import { getTaskTypeForBay, getStageDurationBreakdown, formatDurationString } from "./vehicleUtils";

export interface StageDefinition {
  zone: BayZone;
  name: string;
  icon: any;
  color: string;
  isRequired?: boolean;
}

export interface TimelineStageNode {
  stageDef: StageDefinition;
  isCurrent: boolean;
  logsForZone: Vehicle['stage_logs'];
  isCompleted: boolean;
  isCancelled: boolean;
  isLastInOrder: boolean;
  isInspection: boolean;
  isStageIdle: boolean;
  spentStr: string;
  breakNotes: string[];
  queueNotes: string[];
  workCompletedAt: string | null | undefined;
}

/**
 * Computes the chronological lifecycle stepper nodes for a vehicle in VehicleDetailsModal.
 * Pure mathematical state machine: extracts stage logs, calculates break deductions,
 * sorts stages into Completed -> Active -> Upcoming, and outputs view-model nodes.
 */
export const computeVehicleTimelineStages = (
  vehicle: Vehicle,
  masterStages: StageDefinition[],
  activeStageDuration: string
): TimelineStageNode[] => {
  const isWorkshopReq = vehicle.tasks.some(t => t.task_type === 'general_service' && t.is_required);
  const isAlignmentReq = vehicle.tasks.some(t => t.task_type === 'wheel_alignment' && t.is_required);
  const isHoistReq = vehicle.tasks.some(t => t.task_type === 'hoist_service' && t.is_required);

  const isRequiredForZone = (zone: BayZone) => {
    if (zone === 'workshop') return isWorkshopReq;
    if (zone === 'alignment') return isAlignmentReq;
    if (zone === 'hoist') return isHoistReq;
    if (zone === 'inspection') return true;
    return false;
  };

  const configuredStages = masterStages.map(s => ({
    ...s,
    isRequired: isRequiredForZone(s.zone),
  }));

  // Filter only required stages or stages already visited/active
  const relevantStages = configuredStages.filter(s => {
    const hasLogs = vehicle.stage_logs.some(l => l.to_zone === s.zone);
    const isCurrent = vehicle.current_zone === s.zone;
    return s.isRequired || hasLogs || isCurrent;
  });

  // Strictly sort: 1. Completed (visited & exited) -> 2. Active Current -> 3. Upcoming (Pending)
  const completedNodes: typeof relevantStages = [];
  let activeNode: typeof relevantStages[0] | null = null;
  const pendingNodes: typeof relevantStages = [];

  const currentZoneInner = vehicle.current_zone;
  relevantStages.forEach(s => {
    const isCurrent = currentZoneInner === s.zone;
    const logsForZone = vehicle.stage_logs.filter(l => l.to_zone === s.zone);
    const hasExitedAll = logsForZone.length > 0 && logsForZone.every(l => Boolean(l.exited_at));

    if (isCurrent) {
      activeNode = s;
    } else if (hasExitedAll && !isCurrent) {
      completedNodes.push(s);
    } else {
      pendingNodes.push(s);
    }
  });

  const orderedTimelineNodes = [...completedNodes];
  if (activeNode) {
    orderedTimelineNodes.push(activeNode);
  }
  orderedTimelineNodes.push(...pendingNodes);

  return orderedTimelineNodes.map((stageDef, idx) => {
    const isCurrent = currentZoneInner === stageDef.zone;
    const logsForZone = vehicle.stage_logs.filter(l => l.to_zone === stageDef.zone);
    const hasVisited = logsForZone.length > 0;
    const hasExitedAll = hasVisited && logsForZone.every(l => Boolean(l.exited_at));
    const isCompleted = hasExitedAll && !isCurrent;
    const isLastInOrder = idx === orderedTimelineNodes.length - 1;

    const isInspection = stageDef.zone === 'inspection';

    // Inspection zone has zero labor machinery: short-circuit cleanly
    if (isInspection) {
      return {
        stageDef,
        isCurrent,
        logsForZone,
        isCompleted,
        isCancelled: false,
        isLastInOrder,
        isInspection: true,
        isStageIdle: false,
        spentStr: '',
        breakNotes: [],
        queueNotes: [],
        workCompletedAt: null,
      };
    }

    const bayTaskType = getTaskTypeForBay(stageDef.zone);
    const currentTask =
      vehicle.tasks.find(t => t.task_type === bayTaskType && t.is_required) ||
      vehicle.tasks.find(t => t.task_type === bayTaskType);
    const workCompletedAt = currentTask?.is_completed ? currentTask.completed_at : null;

    const latestLog = logsForZone[logsForZone.length - 1];
    const isStageIdle = Boolean(
      isCurrent && latestLog && !latestLog.exited_at && (!latestLog.work_started_at || Boolean(workCompletedAt))
    );

    let totalNetSec = 0;
    const breakNotes: string[] = [];
    const queueNotes: string[] = [];

    logsForZone.forEach(l => {
      const breakdown = getStageDurationBreakdown(
        l.entered_at,
        l.exited_at,
        l.work_started_at,
        l.idle_seconds,
        workCompletedAt
      );
      totalNetSec += breakdown.netSec;
      if (breakdown.breakNote) breakNotes.push(breakdown.breakNote);
      if (breakdown.queueNote) queueNotes.push(breakdown.queueNote);
    });

    const spentStr = isCurrent ? activeStageDuration : formatDurationString(totalNetSec, true);
    const isCancelled =
      stageDef.zone !== 'inspection' &&
      !isCurrent &&
      !isCompleted &&
      (currentZoneInner === 'inspection' || vehicle.is_finished);

    return {
      stageDef,
      isCurrent,
      logsForZone,
      isCompleted,
      isCancelled,
      isLastInOrder,
      isInspection: false,
      isStageIdle,
      spentStr,
      breakNotes,
      queueNotes,
      workCompletedAt,
    };
  });
};
