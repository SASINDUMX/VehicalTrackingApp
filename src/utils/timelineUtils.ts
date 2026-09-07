import { Vehicle, BayZone, TaskType } from "../types/vehicle";
import { getTaskTypeForBay, getStageDurationBreakdown, formatDurationString } from "./vehicleUtils";

export interface StageDefinition {
  zone: BayZone;
  name: string;
  icon: any;
  color: string;
  isRequired?: boolean;
}

export type TimelineNodeStatus = 
  | 'completed'  // Visited, exited, task completed (Green circle + DONE badge)
  | 'bypassed'   // Visited, exited, task NOT completed (Red circle + BYPASSED badge)
  | 'active'     // Currently in bay, actively working (Blue circle + ACTIVE badge)
  | 'idle'       // Currently in bay, in 1st queue or 2nd post-work idle (Amber circle + IDLE badge)
  | 'ready'      // Currently in inspection ready area (Green circle + READY badge)
  | 'skipped'    // Unvisited at bottom, bypassed entirely (Red/gray strikethrough + SKIPPED badge)
  | 'pending';   // Unvisited at bottom, still upcoming (Gray circle + PENDING badge)

export type TimelineConnectorType =
  | 'none'       // Last node, or leading to an unvisited stage at bottom (stays default gray line)
  | 'completed'  // Full Green line (Stage completed & moved to next entered stage)
  | 'bypassed'   // Full Red line (Stage entered & exited without task done, moved to next stage)
  | 'idle_done'  // Full Amber line (Task done, waiting for dispatch in 2nd idle)
  | 'working';   // 50% Blue line (Stage actively in progress)

export interface TimelineStageNode {
  id?: string;
  stageDef: StageDefinition;
  status: TimelineNodeStatus;
  connectorType: TimelineConnectorType;
  isCurrent: boolean;
  logsForZone: Vehicle['stage_logs'];
  isCompleted: boolean;
  isBypassed: boolean;
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
 * Pure, bulletproof state engine:
 * 1. Traversed stages: Ordered chronologically by stage_logs (Entry -> Exit).
 *    - Visited & Task Done -> COMPLETED (DONE)
 *    - Visited & Dispatched without Done -> BYPASSED (stays right in the traversal history)
 *    - Active Current Stage -> ACTIVE or IDLE
 * 2. Unvisited stages (Never entered): Placed at the bottom.
 *    - Vehicle reached Inspection / Finished -> SKIPPED
 *    - Vehicle still in progress -> PENDING
 * 3. Connectors:
 *    - Completed -> Green line to next entered node
 *    - Bypassed -> Red line to next entered node
 *    - Active Working -> Half Blue line
 *    - Active Idle (Task Done) -> Amber line
 *    - To unvisited bottom node -> None (Default gray)
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

  const stageDefMap = new Map<BayZone, StageDefinition>();
  masterStages.forEach(s => {
    stageDefMap.set(s.zone, {
      ...s,
      isRequired: isRequiredForZone(s.zone),
    });
  });

  // Sort logs strictly by chronological entry time
  const sortedLogs = [...vehicle.stage_logs].sort((a, b) => {
    const timeA = new Date(a.entered_at).getTime() || 0;
    const timeB = new Date(b.entered_at).getTime() || 0;
    return timeA - timeB;
  });

  // Track which zones have been entered
  const enteredZones = new Set<BayZone>();
  sortedLogs.forEach(l => enteredZones.add(l.to_zone));

  type PreNode = Omit<TimelineStageNode, 'connectorType' | 'isLastInOrder'>;
  const traversedNodes: PreNode[] = [];

