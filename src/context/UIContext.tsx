import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { hapticService } from '../lib/haptics';

export interface UrgentModalData {
  vehicleNo: string;
  note: string;
}

export interface UIContextType {
  // Modal Visibility Flags
  isAddModalOpen: boolean;
  setIsAddModalOpen: (open: boolean) => void;
  isConfigModalOpen: boolean;
  setIsConfigModalOpen: (open: boolean) => void;
  isReportsModalOpen: boolean;
  setIsReportsModalOpen: (open: boolean) => void;

  // Search Query
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Urgent Note Callout Modal
  urgentModalData: UrgentModalData | null;
  showUrgentNote: (vehicleNo: string, note?: string | null) => void;
  hideUrgentNote: () => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const UIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [isReportsModalOpen, setIsReportsModalOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [urgentModalData, setUrgentModalData] = useState<UrgentModalData | null>(null);

  const showUrgentNote = useCallback((vehicleNo: string, note?: string | null) => {
    try { hapticService.triggerLightHaptic(); } catch { /* ignore */ }
    setUrgentModalData({ vehicleNo, note: note || '' });
  }, []);

  const hideUrgentNote = useCallback(() => {
    setUrgentModalData(null);
  }, []);

  return (
    <UIContext.Provider
      value={{
        isAddModalOpen,
        setIsAddModalOpen,
        isConfigModalOpen,
        setIsConfigModalOpen,
        isReportsModalOpen,
        setIsReportsModalOpen,
        searchQuery,
        setSearchQuery,
        urgentModalData,
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
