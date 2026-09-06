import { useState, useEffect, useCallback, useMemo } from "react";
import { useVehicles } from "../context/VehicleContext";
import { usePermissions } from "./usePermissions";
import { useTheme } from "../context/ThemeContext";
import { BayZone } from "../types/vehicle";
import { Wrench, Droplets, Navigation, CheckCircle } from "lucide-react-native";
import { matchesVehicleSearch } from "../utils/searchUtils";
import { getActiveStageNetSeconds, computeVehicleTimersMap, sortWorkshopVehicles } from "../utils/vehicleUtils";
import { APP_TERMINOLOGY } from "../constants/terminology";

export interface BayItem {
  id: BayZone;
  name: string;
  code: string;
  icon: any;
  color: string;
}

export const useFloorPlan = () => {
  const { vehicles, setSelectedVehicle, setIsAddModalOpen, isAddModalOpen, isLoading, searchQuery, showMyVehiclesOnly } = useVehicles();
  const { canAddVehicle } = usePermissions();
  const { colors } = useTheme();
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, string>>(() => computeVehicleTimersMap(vehicles));

  useEffect(() => {
    const updateTimers = () => {
      setElapsedTimes(computeVehicleTimersMap(vehicles));
    };

    updateTimers();
    const interval = setInterval(updateTimers, 1000);
    return () => clearInterval(interval);
  }, [vehicles]);

  const bays: BayItem[] = [
    { id: "workshop", name: APP_TERMINOLOGY.stations.workshop.name, code: APP_TERMINOLOGY.stations.workshop.code, icon: Wrench, color: colors.bayWorkshop },
    { id: "alignment", name: APP_TERMINOLOGY.stations.alignment.name, code: APP_TERMINOLOGY.stations.alignment.code, icon: Navigation, color: colors.bayAlignment },
    { id: "hoist", name: APP_TERMINOLOGY.stations.hoist.name, code: APP_TERMINOLOGY.stations.hoist.code, icon: Droplets, color: colors.bayHoist },
    { id: "inspection", name: APP_TERMINOLOGY.stations.inspection.name, code: APP_TERMINOLOGY.stations.inspection.code, icon: CheckCircle, color: colors.bayInspection },
  ];

  const getVehiclesInZone = useCallback((zoneId: BayZone, isPinnedFn?: (id: string) => boolean) => {
    const list = vehicles.filter(v => {
      const matchesZone = v.current_zone === zoneId && !v.is_finished;
      if (!searchQuery.trim()) return matchesZone;
      const tech = (v.assigned_tech || '').toLowerCase();
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = matchesVehicleSearch(v.vehicle_no, searchQuery) || tech.includes(q);
      return matchesZone && matchesSearch;
    });

    return sortWorkshopVehicles(list, isPinnedFn);
  }, [vehicles, searchQuery]);

  const isSearchActive = searchQuery.trim() !== "";

  const totalMatchingVehicles = useMemo(() => {
    return vehicles.filter(v => {
      if (v.is_finished) return false;
      const tech = (v.assigned_tech || '').toLowerCase();
      const q = searchQuery.toLowerCase().trim();
      return matchesVehicleSearch(v.vehicle_no, searchQuery) || tech.includes(q);
    }).length;
  }, [vehicles, searchQuery]);

  return {
    bays,
    elapsedTimes,
    isLoading,
    searchQuery,
    showMyVehiclesOnly,
    isSearchActive,
    totalMatchingVehicles,
    canAddVehicle,
    isAddModalOpen,
    setSelectedVehicle,
    setIsAddModalOpen,
    getVehiclesInZone,
  };
};
