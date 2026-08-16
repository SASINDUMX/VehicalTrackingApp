import { Vehicle, VehicleTask, BayZone, TaskType } from "../types/vehicle";

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

export const calculateTotalIntakeSec = (vehicle: Vehicle): number => {
  if (!vehicle || !vehicle.intake_at) return 0;
  const start = new Date(vehicle.intake_at).getTime();
  if (isNaN(start)) return 0;

  const end = vehicle.completed_at ? new Date(vehicle.completed_at).getTime() : Date.now();
  return Math.max(0, Math.floor((end - start) / 1000));
};

export const formatTotalTATString = (vehicle: Vehicle): string => {
  const sec = calculateTotalIntakeSec(vehicle);
  const hours = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);

  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
};