  sortedLogs.forEach((log, logIdx) => {
    const stageDef = stageDefMap.get(log.to_zone) || {
      zone: log.to_zone,
      name: log.to_zone,
      icon: null,
      color: '#666',
      isRequired: isRequiredForZone(log.to_zone),
    };

    const isCurrent = !log.exited_at && vehicle.current_zone === log.to_zone;
    const isInspection = log.to_zone === 'inspection';

    if (isInspection) {
      traversedNodes.push({
        id: log.id || `inspection-${logIdx}`,
        stageDef,
        status: 'ready',
        isCurrent,
        logsForZone: [log],
        isCompleted: Boolean(log.exited_at) || vehicle.is_finished,
        isBypassed: false,
        isCancelled: false,
        isInspection: true,
        isStageIdle: false,
        spentStr: '',
        breakNotes: [],
        queueNotes: [],
        workCompletedAt: null,
      });
      return;
    }

    const bayTaskType = getTaskTypeForBay(stageDef.zone);
    const currentTask =
      vehicle.tasks.find(t => t.task_type === bayTaskType && t.is_required) ||
      vehicle.tasks.find(t => t.task_type === bayTaskType);
    const isTaskActuallyDone = Boolean(currentTask?.is_completed);
    const rawCompletedAt = isTaskActuallyDone ? currentTask?.completed_at : null;

    const isExited = Boolean(log.exited_at);
    const completedTimeMs = rawCompletedAt ? new Date(rawCompletedAt).getTime() : Number.NaN;
    const exitTimeMs = log.exited_at ? new Date(log.exited_at).getTime() : Infinity;

    // Resilient re-visit check: task was only done in this visit if completed on or before this visit exited
    const wasCompletedInThisVisit = !Number.isNaN(completedTimeMs) && completedTimeMs <= exitTimeMs;
    const workCompletedAt = wasCompletedInThisVisit ? rawCompletedAt : null;

    const isCompleted = isExited && !isCurrent && wasCompletedInThisVisit;
    const isBypassed = isExited && !isCurrent && !wasCompletedInThisVisit;

    const isStageIdle = Boolean(
      isCurrent && !log.exited_at && (!log.work_started_at || Boolean(workCompletedAt))
    );

    let status: TimelineNodeStatus = 'pending';
    if (isCompleted) {
      status = 'completed';
    } else if (isBypassed) {
      status = 'bypassed';
    } else if (isCurrent) {
      status = isStageIdle ? 'idle' : 'active';
    }

    const breakdown = getStageDurationBreakdown(
      log.entered_at,
      log.exited_at,
      log.work_started_at,
      log.idle_seconds,
      workCompletedAt
    );

    const breakNotes: string[] = [];
    const queueNotes: string[] = [];
    if (breakdown.breakNote) breakNotes.push(breakdown.breakNote);
    if (breakdown.queueNote) queueNotes.push(breakdown.queueNote);

    const spentStr = isCurrent ? activeStageDuration : formatDurationString(breakdown.netSec, true);

    traversedNodes.push({
      id: log.id || `${log.to_zone}-${logIdx}`,
      stageDef,
      status,
      isCurrent,
      logsForZone: [log],
      isCompleted,
      isBypassed,
      isCancelled: false,
      isInspection: false,
      isStageIdle,
      spentStr,
      breakNotes,
      queueNotes,
      workCompletedAt,
    });
  });

  // Collect unvisited stages (stages that were never entered at all)
  const isWorkflowAtEnd = vehicle.current_zone === 'inspection' || vehicle.is_finished;
  const unvisitedNodes: PreNode[] = [];

  masterStages.forEach(s => {
    if (s.zone === 'inspection') return; // Handled separately below
    if (!enteredZones.has(s.zone) && isRequiredForZone(s.zone)) {
      const stageDef = stageDefMap.get(s.zone)!;
      unvisitedNodes.push({
        id: `unvisited-${s.zone}`,
        stageDef,
        status: isWorkflowAtEnd ? 'skipped' : 'pending',
        isCurrent: false,
        logsForZone: [],
        isCompleted: false,
        isBypassed: false,
        isCancelled: isWorkflowAtEnd, // If already at inspection/finished without entering, it was skipped
        isInspection: false,
        isStageIdle: false,
        spentStr: '',
        breakNotes: [],
        queueNotes: [],
        workCompletedAt: null,
      });
    }
  });

  // If inspection was never entered yet, add it as the final pending node
  if (!enteredZones.has('inspection')) {
    const inspectionDef = stageDefMap.get('inspection') || {
      zone: 'inspection' as BayZone,
      name: 'Inspection',
      icon: null,
      color: '#666',
      isRequired: true,
    };
    unvisitedNodes.push({
      id: 'unvisited-inspection',
      stageDef: inspectionDef,
      status: 'pending',
      isCurrent: vehicle.current_zone === 'inspection',
      logsForZone: [],
      isCompleted: false,
      isBypassed: false,
      isCancelled: false,
      isInspection: true,
      isStageIdle: false,
      spentStr: '',
      breakNotes: [],
      queueNotes: [],
      workCompletedAt: null,
    });
  }

  const allPreNodes: PreNode[] = [...traversedNodes, ...unvisitedNodes];

  // Resolve connectors and last-in-order flag cleanly
  return allPreNodes.map((node, idx) => {
    const isLastInOrder = idx === allPreNodes.length - 1;
    const nextNode = allPreNodes[idx + 1];
    const isNextEntered = Boolean(nextNode && nextNode.logsForZone && nextNode.logsForZone.length > 0);

    let connectorType: TimelineConnectorType = 'none';

    if (!isLastInOrder && !node.isInspection) {
      if (node.status === 'completed') {
        // Dispatched with task completed -> 100% Green line connecting to next stage
        connectorType = 'completed';
      } else if (node.status === 'bypassed') {
        // Dispatched without task completed -> 100% Red line connecting to next stage
        connectorType = 'bypassed';
      } else if (node.status === 'idle') {
        if (node.workCompletedAt) {
          // Task Done (Waiting Dispatch / Queue-Out) -> 100% Amber/Done line
          connectorType = 'idle_done';
        } else {
          // Waiting to Start (Queue-In) -> Line has not started filling yet (stays background gray)
          connectorType = 'none';
        }
      } else if (node.status === 'active') {
        // Work Started & In Progress -> Line fills 50% Blue
        connectorType = 'working';
      }
    }

    return {
      ...node,
      connectorType,
      isLastInOrder,
    };
  });
};
