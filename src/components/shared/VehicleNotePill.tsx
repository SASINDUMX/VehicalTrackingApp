import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { StatusPill } from './StatusPill';
import { useVehicles } from '../../context/VehicleContext';
import { Vehicle } from '../../types/vehicle';

interface VehicleNotePillProps {
  vehicle?: Partial<Vehicle> | null;
  vehicleNo?: string;
  isUrgent?: boolean;
  urgentNote?: string | null;
  remarks?: string | null;
  size?: 'sm' | 'md';
  compact?: boolean;
}

export const VehicleNotePill: React.FC<VehicleNotePillProps> = ({
  vehicle,
  vehicleNo,
  isUrgent: propIsUrgent,
  urgentNote: propUrgentNote,
  remarks: propRemarks,
  size = 'md',
  compact = false,
}) => {
  const { showVehicleNotes } = useVehicles();

  const activeVehicleNo = vehicle?.vehicle_no ?? vehicleNo ?? '';
  const isUrgent = Boolean(vehicle?.is_urgent ?? propIsUrgent);
  const urgentNote = vehicle?.urgent_note ?? propUrgentNote ?? null;
  const remarks = vehicle?.remarks ?? propRemarks ?? null;
  const hasRemarks = Boolean(remarks && remarks.trim().length > 0);

  // If neither urgent nor remarks, render nothing
  if (!isUrgent && !hasRemarks) {
    return null;
  }

  const handlePress = () => {
    showVehicleNotes({
      vehicleNo: activeVehicleNo,
      isUrgent,
      urgentNote,
      remarks,
    });
  };

  const urgentLabel = compact ? '⚡' : '⚡ URGENT';
  const remarksLabel = compact ? '📝' : '📝 REMARKS';

  // If urgent (even if remarks also exist), prioritize urgent badge
  if (isUrgent) {
    return (
      <TouchableOpacity
        onPress={handlePress}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        activeOpacity={0.7}
      >
        <StatusPill variant="URGENT" label={urgentLabel} size={size} />
      </TouchableOpacity>
    );
  }

  // Remarks only
  return (
    <TouchableOpacity
      onPress={handlePress}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      activeOpacity={0.7}
    >
      <StatusPill variant="REMARKS" label={remarksLabel} size={size} />
    </TouchableOpacity>
  );
};
