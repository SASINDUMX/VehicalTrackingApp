import { useAuth } from '../context/AuthContext';
import { BayZone, UserRole, ForemanSection } from '../types/vehicle';

export const usePermissions = () => {
  const { userProfile } = useAuth();
  const role: UserRole = userProfile?.role ?? 'service_executive';
  const section: ForemanSection | string = userProfile?.section ?? 'car';

  // 1. Classification Flags
  const isMasterAccess = role === 'service_executive' || role === 'agm' || role === 'job_controller';
  const isWorkshopManager = role === 'workshop_manager';
  const isForeman = role === 'foreman';
  const isAdvisor = role === 'advisor';

  // 2. Zone labor capability check for Foremen
  const canWorkInZone = (bayZone: BayZone): boolean => {
    if (isMasterAccess) return true;
    if (!isForeman) return false;

    // Hoist foreman can ONLY work in Hoist
    if (section === 'hoist') {
      return bayZone === 'hoist';
    }

    // CAR, SUV, LCV, and Alignment foremen can work in BOTH Workshop and Alignment
    if (section === 'car' || section === 'suv' || section === 'lcv' || section === 'alignment') {
      return bayZone === 'workshop' || bayZone === 'alignment';
    }

    return false;
  };

  return {
    // Role Tiers
    isMasterAccess,
    isWorkshopManager,
    isForeman,
    isAdvisor,
    section,

    // Vehicle Administration (Intake, Deletion, Floor Relocation)
    canAddVehicle: isMasterAccess,
    canDeleteVehicle: isMasterAccess,
    canRelocateVehicle: isMasterAccess,

    // Remarks & Urgency Management
    // Advisors, Workshop Manager, Foremen, and Master Access can add remarks
    canEditRemarks: isMasterAccess || isWorkshopManager || isAdvisor || isForeman,
    // Advisors, Workshop Manager, and Master Access can flag urgent priority
    canSetUrgent: isMasterAccess || isWorkshopManager || isAdvisor,
    // Pinning / Bookmarks are available to all authenticated roles
    canBookmark: true,

    // Labor Actions (Starting Work & Task Completion)
    canStartWork: (bayZone: BayZone): boolean => canWorkInZone(bayZone),
    canMarkTaskDone: (bayZone: BayZone): boolean => canWorkInZone(bayZone),

    // Vehicle Transfer across sections (Master Access + all Foremen)
    canTransferVehicle: isMasterAccess || isForeman,

    // Final Handover / Inspection Delivery (Master Access + Advisors)
    canFinishJob: isMasterAccess || isAdvisor,

    currentRole: role,
    displayName: userProfile?.display_name ?? 'User',
  };
};
