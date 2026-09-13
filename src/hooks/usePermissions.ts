import { useAuth } from '../context/AuthContext';
import { BayZone, UserRole, ForemanSection } from '../types/vehicle';
import { hasCapability, canForemanWorkInZone, AppCapability } from '../constants/permissions';

export const usePermissions = () => {
  const { userProfile } = useAuth();
  const role: UserRole = userProfile?.role ?? 'service_executive';
  const section: ForemanSection | string = userProfile?.section ?? 'car';

  // 1. Classification Flags
  const isSuperAdmin = role === 'super_admin';
  const isWorkshopManager = role === 'workshop_manager';
  const isForeman = role === 'foreman';
  const isAdvisor = role === 'advisor';
  const isMasterAccess = ['super_admin', 'service_executive', 'agm', 'job_controller'].includes(role);

  // 2. Generic capability checker
  const check = (capability: AppCapability) => hasCapability(role, capability);

  return {
    // Role Tiers
    isSuperAdmin,
    isMasterAccess,
    isWorkshopManager,
    isForeman,
    isAdvisor,
    section,

    // Core Permissions (driven 100% by src/constants/permissions.ts)
    canSwitchBranch: check('switch_branch'),
    canViewAuditLogs: check('view_audit_logs'),
    canAddVehicle: check('add_vehicle'),
    canDeleteVehicle: check('delete_vehicle'),
    canRelocateVehicle: check('relocate_vehicle'),
    canEditRemarks: check('edit_remarks'),
    canSetUrgent: check('set_urgent'),
    canBookmark: check('bookmark'),
    canTransferVehicle: check('transfer_vehicle'),
    canFinishJob: check('finish_job'),

    // Labor Actions (Starting Work & Task Completion per zone)
    canStartWork: (bayZone: BayZone): boolean => canForemanWorkInZone(role, section, bayZone),
    canMarkTaskDone: (bayZone: BayZone): boolean => canForemanWorkInZone(role, section, bayZone),

    currentRole: role,
    displayName: userProfile?.display_name ?? 'User',
  };
};

