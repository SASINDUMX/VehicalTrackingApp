import { useState } from "react";
import { useVehicles } from "../context/VehicleContext";
import { usePermissions } from "./usePermissions";
import { matchesVehicleSearch } from "../utils/searchUtils";

export const useAdvisorInspection = () => {
  const { vehicles, finishVehicleJobSheet, setSelectedVehicle, searchQuery } = useVehicles();
  const { canFinishJob } = usePermissions();
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const readyVehicles = vehicles
    .filter(v => {
      const isReady = v.current_zone === "inspection" && !v.is_finished;
      return isReady && matchesVehicleSearch(v.vehicle_no, searchQuery);
    });

  return {
    readyVehicles,
    expandedCards,
    searchQuery,
    canFinishJob,
    toggleExpand,
    finishVehicleJobSheet,
    setSelectedVehicle,
  };
};
