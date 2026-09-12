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

  const bays: BayItem[] = useMemo(() => [
    { id: "workshop", name: APP_TERMINOLOGY.stations.workshop.name, code: APP_TERMINOLOGY.stations.workshop.code, icon: Wrench, color: colors.bayWorkshop },
    { id: "alignment", name: APP_TERMINOLOGY.stations.alignment.name, code: APP_TERMINOLOGY.stations.alignment.code, icon: Navigation, color: colors.bayAlignment },
    { id: "hoist", name: APP_TERMINOLOGY.stations.hoist.name, code: APP_TERMINOLOGY.stations.hoist.code, icon: Droplets, color: colors.bayHoist },
    { id: "inspection", name: APP_TERMINOLOGY.stations.inspection.name, code: APP_TERMINOLOGY.stations.inspection.code, icon: CheckCircle, color: colors.bayInspection },
  ], [colors]);

  // Single-pass memoized zone grouping (prevents re-filtering and re-sorting 4x per render)
  const vehiclesByZone = useMemo(() => {
    const map = new Map<BayZone, import('../types/vehicle').Vehicle[]>();
    const q = searchQuery.toLowerCase().trim();
    const hasSearch = q.length > 0;

    const filtered = vehicles.filter(v => {
      if (v.is_finished) return false;
      if (!hasSearch) return true;
      const tech = (v.assigned_tech || '').toLowerCase();
      return matchesVehicleSearch(v.vehicle_no, searchQuery) || tech.includes(q);
    });

    (['workshop', 'hoist', 'alignment', 'inspection'] as BayZone[]).forEach(z => {
      const bayList = filtered.filter(v => v.current_zone === z);
      map.set(z, sortWorkshopVehicles(bayList));
    });

    return map;
  }, [vehicles, searchQuery]);

  const getVehiclesInZone = useCallback((zoneId: BayZone, isPinnedFn?: (id: string) => boolean) => {
    const list = vehiclesByZone.get(zoneId) || [];
    if (!isPinnedFn) return list;
    return sortWorkshopVehicles(list, isPinnedFn);
  }, [vehiclesByZone]);

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
    elapsedTimes: {} as Record<string, string>,
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
