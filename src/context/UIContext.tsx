import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { hapticService } from '../lib/haptics';

export interface VehicleNoteModalData {
  vehicleNo: string;
  isUrgent?: boolean;
  urgentNote?: string | null;
  remarks?: string | null;
}

// Keep UrgentModalData alias for backwards compatibility
export type UrgentModalData = VehicleNoteModalData;

export interface UIContextType {
  // Modal Visibility Flags
  isAddModalOpen: boolean;
  setIsAddModalOpen: (open: boolean) => void;
  isConfigModalOpen: boolean;
  setIsConfigModalOpen: (open: boolean) => void;
  isReportsModalOpen: boolean;
  setIsReportsModalOpen: (open: boolean) => void;
  activeReportsTab: 'kpi' | 'audit';
  setActiveReportsTab: (tab: 'kpi' | 'audit') => void;
  isCalculationInfoOpen: boolean;
  setIsCalculationInfoOpen: (open: boolean) => void;

  // Search Query
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Filter: All vs My (Pinned) Vehicles
  showMyVehiclesOnly: boolean;
  setShowMyVehiclesOnly: (show: boolean) => void;

  // Vehicle Note / Urgent Callout Modal
  vehicleNoteModalData: VehicleNoteModalData | null;
  showVehicleNotes: (data: VehicleNoteModalData) => void;
  hideVehicleNotes: () => void;

  // Backwards compatibility aliases
  urgentModalData: VehicleNoteModalData | null;
  showUrgentNote: (vehicleNo: string, note?: string | null) => void;
  hideUrgentNote: () => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const UIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [isReportsModalOpen, setIsReportsModalOpen] = useState<boolean>(false);
  const [activeReportsTab, setActiveReportsTab] = useState<'kpi' | 'audit'>('kpi');
  const [isCalculationInfoOpen, setIsCalculationInfoOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showMyVehiclesOnly, setShowMyVehiclesOnly] = useState<boolean>(false);
  const [vehicleNoteModalData, setVehicleNoteModalData] = useState<VehicleNoteModalData | null>(null);

  const showVehicleNotes = useCallback((data: VehicleNoteModalData) => {
    try { hapticService.triggerLightHaptic(); } catch { /* ignore */ }
    setVehicleNoteModalData(data);
  }, []);

  const hideVehicleNotes = useCallback(() => {
    setVehicleNoteModalData(null);
  }, []);

  const showUrgentNote = useCallback((vehicleNo: string, note?: string | null) => {
    showVehicleNotes({ vehicleNo, isUrgent: true, urgentNote: note || '' });
  }, [showVehicleNotes]);

  const hideUrgentNote = useCallback(() => {
    hideVehicleNotes();
  }, [hideVehicleNotes]);

  return (
    <UIContext.Provider
      value={{
        isAddModalOpen,
        setIsAddModalOpen,
        isConfigModalOpen,
        setIsConfigModalOpen,
        isReportsModalOpen,
        setIsReportsModalOpen,
        activeReportsTab,
        setActiveReportsTab,
        isCalculationInfoOpen,
        setIsCalculationInfoOpen,
        searchQuery,
        setSearchQuery,
        showMyVehiclesOnly,
        setShowMyVehiclesOnly,
        vehicleNoteModalData,
        showVehicleNotes,
        hideVehicleNotes,
        urgentModalData: vehicleNoteModalData,
        showUrgentNote,
        hideUrgentNote,
      }}
    >
      {children}
    </UIContext.Provider>
  );
};

export const useUI = (): UIContextType => {
  const ctx = useContext(UIContext);
  if (!ctx) {
    throw new Error('useUI must be used within an UIProvider');
  }
  return ctx;
};
