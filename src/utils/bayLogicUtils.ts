import { Vehicle, BayZone, TaskType } from "../types/vehicle";
import { APP_TERMINOLOGY } from "../constants/terminology";

export interface VehicleBayStatus {
  isCurrentTaskDone: boolean;
  isStageIdle: boolean;
  isTaskRequiredForBay: boolean;
  requiredTaskTypes: TaskType[];
  canShowAlignmentBtn: boolean;
  canShowHoistBtn: boolean;
  canShowWorkshopBtn: boolean;
  canShowAdvisorBtn: boolean;
  hasAnyDispatchBtn: boolean;
  isCanDispatch: boolean;
}

/**
 * Computes station-specific dispatch permissions and task status for a vehicle.
 * Pure logic helper decoupled from UI view rendering.
 */
export const computeVehicleBayStatus = (
  vehicle: Vehicle,
  activeBay: BayZone,
  activeTaskType: TaskType,
  canTransferVehicle: boolean,
  isDispatching: boolean
): VehicleBayStatus => {
  const lastStageLog = vehicle.stage_logs[vehicle.stage_logs.length - 1];
  const isStageIdle = Boolean(lastStageLog && !lastStageLog.exited_at && !lastStageLog.work_started_at);

  const bayTask = vehicle.tasks.find(t => t.task_type === activeTaskType && t.is_required) || vehicle.tasks.find(t => t.task_type === activeTaskType);
  const isTaskRequiredForBay = Boolean(bayTask && bayTask.is_required);
  const isCurrentTaskDone = !isTaskRequiredForBay || Boolean(bayTask?.is_completed);

  const requiredTaskTypes = vehicle.tasks.filter(t => t.is_required).map(t => t.task_type);
  const isHoistRequired = requiredTaskTypes.includes('hoist_service');
  const isAlignmentRequired = requiredTaskTypes.includes('wheel_alignment');
  const isWorkshopRequired = requiredTaskTypes.includes('general_service');

  const isWorkshopDone = Boolean(vehicle.tasks.find(t => t.task_type === 'general_service')?.is_completed);
  const isHoistDone = Boolean(vehicle.tasks.find(t => t.task_type === 'hoist_service')?.is_completed);
  const isAlignmentDone = Boolean(vehicle.tasks.find(t => t.task_type === 'wheel_alignment')?.is_completed);

  // Dispatch is unlocked after START WORK, or immediately if this bay has no required task (orphan/bypassed bay)
  const isCanDispatch = canTransferVehicle && (!isTaskRequiredForBay || !isStageIdle) && !isDispatching;

  const canShowAlignmentBtn = activeBay !== 'alignment' && isAlignmentRequired && !isAlignmentDone;
  const canShowHoistBtn = activeBay !== 'hoist' && isHoistRequired && !isHoistDone;
  const canShowWorkshopBtn = activeBay !== 'workshop' && isWorkshopRequired && !isWorkshopDone;
  const canShowAdvisorBtn = activeBay !== 'inspection' && !vehicle.is_finished;
  const hasAnyDispatchBtn = canShowAlignmentBtn || canShowHoistBtn || canShowWorkshopBtn || canShowAdvisorBtn;

  return {
    isCurrentTaskDone,
    isStageIdle,
    isTaskRequiredForBay,
    requiredTaskTypes,
    canShowAlignmentBtn,
    canShowHoistBtn,
    canShowWorkshopBtn,
    canShowAdvisorBtn,
    hasAnyDispatchBtn,
    isCanDispatch,
  };
};

export interface SpatialVehicleStatus {
  isCurrentTaskDone: boolean;
  isStageIdle: boolean;
  progressPercent: number;
  completedCount: number;
  totalRequired: number;
}

/**
 * Computes spatial floor plan vehicle card status without UI styling baggage.
 */
export const computeSpatialVehicleStatus = (vehicle: Vehicle): SpatialVehicleStatus => {
  const currentBayTaskType: TaskType =
    vehicle.current_zone === 'hoist'
      ? 'hoist_service'
      : vehicle.current_zone === 'alignment'
      ? 'wheel_alignment'
      : 'general_service';

  const currentTask = vehicle.tasks.find(t => t.task_type === currentBayTaskType && t.is_required) || vehicle.tasks.find(t => t.task_type === currentBayTaskType);
  const isCurrentTaskDone = !currentTask || !currentTask.is_required || Boolean(currentTask.is_completed);

  const lastStageLog = vehicle.stage_logs[vehicle.stage_logs.length - 1];
  const isInspectionZone = vehicle.current_zone === 'inspection';
  const isStageIdle = !isInspectionZone && Boolean(lastStageLog && !lastStageLog.exited_at && !lastStageLog.work_started_at);

  const totalRequired = vehicle.tasks.filter(t => t.is_required).length;
  const completedCount = vehicle.tasks.filter(t => t.is_completed).length;
  const progressPercent = totalRequired ? Math.round((completedCount / totalRequired) * 100) : 0;

  return {
    isCurrentTaskDone,
    isStageIdle,
    progressPercent,
    completedCount,
    totalRequired,
  };
};


/**
 * Determines recommended starting station and default assigned technician based on workshop flow.
 * Pure business routing rule decoupled from modal views.
 */
export const computeRecommendedStation = (tasks: TaskType[]): { zone: BayZone; tech: string } => {
  if (tasks.includes('general_service')) {
    return { zone: 'workshop', tech: APP_TERMINOLOGY.stations.workshop.name };
  }
  if (tasks.includes('wheel_alignment')) {
    return { zone: 'alignment', tech: APP_TERMINOLOGY.stations.alignment.name };
  }
  if (tasks.includes('hoist_service')) {
    return { zone: 'hoist', tech: APP_TERMINOLOGY.stations.hoist.name };
  }
  return { zone: 'workshop', tech: APP_TERMINOLOGY.stations.workshop.name };
};
