import React from 'react';
import { VehicleNoteModal, VehicleNoteModalProps } from './VehicleNoteModal';

export interface UrgentNoteModalProps {
  visible: boolean;
  vehicleNo: string;
  note: string;
  onClose: () => void;
  remarks?: string | null;
}

export const UrgentNoteModal: React.FC<UrgentNoteModalProps> = ({
  visible,
  vehicleNo,
  note,
  onClose,
  remarks,
}) => {
  return (
    <VehicleNoteModal
      visible={visible}
      vehicleNo={vehicleNo}
      isUrgent={true}
      urgentNote={note}
      remarks={remarks}
      onClose={onClose}
    />
  );
};
