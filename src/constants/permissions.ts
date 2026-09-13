import { UserRole, BayZone, ForemanSection } from '../types/vehicle';

/**
 * Capability identifiers for granular, declarative permission management.
 */
export type AppCapability =
  | 'switch_branch'           // Switch active company branch
  | 'view_audit_logs'          // View comprehensive Activity & Audit logs
  | 'add_vehicle'              // Create new vehicle intake
  | 'delete_vehicle'           // Permanently delete a vehicle
  | 'relocate_vehicle'        // Manually move vehicle between stations
  | 'edit_remarks'             // Add and edit vehicle remarks / notes
  | 'set_urgent'               // Flag or unflag urgent priority
  | 'bookmark'                 // Pin / unpin vehicles
  | 'transfer_vehicle'         // Dispatch / transfer vehicles across bays
  | 'finish_job';              // Advisor final handover and delivery

/**
 * Centralized Declarative Permissions Matrix.
 * To add, remove, or modify a capability for ANY role in the entire application,
 * simply change the allowed roles array right here in this single place!
 */
export const ROLE_CAPABILITIES: Record<AppCapability, readonly UserRole[]> = {
  // STRICTLY Super Admin only:
  switch_branch: ['super_admin'] as const,
  view_audit_logs: ['super_admin'] as const,

  // Vehicle Intake & Core Administration
  add_vehicle: ['super_admin', 'service_executive', 'agm', 'job_controller'] as const,
  delete_vehicle: ['super_admin', 'service_executive', 'agm', 'job_controller'] as const,
  relocate_vehicle: ['super_admin', 'service_executive', 'agm', 'job_controller'] as const,

  // Remarks & Urgency Management
  edit_remarks: ['super_admin', 'service_executive', 'agm', 'job_controller', 'workshop_manager', 'foreman', 'advisor'] as const,
  set_urgent: ['super_admin', 'service_executive', 'agm', 'job_controller', 'workshop_manager', 'advisor'] as const,
  bookmark: ['super_admin', 'service_executive', 'agm', 'job_controller', 'workshop_manager', 'foreman', 'advisor'] as const,

  // Station Labor Transfers & Handover
  transfer_vehicle: ['super_admin', 'service_executive', 'agm', 'job_controller', 'foreman'] as const,
  finish_job: ['super_admin', 'service_executive', 'agm', 'job_controller', 'advisor'] as const,
};

/**
 * Helper to check if a given role has a specific capability.
 */
export const hasCapability = (role: UserRole, capability: AppCapability): boolean => {
  const allowed = ROLE_CAPABILITIES[capability];
  return allowed ? allowed.includes(role) : false;
};

/**
 * Validates whether a foreman section can perform labor in a target bay.
 */
export const canForemanWorkInZone = (
  role: UserRole,
  section: ForemanSection | string,
  bayZone: BayZone
): boolean => {
  // Master / Admin roles have universal floor access
  if (['super_admin', 'service_executive', 'agm', 'job_controller'].includes(role)) {
    return true;
  }
  if (role !== 'foreman') {
    return false;
  }

  // Hoist foreman can ONLY work in Hoist bay
  if (section === 'hoist') {
    return bayZone === 'hoist';
  }

  // CAR, SUV, LCV, and Alignment foremen can work in both Workshop and Alignment
  if (section === 'car' || section === 'suv' || section === 'lcv' || section === 'alignment') {
    return bayZone === 'workshop' || bayZone === 'alignment';
  }

  return false;
};
