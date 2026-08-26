import { useAuth } from '../context/AuthContext';
import { BayZone } from '../types/vehicle';

export const usePermissions = () => {
  const { userProfile } = useAuth();
  const role = userProfile?.role;

  return {
    canAddVehicle: role === 'supervisor',
    canDeleteVehicle: role === 'supervisor',
    canRelocateVehicle: role === 'supervisor',
    canMarkTaskDone: (bayZone: BayZone): boolean => {
      if (role === 'supervisor') return true;
      if (role === 'tech_workshop' && bayZone === 'workshop') return true;
      if (role === 'tech_hoist' && bayZone === 'hoist') return true;
      if (role === 'tech_alignment' && bayZone === 'alignment') return true;
      return false;
    },
    canTransferVehicle: (role?.startsWith('tech_') ?? false) || role === 'supervisor',
    canFinishJob: role === 'advisor' || role === 'supervisor',
    canControlTimer: (bayZone: BayZone): boolean => {
      if (role === 'supervisor') return true;
      if (role === 'tech_workshop' && bayZone === 'workshop') return true;
      if (role === 'tech_hoist' && bayZone === 'hoist') return true;
      if (role === 'tech_alignment' && bayZone === 'alignment') return true;
      if (role === 'advisor' && bayZone === 'inspection') return true;
      return false;
    },
    currentRole: role ?? 'supervisor',
    displayName: userProfile?.display_name ?? 'User',
  };
};
