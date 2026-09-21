import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { Vehicle, UserRole, NavigationTab, BayZone, VehicleTask, StageLog } from '../types/vehicle';
import { safeStorage, isSupabaseConnected } from '../lib/supabase';
import { vehicleService } from '../services/vehicleService';
import { realtimeVehicleService } from '../services/realtimeVehicleService';
import { outboxService } from '../services/outboxService';
import { chimeService } from '../lib/chime';
import { hapticService } from '../lib/haptics';
import { useAuth } from './AuthContext';
import { deduplicateTasks } from '../utils/vehicleUtils';

export interface VehicleStateContextType {
  vehicles: Vehicle[];
  selectedVehicle: Vehicle | null;
  currentRole: UserRole;
  activeTab: NavigationTab;
  isLoading: boolean;
  isRealtimeConnected: boolean;
  outboxPendingCount: number;
  isOutboxSyncing: boolean;
}

export interface VehicleInternalContextType {
  setVehicles: React.Dispatch<React.SetStateAction<Vehicle[]>>;
  setSelectedVehicle: (vehicle: Vehicle | null) => void;
  setCurrentRole: (role: UserRole) => void;
  setActiveTab: (tab: NavigationTab) => void;
  vehiclesRef: React.MutableRefObject<Vehicle[]>;
  activeTabRef: React.MutableRefObject<NavigationTab>;
  currentRoleRef: React.MutableRefObject<UserRole>;
  selectedVehicleStateRef: React.MutableRefObject<Vehicle | null>;
  locallyCreatedVehiclesRef: React.MutableRefObject<Set<string>>;
  isMountedRef: React.MutableRefObject<boolean>;
  debouncedRefetch: () => void;
  fetchSupabaseData: (isInitialLoad?: boolean) => Promise<void>;
}

export const VehicleStateContext = createContext<VehicleStateContextType | undefined>(undefined);
export const VehicleInternalContext = createContext<VehicleInternalContextType | undefined>(undefined);

