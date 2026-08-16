import { useState, useEffect, useMemo } from "react";
import { useVehicles } from "../context/VehicleContext";
import { usePermissions } from "./usePermissions";
import { getRoleBay, getTechName } from "../constants/bays";
import { BayZone, TaskType } from "../types/vehicle";
import { matchesVehicleSearch } from "../utils/searchUtils";
import { getTaskTypeForBay } from "../utils/vehicleUtils";

import { getNetWorkingSeconds, getCurrentActiveBreak } from "../utils/workshopHoursUtils";

export interface PendingTransfer {
  vehicleId: string;
  vehicleNo: string;
  targetZone: BayZone;
  targetZoneName: string;
}

const computeVehicleTimersMap = (vehicleList: any[]) => {
  const updated: Record<string, string> = {};
  const now = new Date();
  const activeBreak = getCurrentActiveBreak(now);

  vehicleList.forEach((v) => {
    const lastLog = v.stage_logs[v.stage_logs.length - 1];
    if (lastLog && !lastLog.exited_at) {
      const netSec = getNetWorkingSeconds(lastLog.entered_at, now);
      const hours = Math.floor(netSec / 3600);
      const mins = Math.floor((netSec % 3600) / 60);
      const secs = netSec % 60;
      const padSec = secs < 10 ? `0${secs}` : `${secs}`;
      const timeStr = hours > 0 ? `${hours}h ${mins}m ${padSec}s` : `${mins}m ${padSec}s`;
      if (activeBreak) {
        updated[v.id] = `⏸ ${timeStr} (${activeBreak.name})`;
      } else {
        updated[v.id] = timeStr;
      }
    } else {
      updated[v.id] = "0m 00s";
    }
  });

  return updated;
};

export const useTechnicianStation = () => {
  const { vehicles, currentRole, toggleTaskCompletion, transferVehicleZone, isLoading, searchQuery, setSelectedVehicle } = useVehicles();
  const { canMarkTaskDone, canTransferVehicle } = usePermissions();

  const activeBay = getRoleBay(currentRole);
  const techName = getTechName(currentRole);
  const activeTaskType: TaskType = getTaskTypeForBay(activeBay);

  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRequestTransfer = (vehicleId: string, vehicleNo: string, targetZone: BayZone, targetZoneName: string) => {
    setPendingTransfer({ vehicleId, vehicleNo, targetZone, targetZoneName });
  };

  const handleConfirmTransfer = () => {
    if (pendingTransfer) {
      transferVehicleZone(pendingTransfer.vehicleId, pendingTransfer.targetZone, techName);
      setPendingTransfer(null);
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
    isLoading,
    searchQuery,
    currentRole,
    canMarkTaskDone,
    canTransferVehicle,
    toggleExpand,
    toggleTaskCompletion,
    setSelectedVehicle,
    setPendingTransfer,
    handleRequestTransfer,
    handleConfirmTransfer,
  };
};
