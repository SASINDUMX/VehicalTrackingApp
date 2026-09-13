export interface AuditFieldDiff {
  old: any;
  new: any;
}

export type AuditActionType =
  | 'VEHICLE_CREATED'
  | 'PLATE_MODIFIED'
  | 'REMARKS_MODIFIED'
  | 'HOLD_OVERRIDE_PAUSED'
  | 'HOLD_OVERRIDE_RESUMED'
  | 'URGENCY_MODIFIED'
  | 'BAY_TRANSFERRED'
  | 'SECTION_TRANSFER'
  | 'TECH_REASSIGNED'
  | 'JOB_COMPLETED'
  | 'TASK_COMPLETED'
  | 'BOOKING_METADATA_MODIFIED'
  | 'BOOKING_TOGGLED'
  | 'ADDITIONAL_REPAIRS_TOGGLED'
  | 'STATUS_CHANGED'
  | 'DELETE_VEHICLE'
  | 'USER_ROLE_CHANGED'
  | 'UPDATE';

export type AuditActionCategory =
  | 'all'
  | 'holds'
  | 'urgency'
  | 'plate'
  | 'remarks'
  | 'transfers'
  | 'intake_delete'
  | 'completions'
  | 'users';

export interface AuditLogEntry {
  id: string;
  created_at: string;
  action_timestamp?: string;
  is_offline_sync?: boolean;
  branch_id: string;
  entity_type: string;
  entity_id: string;
  vehicle_no: string | null;
  action: AuditActionType | string;
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  actor_role: string | null;
  changed_fields: Record<string, AuditFieldDiff>;
  old_values: Record<string, any>;
  new_values: Record<string, any>;
  total_count?: number;
}

export interface AuditLogQueryParams {
  branchId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  category?: AuditActionCategory;
  limit?: number;
  offset?: number;
}