export const VehicleStateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { activeBranchId } = useAuth();
  const [currentRole, setCurrentRole] = useState<UserRole>('service_executive');
  const [activeTab, setActiveTab] = useState<NavigationTab>('overview');

  const currentRoleRef = useRef<UserRole>(currentRole);
  const activeTabRef = useRef<NavigationTab>(activeTab);
  useEffect(() => {
    currentRoleRef.current = currentRole;
  }, [currentRole]);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // Reactive selection
  const [selectedVehicleState, setSelectedVehicleState] = useState<Vehicle | null>(null);
  const selectedVehicleStateRef = useRef<Vehicle | null>(null);
  useEffect(() => {
    selectedVehicleStateRef.current = selectedVehicleState;
  }, [selectedVehicleState]);

  // Vehicles Domain State with Offline Cache Hydration
  const [vehicles, setVehicles] = useState<Vehicle[]>(() => {
    try {
      const cached = safeStorage.getItem('um_cached_vehicles');
      if (cached) return JSON.parse(cached);
    } catch {
      /* ignore cache read error */
    }
    return [];
  });

  const vehiclesRef = useRef<Vehicle[]>(vehicles);
  useEffect(() => {
    vehiclesRef.current = vehicles;
  }, [vehicles]);

  const selectedVehicle = useMemo(() => {
    if (!selectedVehicleState) return null;
    return vehicles.find(v => v.id === selectedVehicleState.id) || selectedVehicleState;
  }, [vehicles, selectedVehicleState]);

  const [isLoading, setIsLoading] = useState<boolean>(() => isSupabaseConnected);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState<boolean>(false);

  const isMountedRef = useRef<boolean>(true);
  const realtimeDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const locallyCreatedVehiclesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    };
  }, []);

  // 1. Live Data Fetch via Service Repository
  const fetchSupabaseData = useCallback(async (isInitialLoad = false) => {
    if (!isSupabaseConnected) {
      if (isMountedRef.current) {
        setVehicles(prev => {
          const now = new Date();
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const cleaned = prev
            .map(v => {
              const d = new Date(v.intake_at || v.created_at);
              if (!v.is_finished && !Number.isNaN(d.getTime()) && d < startOfToday) {
                if (v.current_zone === 'inspection') {
                  return {
                    ...v,
                    current_zone: 'completed' as BayZone,
                    is_finished: true,
                    completed_at: now.toISOString(),
                  };
                }
                return null;
              }
              return v;
            })
            .filter((v): v is Vehicle => v !== null);
          safeStorage.setItem('um_cached_vehicles', JSON.stringify(cleaned));
          return cleaned;
        });
      }
      if (isInitialLoad && isMountedRef.current) setIsLoading(false);
      return;
    }

    try {
      const formatted = await vehicleService.fetchLiveVehicles(activeBranchId);
      if (isMountedRef.current) {
        setVehicles(formatted);
        safeStorage.setItem('um_cached_vehicles', JSON.stringify(formatted));
        setIsRealtimeConnected(true);
      }
    } catch (err) {
      console.warn('[VehicleStateContext] Supabase fetch fallback to local cache:', err);
      if (isMountedRef.current) setIsRealtimeConnected(false);
    } finally {
      if (isInitialLoad && isMountedRef.current) setIsLoading(false);
    }
  }, [activeBranchId]);

  const debouncedRefetch = useCallback(() => {
    if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    realtimeDebounceRef.current = setTimeout(() => {
      fetchSupabaseData(false);
    }, 300);
  }, [fetchSupabaseData]);

  // Outbox subscription
  const [outboxPendingCount, setOutboxPendingCount] = useState<number>(() => outboxService.getPendingCount());
  const [isOutboxSyncing, setIsOutboxSyncing] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = outboxService.subscribe((count, syncing) => {
      setOutboxPendingCount(count);
      setIsOutboxSyncing(syncing);
    });
    return unsubscribe;
  }, []);

  // Realtime subscription outside the UI tree
  useEffect(() => {
    fetchSupabaseData(true);

    const unsubscribe = realtimeVehicleService.subscribeToBranch(activeBranchId, {
      onInsert: async newV => {
        if (!isMountedRef.current) return;
        const vehicleId = newV.id as string;
        const vehicleNo = typeof newV.vehicle_no === 'string' ? newV.vehicle_no.trim().toUpperCase() : '';

        if (locallyCreatedVehiclesRef.current.has(vehicleId) || (vehicleNo && locallyCreatedVehiclesRef.current.has(vehicleNo))) {
          return;
        }

        const targetZone = newV.current_zone as BayZone;
        const currentTab = activeTabRef.current;
        if (targetZone === currentTab || currentTab === 'overview') {
          try { chimeService.playArrivalChime(); } catch { /* ignore */ }
          try { hapticService.triggerArrivalHaptic(); } catch { /* ignore */ }
        }

        const fullVehicle = await vehicleService.fetchVehicleById(vehicleId);
        if (isMountedRef.current) {
          if (fullVehicle && (!fullVehicle.branch_id || fullVehicle.branch_id === activeBranchId)) {
            setVehicles(prev => {
              if (prev.some(v => v.id === fullVehicle.id)) {
                return prev.map(v => (v.id === fullVehicle.id ? fullVehicle : v));
              }
              return [fullVehicle, ...prev];
            });
          } else {
            debouncedRefetch();
          }
        }
      },
      onUpdate: updated => {
        if (!isMountedRef.current) return;
        const targetZone = updated.current_zone as BayZone;
        const currentTab = activeTabRef.current;

        const prevV = vehiclesRef.current.find(v => v.id === updated.id);
        if (prevV && prevV.current_zone !== targetZone && (targetZone === currentTab || currentTab === 'overview')) {
          try { chimeService.playArrivalChime(); } catch { /* ignore */ }
          try { hapticService.triggerArrivalHaptic(); } catch { /* ignore */ }
        }

        setVehicles(prev =>
          prev.map(v => {
            if (v.id !== updated.id) return v;
            return {
              ...v,
              vehicle_no: updated.vehicle_no as string,
              current_zone: targetZone,
              technician_name: (updated.technician_name as string | null) ?? v.technician_name,
              assigned_tech: (updated.assigned_tech as string) || v.assigned_tech,
              remarks: (updated.remarks as string) ?? v.remarks,
              is_booking: (updated.is_booking as boolean) ?? v.is_booking,
              has_additional_repairs: (updated.has_additional_repairs as boolean) ?? v.has_additional_repairs,
              completed_at: updated.completed_at as string | null,
              is_finished: updated.is_finished as boolean,
              status: (updated.status as 'active' | 'finished' | 'incomplete') || v.status,
              is_urgent: (updated.is_urgent as boolean) ?? v.is_urgent,
              urgent_note: (updated.urgent_note as string) ?? v.urgent_note,
              is_paused: (updated.is_paused as boolean) ?? v.is_paused,
              paused_at: (updated.paused_at as string | null) ?? v.paused_at,
              paused_seconds: (updated.paused_seconds as number) ?? v.paused_seconds,
              pause_reason: (updated.pause_reason as string | null) ?? v.pause_reason,
              effective_completed_at: (updated.effective_completed_at as string | null) ?? v.effective_completed_at,
            };
          })
        );
      },
      onDelete: deletedId => {
        if (!isMountedRef.current) return;
        setVehicles(prev => prev.filter(v => v.id !== deletedId));
        if (selectedVehicleStateRef.current?.id === deletedId) {
          setSelectedVehicleState(null);
        }
      },
      onTaskChange: (eventType, taskData) => {
        if (!isMountedRef.current) return;
        if (!vehiclesRef.current.some(v => v.id === taskData.vehicle_id)) return;

        setVehicles(prev =>
          prev.map(v => {
            if (v.id !== taskData.vehicle_id) return v;
            if (eventType === 'INSERT') {
              // Reconcile optimistic tasks (with temporary 'task-' ID or matching task_type)
              const existingIdx = v.tasks.findIndex(
                t => t.id === taskData.id || t.task_type === taskData.task_type
              );
              let newTasks: VehicleTask[];
              if (existingIdx !== -1) {
                newTasks = [...v.tasks];
                const existing = newTasks[existingIdx];
                newTasks[existingIdx] = {
                  ...existing,
                  ...taskData,
                  is_completed: typeof taskData.is_completed === 'boolean' ? taskData.is_completed : existing.is_completed,
                  completed_at: taskData.completed_at !== undefined ? taskData.completed_at : existing.completed_at,
                  completed_by: taskData.completed_by !== undefined ? taskData.completed_by : existing.completed_by,
                };
              } else {
                newTasks = [...v.tasks, taskData];
              }
              return { ...v, tasks: deduplicateTasks(newTasks) };
            }
            if (eventType === 'DELETE') {
              return { ...v, tasks: v.tasks.filter(t => t.id !== taskData.id) };
            }
            const updatedTasks = v.tasks.map(t => {
              if (t.id !== taskData.id && t.task_type !== taskData.task_type) return t;
              return {
                ...t,
                id: taskData.id || t.id,
                is_completed: typeof taskData.is_completed === 'boolean' ? taskData.is_completed : t.is_completed,
                completed_at: taskData.completed_at !== undefined ? taskData.completed_at : t.completed_at,
                completed_by: taskData.completed_by !== undefined ? taskData.completed_by : t.completed_by,
                is_required: typeof taskData.is_required === 'boolean' ? taskData.is_required : t.is_required,
                task_name: taskData.task_name || t.task_name,
                task_type: taskData.task_type || t.task_type,
              };
            });
            return { ...v, tasks: deduplicateTasks(updatedTasks) };
          })
        );
      },
      onStageLogChange: (eventType, logData) => {
        if (!isMountedRef.current) return;
        if (!vehiclesRef.current.some(v => v.id === logData.vehicle_id)) return;

        setVehicles(prev =>
          prev.map(v => {
            if (v.id !== logData.vehicle_id) return v;
            if (eventType === 'INSERT') {
              if (v.stage_logs.some(l => l.id === logData.id)) return v;
              const tempLogIndex = v.stage_logs.findIndex(
                l => l.id.startsWith('log-') && l.to_zone === logData.to_zone
              );
              if (tempLogIndex !== -1) {
                const reconciledLogs = [...v.stage_logs];
                reconciledLogs[tempLogIndex] = logData;
                return { ...v, stage_logs: reconciledLogs };
              }
              if (v.stage_logs.some(l => l.to_zone === logData.to_zone && l.entered_at === logData.entered_at)) {
                return v;
              }
              return { ...v, stage_logs: [...v.stage_logs, logData] };
            }
            if (eventType === 'DELETE') {
              return { ...v, stage_logs: v.stage_logs.filter(l => l.id !== logData.id) };
            }
            const updatedLogs = v.stage_logs.map(l => {
              if (l.id !== logData.id) return l;
              return {
                ...l,
                work_started_at: logData.work_started_at !== undefined ? logData.work_started_at : l.work_started_at,
                idle_seconds: typeof logData.idle_seconds === 'number' ? logData.idle_seconds : l.idle_seconds,
                exited_at: logData.exited_at !== undefined ? logData.exited_at : l.exited_at,
                duration_seconds: typeof logData.duration_seconds === 'number' ? logData.duration_seconds : l.duration_seconds,
                to_zone: logData.to_zone || l.to_zone,
                from_zone: logData.from_zone !== undefined ? logData.from_zone : l.from_zone,
              };
            });
            return { ...v, stage_logs: updatedLogs };
          })
        );
      },
      onStatusChange: isConnected => {
        if (isMountedRef.current) setIsRealtimeConnected(isConnected);
      },
    });

    return unsubscribe;
  }, [fetchSupabaseData, debouncedRefetch, activeBranchId]);

  // Midnight Rollover
  useEffect(() => {
    let timer: NodeJS.Timeout;
    const scheduleMidnightRefresh = () => {
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      const msUntilMidnight = Math.max(1000, nextMidnight.getTime() - now.getTime());

      timer = setTimeout(() => {
        fetchSupabaseData(false);
        scheduleMidnightRefresh();
      }, msUntilMidnight);
    };

    scheduleMidnightRefresh();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [fetchSupabaseData]);

  const stateValue = useMemo<VehicleStateContextType>(
    () => ({
      vehicles,
      selectedVehicle,
      currentRole,
      activeTab,
      isLoading,
      isRealtimeConnected,
      outboxPendingCount,
      isOutboxSyncing,
    }),
    [
      vehicles,
      selectedVehicle,
      currentRole,
      activeTab,
      isLoading,
      isRealtimeConnected,
      outboxPendingCount,
      isOutboxSyncing,
    ]
  );

  const internalValue = useMemo<VehicleInternalContextType>(
    () => ({
      setVehicles,
      setSelectedVehicle: setSelectedVehicleState,
      setCurrentRole,
      setActiveTab,
      vehiclesRef,
      activeTabRef,
      currentRoleRef,
      selectedVehicleStateRef,
      locallyCreatedVehiclesRef,
      isMountedRef,
      debouncedRefetch,
      fetchSupabaseData,
    }),
    [debouncedRefetch, fetchSupabaseData]
  );

  return (
    <VehicleStateContext.Provider value={stateValue}>
      <VehicleInternalContext.Provider value={internalValue}>
        {children}
      </VehicleInternalContext.Provider>
    </VehicleStateContext.Provider>
  );
};

export const useVehicleState = (): VehicleStateContextType => {
  const ctx = useContext(VehicleStateContext);
  if (!ctx) {
    throw new Error('useVehicleState must be used within a VehicleStateProvider');
  }
  return ctx;
};
