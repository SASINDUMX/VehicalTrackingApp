import { useState, useEffect, useMemo } from "react";
import { useVehicles } from "../context/VehicleContext";
import { usePermissions } from "./usePermissions";
import { getRoleBay, getTechName } from "../constants/bays";
import { BayZone, TaskType } from "../types/vehicle";
import { matchesVehicleSearch } from "../utils/searchUtils";
import { getTaskTypeForBay, getActiveStageNetSeconds, computeVehicleTimersMap, sortWorkshopVehicles } from "../utils/vehicleUtils";

export interface PendingTransfer {
  vehicleId: string;
  vehicleNo: string;
  targetZone: BayZone;
  targetZoneName: string;
  autoCompleteTaskName?: string | null;
}

export const useTechnicianStation = () => {
  const { vehicles, activeTab, toggleTaskCompletion, transferVehicleZone, startStageWork, isLoading, searchQuery, showMyVehiclesOnly, setSelectedVehicle } = useVehicles();
  const { canMarkTaskDone, canTransferVehicle, canStartWork, currentRole, displayName } = usePermissions();

  const activeBay: BayZone = (activeTab === 'hoist' || activeTab === 'alignment') ? activeTab : 'workshop';
  const techName = displayName;
  const activeTaskType: TaskType = getTaskTypeForBay(activeBay);

  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null);
  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [startingWorkVehicleIds, setStartingWorkVehicleIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleStartWork = async (vehicleId: string) => {
    if (startingWorkVehicleIds[vehicleId]) return;
    setStartingWorkVehicleIds(prev => ({ ...prev, [vehicleId]: true }));
    try {
      await startStageWork(vehicleId, techName);
    } finally {
      setStartingWorkVehicleIds(prev => {
        const next = { ...prev };
        delete next[vehicleId];
        return next;
      });
    }
  };

  const handleRequestTransfer = (
    vehicleId: string,
    vehicleNo: string,
    targetZone: BayZone,
    targetZoneName: string,
    autoCompleteTaskName?: string | null
  ) => {
    if (isDispatching) return;
    setPendingTransfer({ vehicleId, vehicleNo, targetZone, targetZoneName, autoCompleteTaskName });
  };

  const handleConfirmTransfer = async () => {
    if (pendingTransfer && !isDispatching) {
      setIsDispatching(true);
      try {
        const success = await transferVehicleZone(pendingTransfer.vehicleId, pendingTransfer.targetZone, pendingTransfer.targetZoneName, techName);
        if (success) {
          setPendingTransfer(null);
        }
      } finally {
        setIsDispatching(false);
      }
    }
  };

  const bayVehicles = useMemo(() => {
    const list = vehicles.filter(v => {
      const matchesBay = v.current_zone === activeBay && !v.is_finished;
      return matchesBay && matchesVehicleSearch(v.vehicle_no, searchQuery);
    });
    return sortWorkshopVehicles(list);
  }, [vehicles, activeBay, searchQuery]);

  const [elapsedTimes, setElapsedTimes] = useState<Record<string, string>>(() => computeVehicleTimersMap(bayVehicles));

  useEffect(() => {
    const updateTimers = () => {
      setElapsedTimes(computeVehicleTimersMap(bayVehicles));
    };

    updateTimers();
    const interval = setInterval(updateTimers, 1000);

    return () => clearInterval(interval);
  }, [bayVehicles]);

  return {
    activeBay,
    techName,
    activeTaskType,
    bayVehicles,
    elapsedTimes,
    expandedCards,
    pendingTransfer,
    isDispatching,
    isLoading,
    searchQuery,
    showMyVehiclesOnly,
    currentRole,
    canMarkTaskDone,
    canTransferVehicle,
    canStartWork,
    startingWorkVehicleIds,
    toggleExpand,
    toggleTaskCompletion,
    startStageWork,
    handleStartWork,
    setSelectedVehicle,
    setPendingTransfer,
    handleRequestTransfer,
    handleConfirmTransfer,
  };
};
