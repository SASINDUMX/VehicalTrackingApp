import React, { useMemo, ReactNode } from 'react';
import { Vehicle, UserRole, NavigationTab, BayZone, TaskType } from '../types/vehicle';
import { DateFilterPreset } from '../utils/reportExportUtils';
import { useUI, UrgentModalData } from './UIContext';
import { VehicleStateProvider, useVehicleState, VehicleStateContextType } from './VehicleStateContext';
import { VehicleDispatchProvider, useVehicleDispatch, VehicleDispatchContextType } from './VehicleDispatchContext';

// Export child context hooks and types for direct decoupled usage
export { useVehicleState, VehicleStateContextType } from './VehicleStateContext';
export { useVehicleDispatch, VehicleDispatchContextType } from './VehicleDispatchContext';

export interface VehicleContextType extends VehicleStateContextType, VehicleDispatchContextType {
  // UI / Modal States (Composed from UIContext for 100% Backward Compatibility)
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
  reportsRefreshTrigger: number;
  triggerReportsRefresh: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  showMyVehiclesOnly: boolean;
  setShowMyVehiclesOnly: (show: boolean) => void;
  urgentModalData: UrgentModalData | null;
  vehicleNoteModalData: UrgentModalData | null;
  showVehicleNotes: (data: UrgentModalData) => void;
  hideVehicleNotes: () => void;
  showUrgentNote: (vehicleNo: string, note?: string | null) => void;
  hideUrgentNote: () => void;
}

/**
 * Composite Provider: Composes VehicleStateProvider and VehicleDispatchProvider.
 * Provides 100% backward-compatible single provider wrapper for App.tsx.
 */
export const VehicleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <VehicleStateProvider>
      <VehicleDispatchProvider>
        {children}
      </VehicleDispatchProvider>
    </VehicleStateProvider>
  );
};

/**
 * Backward-Compatible Unified Hook:
 * Merges reactive vehicle state, memoized dispatchers, and UI context.
 * For zero-rerender performance, components can now selectively import:
 * - useVehicleState() for read-only displays
 * - useVehicleDispatch() for action triggers and buttons
 */
export const useVehicles = (): VehicleContextType => {
  const state = useVehicleState();
  const dispatch = useVehicleDispatch();
  const ui = useUI();

  return useMemo<VehicleContextType>(
    () => ({
      // Reactive State Slice
      ...state,

      // Stable Action Dispatchers Slice
      ...dispatch,

      // UI Context Passthrough for 100% Backward Compatibility
      isAddModalOpen: ui.isAddModalOpen,
      setIsAddModalOpen: ui.setIsAddModalOpen,
      isConfigModalOpen: ui.isConfigModalOpen,
      setIsConfigModalOpen: ui.setIsConfigModalOpen,
      isReportsModalOpen: ui.isReportsModalOpen,
      setIsReportsModalOpen: ui.setIsReportsModalOpen,
      activeReportsTab: ui.activeReportsTab,
      setActiveReportsTab: ui.setActiveReportsTab,
      isCalculationInfoOpen: ui.isCalculationInfoOpen,
      setIsCalculationInfoOpen: ui.setIsCalculationInfoOpen,
      reportsRefreshTrigger: ui.reportsRefreshTrigger,
      triggerReportsRefresh: ui.triggerReportsRefresh,
      searchQuery: ui.searchQuery,
      setSearchQuery: ui.setSearchQuery,
      showMyVehiclesOnly: ui.showMyVehiclesOnly,
      setShowMyVehiclesOnly: ui.setShowMyVehiclesOnly,
      urgentModalData: ui.urgentModalData,
      vehicleNoteModalData: ui.vehicleNoteModalData,
      showVehicleNotes: ui.showVehicleNotes,
      hideVehicleNotes: ui.hideVehicleNotes,
      showUrgentNote: ui.showUrgentNote,
      hideUrgentNote: ui.hideUrgentNote,
    }),
    [state, dispatch, ui]
  );
};
