import { useState, useMemo } from "react";
import { useVehicles } from "../context/VehicleContext";
import { usePermissions } from "./usePermissions";
import { matchesVehicleSearch } from "../utils/searchUtils";

export const useAdvisorInspection = () => {
  const { vehicles, finishVehicleJobSheet, setSelectedVehicle, searchQuery, showMyVehiclesOnly, isLoading } = useVehicles();
  const { canFinishJob } = usePermissions();
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const readyVehicles = useMemo(() => {
    const slDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
    const startOfToday = new Date(`${slDateStr}T00:00:00+05:30`);

    return vehicles.filter(v => {
      const isReady = v.current_zone === "inspection" && !v.is_finished;
      if (!isReady) return false;
      const d = new Date(v.intake_at || v.created_at);
      // Auto-clear: previous-day inspection vehicles are automatically rolled over
      if (!Number.isNaN(d.getTime()) && d < startOfToday) {
        return false;
      }
      return matchesVehicleSearch(v.vehicle_no, searchQuery);
    });
  }, [vehicles, searchQuery]);

  return {
    readyVehicles,
    expandedCards,
    searchQuery,
    showMyVehiclesOnly,
    canFinishJob,
    toggleExpand,
    finishVehicleJobSheet,
    setSelectedVehicle,
    isLoading,
  };
};
