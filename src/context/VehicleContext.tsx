import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { Vehicle, VehicleTask, StageLog, BayZone, UserRole, NavigationTab, TaskType } from '../types/vehicle';
import { getRoleBay } from '../constants/bays';
import { APP_TERMINOLOGY } from '../constants/terminology';
import { supabase, isSupabaseConnected } from '../lib/supabase';
import { safeStorage } from '../lib/supabase';
import { chimeService } from '../lib/chime';
import { hapticService } from '../lib/haptics';
import { vehicleService } from '../services/vehicleService';
import { getBreakOverlap } from '../utils/workshopHoursUtils';
import { useUI, UrgentModalData } from './UIContext';

// Safe in-app console logger for non-blocking error display
const showError = (title: string, message: string) => {
  console.warn(`[${title}] ${message}`);
};

export interface VehicleContextType {
  vehicles: Vehicle[];
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  selectedVehicle: Vehicle | null;
  setSelectedVehicle: (vehicle: Vehicle | null) => void;

  // UI / Modal States (Composed from UIContext for 100% Backward Compatibility)
  isAddModalOpen: boolean;
  setIsAddModalOpen: (open: boolean) => void;
  isConfigModalOpen: boolean;
  setIsConfigModalOpen: (open: boolean) => void;
  isReportsModalOpen: boolean;
  setIsReportsModalOpen: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  showMyVehiclesOnly: boolean;
  setShowMyVehiclesOnly: (show: boolean) => void;
  urgentModalData: UrgentModalData | null;
  vehicleNoteModalData: UrgentModalData | null;
  showVehicleNotes: (data: UrgentModalData) => void;
  hideVehicleNotes: () => void;
  showUrgentNote: (vehicleNo: string, note?: string | null) => void;
  hideUrgentNote: () => void;

  // Domain Actions (Optimistic State + Repository Execution)
  addVehicle: (
    vehicleNo: string,
    tasks: TaskType[],
    targetZone: BayZone,
    assignedTech: string,
    remarks: string,
    isUrgent?: boolean,
    urgentNote?: string | null
  ) => Promise<void>;
  updateVehicleJobOrder: (
    vehicleId: string,
    updatedTaskTypes: TaskType[],
    updatedRemarks: string,
    urgencyData?: { is_urgent: boolean; urgent_note: string | null }
  ) => Promise<void>;
  toggleTaskCompletion: (
    vehicleId: string,
    taskId: string,
    completedBy?: string
  ) => Promise<void>;
  transferVehicleZone: (
    vehicleId: string,
    targetZone: BayZone,
    targetZoneName: string,
    techName?: string
  ) => Promise<boolean>;
  startStageWork: (
    vehicleId: string,
    startedBy: string
  ) => Promise<boolean>;
  finishVehicleJobSheet: (
    vehicleId: string,
    advisorName: string
  ) => Promise<boolean>;
  deleteVehicle: (vehicleId: string) => Promise<void>;
  updateUrgency: (
    vehicleId: string,
    isUrgent: boolean,
    note?: string | null
  ) => Promise<void>;
  refreshVehicles: () => Promise<void>;
  fetchHistoricalVehicles: (datePreset: 'today' | 'yesterday' | '7days' | 'month' | '3months') => Promise<Vehicle[]>;

  // Telemetry & Network Status
  isLoading: boolean;
  isRealtimeConnected: boolean;
}

const VehicleContext = createContext<VehicleContextType | undefined>(undefined);

