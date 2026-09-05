import { useState, useEffect } from "react";
import { useVehicles } from "../context/VehicleContext";
import { usePermissions } from "./usePermissions";
import { useTheme } from "../context/ThemeContext";
import { BayZone } from "../types/vehicle";
import { Wrench, Droplets, Navigation, CheckCircle } from "lucide-react-native";
import { matchesVehicleSearch } from "../utils/searchUtils";
import { getActiveStageNetSeconds, computeVehicleTimersMap } from "../utils/vehicleUtils";

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
    { id: "workshop", name: "General Service Bay", code: "BAY 01", icon: Wrench, color: colors.bayWorkshop },
    { id: "alignment", name: "Wheel Alignment Bay", code: "BAY 02", icon: Navigation, color: colors.bayAlignment },
    { id: "hoist", name: "Hoist Service Bay", code: "BAY 03", icon: Droplets, color: colors.bayHoist },
    { id: "inspection", name: "Advisor Inspection Zone", code: "FINAL", icon: CheckCircle, color: colors.bayInspection },
  ];

  const getVehiclesInZone = (zoneId: BayZone) => {
    const list = vehicles.filter(v => {
      const matchesZone = v.current_zone === zoneId && !v.is_finished;
      if (!searchQuery.trim()) return matchesZone;
      const matchesSearch = matchesVehicleSearch(v.vehicle_no, searchQuery) || v.assigned_tech.toLowerCase().includes(searchQuery.toLowerCase().trim());
      return matchesZone && matchesSearch;
    });

    return list.sort((a, b) => {
      const lastLogA = a.stage_logs[a.stage_logs.length - 1];
      const lastLogB = b.stage_logs[b.stage_logs.length - 1];
      const timeA = lastLogA?.entered_at ? new Date(lastLogA.entered_at).getTime() : new Date(a.intake_at).getTime();
      const timeB = lastLogB?.entered_at ? new Date(lastLogB.entered_at).getTime() : new Date(b.intake_at).getTime();
      return timeA - timeB;
    });
  };

  const isSearchActive = searchQuery.trim() !== "";

  const totalMatchingVehicles = vehicles.filter(v => {
    if (v.is_finished) return false;
    return matchesVehicleSearch(v.vehicle_no, searchQuery) || v.assigned_tech.toLowerCase().includes(searchQuery.toLowerCase().trim());
  }).length;

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
