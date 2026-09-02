export type BayZone = 'workshop' | 'hoist' | 'alignment' | 'inspection' | 'completed';

export type UserRole = 
  | 'supervisor'       // Job Supervisor (Intake & Add Vehicle)
  | 'tech_workshop'    // Technician 1 (General Workshop)
  | 'tech_hoist'       // Technician 2 (Hoist Bay)
  | 'tech_alignment'   // Technician 3 (Wheel Alignment Bay)
  | 'advisor';         // Service Advisor (Final inspection & finish)

export type TaskType = 'general_service' | 'hoist_service' | 'wheel_alignment';

export interface VehicleTask {
  id: string;
  vehicle_id: string;
  task_name: string;
  task_type: TaskType;
  is_required: boolean;
  is_completed: boolean;
  completed_at?: string | null;
  completed_by?: string | null;
}

export interface StageLog {
  id: string;
  vehicle_id: string;
  from_zone?: BayZone | null;
  to_zone: BayZone;
  entered_at: string;
  exited_at?: string | null;
  duration_seconds: number;
  moved_by?: string;
  is_paused?: boolean;
  paused_at?: string | null;
  paused_seconds?: number;
  work_started_at?: string | null;
  idle_seconds?: number;
}

export interface Vehicle {
  id: string;
  vehicle_no: string;
  current_zone: BayZone;
  assigned_tech: string;
  remarks: string;
  intake_at: string;
  completed_at?: string | null;
  is_finished: boolean;
  created_at: string;
  status?: 'active' | 'finished' | 'incomplete';
  is_urgent?: boolean;
  urgent_note?: string | null;
  tasks: VehicleTask[];
  stage_logs: StageLog[];
  is_paused?: boolean;
  paused_at?: string | null;
  paused_seconds?: number;
  // 2D animation coordinates (x %, y %)
  position?: { x: number; y: number };
}

export interface BayConfig {
  id: BayZone;
  title: string;
  shortCode: string;
  iconName: string;
  color: string;
  bgGlow: string;
  borderColor: string;
  assignedRole: UserRole;
  coords: { x: number; y: number; width: number; height: number };
}
