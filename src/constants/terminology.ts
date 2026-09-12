import { BayZone, TaskType, UserRole } from '../types/vehicle';

export interface StationTerminology {
  id: BayZone;
  name: string;
  shortName: string;
  tabLabel: string;
  dispatchBtn: string;
  code: string;
  description: string;
}

export interface RoleTerminology {
  role: UserRole;
  title: string;
  badge: string;
  shortCode: string;
  stationId: BayZone;
}

export const APP_TERMINOLOGY = {
  navigation: {
    overview: 'Overview',
    allVehicles: 'All',
    myVehicles: 'My',
    reports: 'Reports',
    back: 'Back',
  },

  stations: {
    workshop: {
      id: 'workshop',
      name: 'Workshop Bay',
      shortName: 'Workshop',
      tabLabel: 'Workshop',
      dispatchBtn: 'Workshop',
      code: 'BAY 01',
      description: 'Periodic maintenance, fluid changes, and mechanical repairs',
    },
    alignment: {
      id: 'alignment',
      name: 'Wheel Alignment Bay',
      shortName: 'Alignment',
      tabLabel: 'Alignment',
      dispatchBtn: 'Alignment',
      code: 'BAY 02',
      description: 'Laser alignment, camber/toe balancing, and steering calibration',
    },
    hoist: {
      id: 'hoist',
      name: 'Hoist Bay',
      shortName: 'Hoist',
      tabLabel: 'Hoist',
      dispatchBtn: 'Hoist',
      code: 'BAY 03',
      description: 'Undercarriage inspection, brake line service, and exhaust overhaul',
    },
    inspection: {
      id: 'inspection',
      name: 'Advisor Inspection Zone',
      shortName: 'Final Inspection',
      tabLabel: 'Ready',
      dispatchBtn: 'Final Inspection →',
      code: 'FINAL',
      description: 'Final quality assurance, road test verification, and customer delivery',
    },
    completed: {
      id: 'completed',
      name: 'Completed',
      shortName: 'Done',
      tabLabel: 'Done',
      dispatchBtn: 'Complete',
      code: 'DONE',
      description: 'Vehicle servicing completed and handed over to customer',
    },
  } as Record<BayZone, StationTerminology>,

  sections: {
    car: { id: 'car', name: 'CAR Section', shortName: 'CAR', badge: 'CAR' },
    suv: { id: 'suv', name: 'SUV Section', shortName: 'SUV', badge: 'SUV' },
    lcv: { id: 'lcv', name: 'LCV Section', shortName: 'LCV', badge: 'LCV' },
    hoist: { id: 'hoist', name: 'Hoist Section', shortName: 'Hoist', badge: 'Hoist' },
    alignment: { id: 'alignment', name: 'Alignment Section', shortName: 'Alignment', badge: 'Align' },
  },

  roles: {
    super_admin: {
      role: 'super_admin',
      title: 'Super Administrator',
      badge: 'Super Admin',
      shortCode: 'ADMIN',
      stationId: 'workshop',
    },
    service_executive: {
      role: 'service_executive',
      title: 'Service Executive',
      badge: 'Executive',
      shortCode: 'EXEC',
      stationId: 'workshop',
    },
    agm: {
      role: 'agm',
      title: 'Assistant General Manager',
      badge: 'AGM',
      shortCode: 'AGM',
      stationId: 'workshop',
    },
    job_controller: {
      role: 'job_controller',
      title: 'Job Controller',
      badge: 'Job Controller',
      shortCode: 'JC',
      stationId: 'workshop',
    },
    workshop_manager: {
      role: 'workshop_manager',
      title: 'Workshop Manager',
      badge: 'Manager',
      shortCode: 'WM',
      stationId: 'workshop',
    },
    foreman: {
      role: 'foreman',
      title: 'Section Foreman',
      badge: 'Foreman',
      shortCode: 'FM',
      stationId: 'workshop',
    },
    advisor: {
      role: 'advisor',
      title: 'Service Advisor',
      badge: 'Advisor',
      shortCode: 'ADV',
      stationId: 'inspection',
    },
  } as Record<UserRole, RoleTerminology>,

  tasks: {
    general_service: {
      type: 'general_service' as TaskType,
      label: 'General Service',
      assignedRole: 'foreman' as UserRole,
      stationId: 'workshop' as BayZone,
    },
    wheel_alignment: {
      type: 'wheel_alignment' as TaskType,
      label: 'Wheel Alignment',
      assignedRole: 'foreman' as UserRole,
      stationId: 'alignment' as BayZone,
    },
    hoist_service: {
      type: 'hoist_service' as TaskType,
      label: 'Hoist Service',
      assignedRole: 'foreman' as UserRole,
      stationId: 'hoist' as BayZone,
    },
  },

  actions: {
    startWork: 'START WORK',
    auditLog: 'Stage Timeline Audit Log',
    fullAuditLog: 'Full Audit Log',
    deliverVehicle: 'FINISH JOB & HANDOVER VEHICLE',
    confirmHandover: 'Confirm Handover',
    confirmFinalHandover: 'Confirm Final Handover',
    confirmDispatch: 'Confirm Dispatch',
    dispatching: 'Dispatching...',
    saveJobOrder: 'Save Job Order',
    saving: 'Saving...',
    handingOver: 'Handing Over...',
    dispatchTo: 'DISPATCH TO:',
    deleteJobSheet: 'Delete Job Sheet?',
  },

  urgency: {
    badge: 'URGENT',
    bannerTitle: 'PRIORITY / URGENT VEHICLE',
    toggleActive: '⚡ URGENT VEHICLE',
    toggleInactive: 'Mark as Urgent Vehicle',
    sectionTitle: 'VEHICLE PRIORITY / URGENCY:',
    placeholder: 'Urgency reason (e.g. VIP customer, waiting in lounge, warranty recall)...',
  },

  telemetry: {
    syncing: 'SYNCING TELEMETRY...',
    calculatingMetrics: 'Calculating Performance Metrics...',
    loadingReportRecords: 'Loading historical service records from server...',
  },

  emptyStates: {
    bayClearTitle: 'Bay Currently Clear',
    bayClearSubtitle: 'No vehicles currently assigned to this station.',
    allClearedTitle: 'All Job Sheets Cleared',
    allClearedSubtitle: 'No vehicles currently pending advisor final inspection or delivery.',
    noPinnedTitle: 'No Pinned Vehicles',
    noPinnedSubtitle: 'You have not pinned any active vehicles. Click the bookmark icon on any vehicle to add it to "My Vehicles".',
    noSearchMatchTitle: (query: string) => `No matching vehicles for "${query}"`,
    noSearchMatchSubtitle: 'Try searching another license plate number.',
    noReportRecordsTitle: 'No Records Found',
    noReportRecordsSubtitle: 'No vehicles found matching the selected date and status filters.',
  },
} as const;
