import { useState, useEffect, useMemo } from "react";
import { useVehicles } from "../context/VehicleContext";
import { usePermissions } from "./usePermissions";
import { getRoleBay, getTechName } from "../constants/bays";
import { BayZone, TaskType } from "../types/vehicle";
import { matchesVehicleSearch } from "../utils/searchUtils";
import { getTaskTypeForBay, getActiveStageNetSeconds, computeVehicleTimersMap } from "../utils/vehicleUtils";

export interface PendingTransfer {
  vehicleId: string;
  vehicleNo: string;
  targetZone: BayZone;
  targetZoneName: string;
}

export const useTechnicianStation = () => {
  const { vehicles, currentRole, toggleTaskCompletion, transferVehicleZone, toggleStageTimer, startStageWork, isLoading, searchQuery, showMyVehiclesOnly, setSelectedVehicle } = useVehicles();
  const { canMarkTaskDone, canTransferVehicle, canControlTimer, canStartWork } = usePermissions();

  const activeBay = getRoleBay(currentRole);
  const techName = getTechName(currentRole);
  const activeTaskType: TaskType = getTaskTypeForBay(activeBay);

  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null);
  const [isDispatching, setIsDispatching] = useState<boolean>(false);

  const toggleExpand = (id: string) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRequestTransfer = (vehicleId: string, vehicleNo: string, targetZone: BayZone, targetZoneName: string) => {
    if (isDispatching) return;
    setPendingTransfer({ vehicleId, vehicleNo, targetZone, targetZoneName });
  };

  const handleConfirmTransfer = async () => {
    if (pendingTransfer && !isDispatching) {
      setIsDispatching(true);
      try {
        const success = await transferVehicleZone(pendingTransfer.vehicleId, pendingTransfer.targetZone, techName);
        if (success) {
          setPendingTransfer(null);
        }
      } finally {
        setIsDispatching(false);
      }
    }
  };

  const bayVehicles = useMemo(() => {
    return vehicles
      .filter(v => {
        const matchesBay = v.current_zone === activeBay && !v.is_finished;
        return matchesBay && matchesVehicleSearch(v.vehicle_no, searchQuery);
      })
      .sort((a, b) => {
        const lastLogA = a.stage_logs[a.stage_logs.length - 1];
        const lastLogB = b.stage_logs[b.stage_logs.length - 1];
        const timeA = lastLogA?.entered_at ? new Date(lastLogA.entered_at).getTime() : new Date(a.intake_at).getTime();
        const timeB = lastLogB?.entered_at ? new Date(lastLogB.entered_at).getTime() : new Date(b.intake_at).getTime();
        return timeA - timeB;
      });
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
    canControlTimer,
    canStartWork,
    toggleExpand,
    toggleTaskCompletion,
    toggleStageTimer,
    startStageWork,
    setSelectedVehicle,
    setPendingTransfer,
    handleRequestTransfer,
    handleConfirmTransfer,
  };
};