export const VehicleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const ui = useUI();
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

  // Reactive Derived Selection
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
    } catch { /* ignore cache read error */ }
    return [];
  });

  // Selected vehicle reactively mirrors the live domain object
  const selectedVehicle = useMemo(() => {
    if (!selectedVehicleState) return null;
    return vehicles.find(v => v.id === selectedVehicleState.id) || selectedVehicleState;
  }, [vehicles, selectedVehicleState]);

  const setSelectedVehicle = useCallback((vehicle: Vehicle | null) => {
    setSelectedVehicleState(vehicle);
  }, []);

  const [isLoading, setIsLoading] = useState<boolean>(() => isSupabaseConnected);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState<boolean>(false);

  const isMountedRef = useRef<boolean>(true);
  const realtimeDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const locallyCreatedVehiclesRef = useRef<Set<string>>(new Set());
  const vehiclesRef = useRef<Vehicle[]>(vehicles);
  useEffect(() => {
    vehiclesRef.current = vehicles;
  }, [vehicles]);

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
        // Offline reconciliation: clean overnight vehicles from local state & cache
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
      const formatted = await vehicleService.fetchLiveVehicles();
      if (isMountedRef.current) {
        setVehicles(formatted);
        safeStorage.setItem('um_cached_vehicles', JSON.stringify(formatted));
        setIsRealtimeConnected(true);
      }
    } catch (err) {
      console.warn('[VehicleContext] Supabase fetch fallback to local cache:', err);
      if (isMountedRef.current) setIsRealtimeConnected(false);
    } finally {
      if (isInitialLoad && isMountedRef.current) setIsLoading(false);
    }
  }, []);

  // Debounced refetch collapses rapid realtime events into one fetch
  const debouncedRefetch = useCallback(() => {
    if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    realtimeDebounceRef.current = setTimeout(() => {
      fetchSupabaseData(false);
    }, 300);
  }, [fetchSupabaseData]);

  // 2. Realtime Subscriptions & Initial Mount
  useEffect(() => {
    // Initial fetch of floor data (midnight rollover and retention are handled 100% autonomously by PostgreSQL pg_cron)
    fetchSupabaseData(true);

    const client = supabase;
    if (client && isSupabaseConnected) {
      const channel = client
        .channel('public:vehicle_changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vehicles' }, async (payload) => {
          if (payload.new && isMountedRef.current) {
            const newV = payload.new as Record<string, unknown>;
            const vehicleId = newV.id as string;
            const vehicleNo = typeof newV.vehicle_no === 'string' ? newV.vehicle_no.trim().toUpperCase() : '';

            // Suppress duplicate fetch if this client created the vehicle locally (already fetched & mapped by createVehicle)
            if (locallyCreatedVehiclesRef.current.has(vehicleId) || (vehicleNo && locallyCreatedVehiclesRef.current.has(vehicleNo))) {
              return;
            }

            const targetZone = newV.current_zone as BayZone;
            const currentTab = activeTabRef.current;

            if (targetZone === currentTab || currentTab === 'overview') {
              try { chimeService.playArrivalChime(); } catch { /* ignore */ }
              try { hapticService.triggerArrivalHaptic(); } catch { /* ignore */ }
            }

            // Fetch the newly inserted vehicle with tasks and logs immediately to prevent blank cards
            const fullVehicle = await vehicleService.fetchVehicleById(vehicleId);
            if (isMountedRef.current) {
              if (fullVehicle) {
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
          }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vehicles' }, (payload) => {
          if (payload.new && isMountedRef.current) {
            const updated = payload.new as Record<string, unknown>;
            const targetZone = updated.current_zone as BayZone;
            const currentTab = activeTabRef.current;

            const prevV = vehiclesRef.current.find(v => v.id === updated.id);
            if (prevV && prevV.current_zone !== targetZone && (targetZone === currentTab || currentTab === 'overview')) {
              try { chimeService.playArrivalChime(); } catch { /* ignore */ }
              try { hapticService.triggerArrivalHaptic(); } catch { /* ignore */ }
            }

            setVehicles(prev => prev.map(v => {
              if (v.id !== updated.id) return v;
              return {
                ...v,
                vehicle_no: updated.vehicle_no as string,
                current_zone: targetZone,
                assigned_tech: (updated.assigned_tech as string) || v.assigned_tech,
                remarks: (updated.remarks as string) ?? v.remarks,
                completed_at: updated.completed_at as string | null,
                is_finished: updated.is_finished as boolean,
                status: (updated.status as 'active' | 'finished' | 'incomplete') || v.status,
                is_urgent: (updated.is_urgent as boolean) ?? v.is_urgent,
                urgent_note: (updated.urgent_note as string) ?? v.urgent_note,
                is_paused: (updated.is_paused as boolean) ?? v.is_paused,
                paused_at: (updated.paused_at as string | null) ?? v.paused_at,
                paused_seconds: (updated.paused_seconds as number) ?? v.paused_seconds,
                effective_completed_at: (updated.effective_completed_at as string | null) ?? v.effective_completed_at,
              };
            }));
          }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'vehicles' }, (payload) => {
          if (payload.old && isMountedRef.current) {
            const deletedId = (payload.old as { id: string }).id;
            setVehicles(prev => prev.filter(v => v.id !== deletedId));
            if (selectedVehicleStateRef.current?.id === deletedId) {
              setSelectedVehicleState(null);
            }
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_tasks' }, (payload) => {
          if (!isMountedRef.current) return;
          const taskData = (payload.new || payload.old) as VehicleTask | null;
          if (!taskData?.vehicle_id || !taskData?.id) return;

          setVehicles(prev => prev.map(v => {
            if (v.id !== taskData.vehicle_id) return v;

            if (payload.eventType === 'INSERT') {
              if (v.tasks.some(t => t.id === taskData.id)) return v;
              return { ...v, tasks: [...v.tasks, taskData] };
            }

            if (payload.eventType === 'DELETE') {
              return { ...v, tasks: v.tasks.filter(t => t.id !== taskData.id) };
            }

            // UPDATE (or default)
            const updatedTasks = v.tasks.map(t => {
              if (t.id !== taskData.id) return t;
              return {
                ...t,
                is_completed: typeof taskData.is_completed === 'boolean' ? taskData.is_completed : t.is_completed,
                completed_at: taskData.completed_at !== undefined ? taskData.completed_at : t.completed_at,
                completed_by: taskData.completed_by !== undefined ? taskData.completed_by : t.completed_by,
                is_required: typeof taskData.is_required === 'boolean' ? taskData.is_required : t.is_required,
                task_name: taskData.task_name || t.task_name,
                task_type: taskData.task_type || t.task_type,
              };
            });
            return { ...v, tasks: updatedTasks };
          }));
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'stage_logs' }, (payload) => {
          if (!isMountedRef.current) return;
          const logData = (payload.new || payload.old) as StageLog | null;
          if (!logData?.vehicle_id || !logData?.id) return;

          setVehicles(prev => prev.map(v => {
            if (v.id !== logData.vehicle_id) return v;

            if (payload.eventType === 'INSERT') {
              // 1. If log ID already exists, do not duplicate
              if (v.stage_logs.some(l => l.id === logData.id)) return v;

              // 2. Reconcile temporary local optimistic log (`log-xxx`) for the same zone and vehicle
              const tempLogIndex = v.stage_logs.findIndex(
                l => l.id.startsWith('log-') && l.to_zone === logData.to_zone
              );

              if (tempLogIndex !== -1) {
                const reconciledLogs = [...v.stage_logs];
                reconciledLogs[tempLogIndex] = logData;
                return { ...v, stage_logs: reconciledLogs };
              }

              // 3. Fallback deduplication: do not append if a log with same to_zone and identical entered_at exists
              if (v.stage_logs.some(l => l.to_zone === logData.to_zone && l.entered_at === logData.entered_at)) {
                return v;
              }

              return { ...v, stage_logs: [...v.stage_logs, logData] };
            }

            if (payload.eventType === 'DELETE') {
              return { ...v, stage_logs: v.stage_logs.filter(l => l.id !== logData.id) };
            }

            // UPDATE (or default)
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
          }));
        })
        .subscribe((status) => {
          if (isMountedRef.current) {
            setIsRealtimeConnected(status === 'SUBSCRIBED');
          }
        });

      return () => {
        client.removeChannel(channel);
      };
    }
  }, [fetchSupabaseData, debouncedRefetch]);

  // 2b. Midnight Rollover: Automatically reconciles and resets bays at 12:00:01 AM every day
  useEffect(() => {
    let timer: NodeJS.Timeout;
    const scheduleMidnightRefresh = () => {
      const now = new Date();
      // Calculate next midnight in local time
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      const msUntilMidnight = Math.max(1000, nextMidnight.getTime() - now.getTime());

      timer = setTimeout(() => {
        // Backend pg_cron runs reconcile_daily_vehicles() at 00:00. Client simply refreshes UI.
        fetchSupabaseData(false);
        scheduleMidnightRefresh();
      }, msUntilMidnight);
    };

    scheduleMidnightRefresh();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [fetchSupabaseData]);

  // 3. ADD VEHICLE (Optimistic + Service)
  const addVehicle = useCallback(async (
    vehicleNo: string,
    tasks: TaskType[],
    targetZone: BayZone,
    assignedTech: string,
    remarks: string,
    isUrgent = false,
    urgentNote: string | null = null
  ) => {
    const cleanNo = vehicleNo.trim().toUpperCase();
    const existing = vehicles.find(v => !v.is_finished && v.vehicle_no.trim().toUpperCase() === cleanNo);
    if (existing) {
      showError('Duplicate Vehicle', `Vehicle ${cleanNo} is already active in the workshop.`);
      return;
    }

    // Suppress self-echo from Realtime WebSocket for this vehicle
    locallyCreatedVehiclesRef.current.add(cleanNo);

    try { hapticService.triggerSuccessHaptic(); } catch { /* ignore */ }
    const now = new Date().toISOString();
    const newVehicleId = `veh-${Date.now()}`;
    const initialLogId = `log-${Date.now()}`;

    const allPossibleTasks: { name: string; type: TaskType }[] = [
      { name: 'General Service', type: 'general_service' },
      { name: 'Hoist Service', type: 'hoist_service' },
      { name: 'Wheel Alignment', type: 'wheel_alignment' },
    ];

    const tasksList = allPossibleTasks.map(t => ({
      task_name: t.name,
      task_type: t.type,
      is_required: tasks.includes(t.type),
    }));

    const newVehicle: Vehicle = {
      id: newVehicleId,
      vehicle_no: cleanNo,
      current_zone: targetZone,
      assigned_tech: assignedTech || 'Unassigned',
      remarks: remarks || '',
      intake_at: now,
      status: 'active',
      is_urgent: isUrgent,
      urgent_note: isUrgent ? (urgentNote?.trim() || null) : null,
      created_at: now,
      is_finished: false,
      completed_at: null,
      tasks: tasksList.map((t, index) => ({
        id: `task-${Date.now()}-${index}`,
        vehicle_id: newVehicleId,
        task_name: t.task_name,
        task_type: t.task_type,
        is_required: t.is_required,
        is_completed: false,
      })),
      stage_logs: [
        {
          id: initialLogId,
          vehicle_id: newVehicleId,
          from_zone: null,
          to_zone: targetZone,
          entered_at: now,
          exited_at: null,
          duration_seconds: 0,
          work_started_at: null,
          idle_seconds: 0,
          moved_by: 'Job Supervisor',
        },
      ],
    };

    const prevVehicles = vehicles;
    setVehicles(prev => [newVehicle, ...prev]);

    try {
      const created = await vehicleService.createVehicle(
        {
          vehicle_no: cleanNo,
          current_zone: targetZone,
          assigned_tech: assignedTech || 'Unassigned',
          remarks: remarks || '',
          intake_at: now,
          status: 'active',
          is_urgent: isUrgent,
          urgent_note: isUrgent ? (urgentNote?.trim() || null) : null,
        },
        tasksList
      );
      if (created?.id) {
        locallyCreatedVehiclesRef.current.add(created.id);
        setTimeout(() => {
          locallyCreatedVehiclesRef.current.delete(cleanNo);
          locallyCreatedVehiclesRef.current.delete(created.id);
        }, 5000);
      }
      if (isMountedRef.current) {
        setVehicles(prev => prev.map(v => (v.id === newVehicleId ? created : v)));
      }
    } catch (err) {
      locallyCreatedVehiclesRef.current.delete(cleanNo);
      console.error('[VehicleContext] addVehicle error:', err);
      if (isMountedRef.current) {
        setVehicles(prevVehicles);
        showError('Add Vehicle Failed', 'Could not save the vehicle. Please try again.');
      }
    }
  }, [vehicles]);

  // 4. UPDATE JOB ORDER
  const updateVehicleJobOrder = useCallback(async (
    vehicleId: string,
    updatedTaskTypes: TaskType[],
    updatedRemarks: string,
    urgencyData?: { is_urgent: boolean; urgent_note: string | null }
  ) => {
    try { hapticService.triggerLightHaptic(); } catch { /* ignore */ }
    const targetVehicle = vehicles.find(v => v.id === vehicleId);
    if (!targetVehicle) return;

    const completedTaskTypes = targetVehicle.tasks
      .filter(t => t.is_completed)
      .map(t => t.task_type);

    const finalTaskTypes = Array.from(new Set([...completedTaskTypes, ...updatedTaskTypes]));
    const prevVehicles = vehicles;

    setVehicles(prev =>
      prev.map(v => {
        if (v.id !== vehicleId) return v;
        const allPossible: { name: string; type: TaskType }[] = [
          { name: 'General Service', type: 'general_service' },
          { name: 'Hoist Service', type: 'hoist_service' },
          { name: 'Wheel Alignment', type: 'wheel_alignment' },
        ];

        const updatedTasks = allPossible.map(def => {
          const existing = v.tasks.find(t => t.task_type === def.type);
          const isReq = finalTaskTypes.includes(def.type);
          if (existing) {
            return { ...existing, is_required: isReq };
          }
          return {
            id: `task-${Date.now()}-${def.type}`,
            vehicle_id: vehicleId,
            task_name: def.name,
            task_type: def.type,
            is_required: isReq,
            is_completed: false,
          };
        });

        return {
          ...v,
          tasks: updatedTasks,
          remarks: updatedRemarks,
          ...(urgencyData !== undefined ? {
            is_urgent: urgencyData.is_urgent,
            urgent_note: urgencyData.urgent_note,
          } : {}),
        };
      })
    );

    try {
      await vehicleService.updateJobOrder(
        vehicleId,
        targetVehicle.tasks,
        finalTaskTypes,
        updatedRemarks,
        urgencyData
      );
    } catch (err) {
      console.error('[VehicleContext] updateJobOrder error:', err);
      if (isMountedRef.current) {
        setVehicles(prevVehicles);
        showError('Update Failed', 'Could not update vehicle job order.');
      }
    }
  }, [vehicles]);

  // 5. TOGGLE TASK COMPLETION
  const toggleTaskCompletion = useCallback(async (vehicleId: string, taskId: string, completedBy?: string) => {
    try { hapticService.triggerSuccessHaptic(); } catch { /* ignore */ }
    const targetVehicle = vehicles.find(v => v.id === vehicleId);
    const targetTask = targetVehicle?.tasks.find(t => t.id === taskId);
    if (!targetTask) return;

    const nextCompleted = !targetTask.is_completed;
    const prevVehicles = vehicles;

    setVehicles(prev =>
      prev.map(v => {
        if (v.id !== vehicleId) return v;
        return {
          ...v,
          tasks: v.tasks.map(t => (t.id === taskId ? {
            ...t,
            is_completed: nextCompleted,
            completed_at: nextCompleted ? new Date().toISOString() : null,
            completed_by: nextCompleted ? (completedBy || 'Technician') : null,
          } : t)),
        };
      })
    );

    try {
      await vehicleService.toggleTask(taskId, nextCompleted, completedBy);
    } catch (err) {
      console.error('[VehicleContext] toggleTask error:', err);
      if (isMountedRef.current) {
        setVehicles(prevVehicles);
        showError('Task Update Failed', 'Could not update task status.');
      }
    }
  }, [vehicles]);

  // 6. START STAGE WORK (Transitions from IDLE to ACTIVE - Waits for Backend Response)
  const startStageWork = useCallback(async (vehicleId: string, startedBy: string): Promise<boolean> => {
    const now = new Date().toISOString();
    const targetVehicle = vehicles.find(v => v.id === vehicleId);
    if (!targetVehicle) return false;

    const activeLog = targetVehicle.stage_logs.find(l => !l.exited_at && !l.work_started_at);
    const computedIdle = activeLog?.entered_at
      ? Math.max(0, Math.floor((new Date(now).getTime() - new Date(activeLog.entered_at).getTime()) / 1000))
      : 0;

    try {
      // 1. Await backend persistence first
      await vehicleService.startWork(
        vehicleId,
        startedBy,
        now,
        activeLog?.id || null,
        activeLog?.entered_at || null
      );

      // 2. Only mutate client state after backend confirmation
      try { hapticService.triggerLightHaptic(); } catch { /* ignore */ }

      setVehicles(prev =>
        prev.map(v => {
          if (v.id !== vehicleId) return v;
          const updatedLogs = [...v.stage_logs];
          const lastIdx = updatedLogs.length - 1;

          if (lastIdx >= 0) {
            const log = updatedLogs[lastIdx];
            if (!log.exited_at && !log.work_started_at) {
              updatedLogs[lastIdx] = {
                ...log,
                work_started_at: now,
                idle_seconds: computedIdle,
              };
            }
          }

          return {
            ...v,
            assigned_tech: startedBy || v.assigned_tech,
            stage_logs: updatedLogs,
          };
        })
      );
      return true;
    } catch (err: any) {
      console.error('[VehicleContext] startStageWork error:', err);
      if (isMountedRef.current) {
        showError('Start Work Failed', err?.message || 'Could not start work on vehicle. Please try again.');
      }
      return false;
    }
  }, [vehicles, showError]);

  // 7. TRANSFER VEHICLE ZONE (Waits for Backend Response)
  // Orchestration order (Rule 3.1):
  //   A. toggleTaskCompletion — auto-completes required bay task if not yet ticked (RPC + optimistic)
  //   B. vehicleService.transferZone — transfers zone; task is already done at this point
  //
  // Note: startStageWork is NOT called here. isCanDispatch requires !isStageIdle, meaning
  // START WORK must always be clicked first — work_started_at is guaranteed set before dispatch.
  const transferVehicleZone = useCallback(async (vehicleId: string, targetZone: BayZone, targetZoneName: string, techName?: string): Promise<boolean> => {
    const now = new Date().toISOString();
    const targetVehicle = vehicles.find(v => v.id === vehicleId);
    if (!targetVehicle) return false;
    const lastLog = targetVehicle.stage_logs[targetVehicle.stage_logs.length - 1] || null;

    // Detect incomplete required task for the departing bay
    const currentBayTask = targetVehicle.tasks.find(
      t => t.is_required && !t.is_completed && APP_TERMINOLOGY.tasks[t.task_type]?.stationId === targetVehicle.current_zone
    );

    const mover = techName || targetZoneName || 'Staff';

    try {
      // A. Auto-complete the required bay task if it isn't ticked yet (one-click dispatch path).
      //    Uses the existing context function → toggle_task_completion RPC + optimistic update + rollback.
      if (currentBayTask) {
        await toggleTaskCompletion(vehicleId, currentBayTask.id, mover);
      }

      // Calculate complete idle (Queue-In + Queue-Out) for the departing bay
      const enterMs = lastLog?.entered_at ? new Date(lastLog.entered_at).getTime() : new Date(now).getTime();
      const exitMs = new Date(now).getTime();
      const queueIn = lastLog?.work_started_at
        ? Math.max(0, Math.floor((new Date(lastLog.work_started_at).getTime() - enterMs) / 1000))
        : Math.max(0, Math.floor((exitMs - enterMs) / 1000));

      const bayTask = targetVehicle.tasks.find(
        t => APP_TERMINOLOGY.tasks[t.task_type]?.stationId === targetVehicle.current_zone
      );
      const taskDoneMs = (currentBayTask ? exitMs : (bayTask?.completed_at ? new Date(bayTask.completed_at).getTime() : Number.NaN));
      const queueOut = (!Number.isNaN(taskDoneMs) && taskDoneMs >= enterMs && taskDoneMs <= exitMs)
        ? Math.max(0, Math.floor((exitMs - taskDoneMs) / 1000))
        : 0;
      const totalIdleForBay = lastLog?.work_started_at ? (queueIn + queueOut) : queueIn;

      // C. Transfer zone — task is already done, service stays clean.
      await vehicleService.transferZone(
        vehicleId,
        targetZone,
        targetZoneName,
        targetVehicle.current_zone,
        now,
        lastLog?.id || null,
        lastLog?.entered_at || null,
        lastLog?.work_started_at || null,
        totalIdleForBay,
        mover
      );

      // D. Mutate client state after backend confirmation
      try { hapticService.triggerSuccessHaptic(); } catch { /* ignore */ }

      setVehicles(prev =>
        prev.map(v => {
          if (v.id !== vehicleId) return v;
          const updatedLogs = [...v.stage_logs];
          const lastIdx = updatedLogs.length - 1;

          if (lastIdx >= 0 && !updatedLogs[lastIdx].exited_at) {
            const prevL = updatedLogs[lastIdx];
            const entered = new Date(prevL.entered_at).getTime();
            const exitTime = new Date(now).getTime();
            const dur = Math.max(0, Math.floor((exitTime - entered) / 1000));

            // Queue-In idle: entered -> work_started (or full duration if work never started)
            const queueIn = prevL.work_started_at
              ? Math.max(0, Math.floor((new Date(prevL.work_started_at).getTime() - entered) / 1000))
              : dur;

            // Queue-Out idle: task completed_at -> dispatch exited_at (only if completed during this visit)
            const bayTask = v.tasks.find(
              t => APP_TERMINOLOGY.tasks[t.task_type]?.stationId === v.current_zone
            );
            const taskCompletedMs = bayTask?.completed_at ? new Date(bayTask.completed_at).getTime() : Number.NaN;
            const queueOut = (!Number.isNaN(taskCompletedMs) && taskCompletedMs >= entered && taskCompletedMs <= exitTime)
              ? Math.max(0, Math.floor((exitTime - taskCompletedMs) / 1000))
              : 0;

            const totalIdle = prevL.work_started_at ? (queueIn + queueOut) : dur;
            const { breakSeconds } = getBreakOverlap(new Date(entered), new Date(exitTime));

            updatedLogs[lastIdx] = {
              ...prevL,
              exited_at: now,
              duration_seconds: dur,
              idle_seconds: totalIdle,
              break_seconds: breakSeconds,
            };
          }

          updatedLogs.push({
            id: `log-${Date.now()}`,
            vehicle_id: vehicleId,
            from_zone: v.current_zone,
            to_zone: targetZone,
            entered_at: now,
            exited_at: null,
            duration_seconds: 0,
            work_started_at: null,
            idle_seconds: 0,
          });

          return {
            ...v,
            current_zone: targetZone,
            // tasks are already updated by toggleTaskCompletion's optimistic setVehicles above
            stage_logs: updatedLogs,
            is_paused: false,
            paused_at: null,
          };
        })
      );
      return true;
    } catch (err: any) {
      console.error('[VehicleContext] transferVehicleZone error:', err);
      if (isMountedRef.current) {
        showError('Transfer Failed', err?.message || 'Could not move the vehicle. The change has been reverted.');
      }
      return false;
    }
  }, [vehicles, showError, toggleTaskCompletion]);

  // 8. FINISH VEHICLE JOB SHEET (Advisor Handover - Waits for Backend Response)
  const finishVehicleJobSheet = useCallback(async (vehicleId: string, advisorName: string): Promise<boolean> => {
    const now = new Date().toISOString();
    const targetVehicle = vehicles.find(v => v.id === vehicleId);
    if (!targetVehicle) return false;
    const lastLog = targetVehicle.stage_logs[targetVehicle.stage_logs.length - 1] || null;

    try {
      // 1. Await backend persistence first
      await vehicleService.finishJob(
        vehicleId,
        advisorName,
        now,
        lastLog?.id || null,
        lastLog?.entered_at || null,
        lastLog?.work_started_at || null,
        lastLog?.idle_seconds
      );

      // 2. Only mutate client state after backend confirmation
      try { hapticService.triggerSuccessHaptic(); } catch { /* ignore */ }

      setVehicles(prev =>
        prev.map(v => {
          if (v.id !== vehicleId) return v;
          const updatedLogs = [...v.stage_logs];
          const lastIdx = updatedLogs.length - 1;

          if (lastIdx >= 0 && !updatedLogs[lastIdx].exited_at) {
            const log = updatedLogs[lastIdx];
            const entered = new Date(log.entered_at).getTime();
            const dur = Math.floor((new Date(now).getTime() - entered) / 1000);
            const idle = log.work_started_at
              ? (log.idle_seconds || Math.floor((new Date(log.work_started_at).getTime() - entered) / 1000))
              : dur;
            updatedLogs[lastIdx] = {
              ...log,
              exited_at: now,
              duration_seconds: dur,
              idle_seconds: idle,
            };
          }

          return {
            ...v,
            current_zone: 'completed' as BayZone,
            is_finished: true,
            completed_at: now,
            is_paused: false,
            paused_at: null,
            stage_logs: updatedLogs,
          };
        })
      );
      return true;
    } catch (err: any) {
      console.error('[VehicleContext] finishJob error:', err);
      if (isMountedRef.current) {
        showError('Finish Failed', err?.message || 'Could not complete the vehicle job sheet. Please try again.');
      }
      return false;
    }
  }, [vehicles, showError]);

  // 9. DELETE VEHICLE
  const deleteVehicle = useCallback(async (vehicleId: string) => {
    try { hapticService.triggerLightHaptic(); } catch { /* ignore */ }
    const prevVehicles = vehicles;

    setVehicles(prev => prev.filter(v => v.id !== vehicleId));
    if (selectedVehicleStateRef.current?.id === vehicleId) {
      setSelectedVehicleState(null);
    }

    try {
      await vehicleService.deleteVehicle(vehicleId);
    } catch (err) {
      console.error('[VehicleContext] deleteVehicle error:', err);
      if (isMountedRef.current) {
        setVehicles(prevVehicles);
        showError('Delete Failed', 'Could not delete vehicle.');
      }
    }
  }, [vehicles]);

  // 11. UPDATE URGENCY
  const updateUrgency = useCallback(async (vehicleId: string, isUrgent: boolean, note?: string | null) => {
    try { hapticService.triggerLightHaptic(); } catch { /* ignore */ }
    const prevVehicles = vehicles;
    const cleanNote = note ? note.trim() : null;

    setVehicles(prev =>
      prev.map(v => (v.id === vehicleId ? { ...v, is_urgent: isUrgent, urgent_note: isUrgent ? cleanNote : null } : v))
    );

    try {
      await vehicleService.updateUrgency(vehicleId, isUrgent, isUrgent ? cleanNote : null);
    } catch (err) {
      console.error('[VehicleContext] updateUrgency error:', err);
      if (isMountedRef.current) {
        setVehicles(prevVehicles);
        showError('Urgency Update Failed', 'Could not update vehicle priority.');
      }
    }
  }, [vehicles]);

  // 12. HISTORICAL VEHICLES QUERY (On Demand)
  const fetchHistoricalVehicles = useCallback(async (
    datePreset: 'today' | 'yesterday' | '7days' | 'month' | '3months'
  ): Promise<Vehicle[]> => {
    if (!isSupabaseConnected) return vehiclesRef.current;
    try {
      return await vehicleService.fetchHistoricalVehicles(datePreset);
    } catch (err) {
      console.warn('[VehicleContext] fetchHistoricalVehicles error:', err);
      return vehiclesRef.current;
    }
  }, []);

  const value = useMemo<VehicleContextType>(
    () => ({
      vehicles,
      currentRole,
      setCurrentRole,
      activeTab,
      setActiveTab,
      selectedVehicle,
      setSelectedVehicle,

      // UI Context Passthrough for 100% Backward Compatibility
      isAddModalOpen: ui.isAddModalOpen,
      setIsAddModalOpen: ui.setIsAddModalOpen,
      isConfigModalOpen: ui.isConfigModalOpen,
      setIsConfigModalOpen: ui.setIsConfigModalOpen,
      isReportsModalOpen: ui.isReportsModalOpen,
      setIsReportsModalOpen: ui.setIsReportsModalOpen,
      searchQuery: ui.searchQuery,
      setSearchQuery: ui.setSearchQuery,
      showMyVehiclesOnly: ui.showMyVehiclesOnly,
      setShowMyVehiclesOnly: ui.setShowMyVehiclesOnly,
      urgentModalData: ui.urgentModalData,
      vehicleNoteModalData: ui.vehicleNoteModalData,
      showVehicleNotes: ui.showVehicleNotes,
      hideVehicleNotes: ui.hideVehicleNotes,
      showUrgentNote: ui.showUrgentNote,
      hideUrgentNote: ui.hideUrgentNote,

      // Domain Actions
      addVehicle,
      updateVehicleJobOrder,
      toggleTaskCompletion,
      transferVehicleZone,
      startStageWork,
      finishVehicleJobSheet,
      deleteVehicle,
      updateUrgency,
      refreshVehicles: fetchSupabaseData,
      fetchHistoricalVehicles,

      isLoading,
      isRealtimeConnected,
    }),
    [
      vehicles,
      currentRole,
      activeTab,
      selectedVehicle,
      setSelectedVehicle,
      ui,
      addVehicle,
      updateVehicleJobOrder,
      toggleTaskCompletion,
      transferVehicleZone,
      startStageWork,
      finishVehicleJobSheet,
      deleteVehicle,
      updateUrgency,
      fetchSupabaseData,
      fetchHistoricalVehicles,
      isLoading,
      isRealtimeConnected,
    ]
  );

  return <VehicleContext.Provider value={value}>{children}</VehicleContext.Provider>;
};

export const useVehicles = (): VehicleContextType => {
  const ctx = useContext(VehicleContext);
  if (!ctx) {
    throw new Error('useVehicles must be used within a VehicleProvider');
  }
  return ctx;
};
