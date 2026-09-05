import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { Vehicle, VehicleTask, StageLog, BayZone, UserRole, TaskType } from '../types/vehicle';
import { getRoleBay } from '../constants/bays';
import { supabase, isSupabaseConnected } from '../lib/supabase';
import { safeStorage } from '../lib/supabase';
import { chimeService } from '../lib/chime';
import { hapticService } from '../lib/haptics';
import { vehicleService } from '../services/vehicleService';
import { useUI, UrgentModalData } from './UIContext';

// Safe in-app console logger for non-blocking error display
const showError = (title: string, message: string) => {
  console.warn(`[${title}] ${message}`);
};

export interface VehicleContextType {
  vehicles: Vehicle[];
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
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
    updatedRemarks: string
  ) => Promise<void>;
  toggleTaskCompletion: (
    vehicleId: string,
    taskId: string,
    completedBy?: string
  ) => Promise<void>;
  transferVehicleZone: (
    vehicleId: string,
    targetZone: BayZone,
    targetZoneName: string
  ) => Promise<void>;
  toggleStageTimer: (
    vehicleId: string,
    pause: boolean,
    updatedBy?: string
  ) => Promise<void>;
  startStageWork: (
    vehicleId: string,
    startedBy: string
  ) => Promise<void>;
  finishVehicleJobSheet: (
    vehicleId: string,
    advisorName: string
  ) => Promise<void>;
  deleteVehicle: (vehicleId: string) => Promise<void>;
  updateUrgency: (
    vehicleId: string,
    isUrgent: boolean,
    note?: string | null
  ) => Promise<void>;
  refreshVehicles: () => Promise<void>;
  fetchHistoricalVehicles: (datePreset: 'today' | 'yesterday' | '7days' | 'month' | 'all') => Promise<Vehicle[]>;

  // Telemetry & Network Status
  isLoading: boolean;
  isRealtimeConnected: boolean;
}

const VehicleContext = createContext<VehicleContextType | undefined>(undefined);

export const VehicleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const ui = useUI();
  const [currentRole, setCurrentRole] = useState<UserRole>('supervisor');
  const currentRoleRef = useRef<UserRole>(currentRole);
  useEffect(() => {
    currentRoleRef.current = currentRole;
  }, [currentRole]);

  // Reactive Derived Selection
  const [selectedVehicleState, setSelectedVehicleState] = useState<Vehicle | null>(null);

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
              if (!v.is_finished && !isNaN(d.getTime()) && d < startOfToday) {
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
    fetchSupabaseData(true);

    // Silent 90-day auto-cleanup
    vehicleService.purgeOldRecords();

    const client = supabase;
    if (client && isSupabaseConnected) {
      const channel = client
        .channel('public:vehicle_changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vehicles' }, (payload) => {
          if (payload.new && isMountedRef.current) {
            const newV = payload.new as Record<string, unknown>;
            const targetZone = newV.current_zone as BayZone;
            const userBay = getRoleBay(currentRoleRef.current);

            if (targetZone === userBay) {
              try { chimeService.playArrivalChime(); } catch { /* ignore */ }
              try { hapticService.triggerArrivalHaptic(); } catch { /* ignore */ }
            }

            setVehicles(prev => {
              if (prev.some(v => v.id === newV.id)) return prev;
              const vehicle: Vehicle = {
                id: newV.id as string,
                vehicle_no: newV.vehicle_no as string,
                current_zone: targetZone,
                assigned_tech: (newV.assigned_tech as string) || 'Unassigned',
                remarks: (newV.remarks as string) || '',
                intake_at: newV.intake_at as string,
                completed_at: newV.completed_at as string | null,
                is_finished: newV.is_finished as boolean,
                created_at: newV.created_at as string,
                status: (newV.status as 'active' | 'finished' | 'incomplete') || 'active',
                is_urgent: (newV.is_urgent as boolean) || false,
                urgent_note: (newV.urgent_note as string) || null,
                tasks: [],
                stage_logs: [],
              };
              return [vehicle, ...prev];
            });
            debouncedRefetch();
          }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vehicles' }, (payload) => {
          if (payload.new && isMountedRef.current) {
            const updated = payload.new as Record<string, unknown>;
            const targetZone = updated.current_zone as BayZone;
            const userBay = getRoleBay(currentRoleRef.current);

            setVehicles(prev => {
              const prevV = prev.find(v => v.id === updated.id);
              if (prevV && prevV.current_zone !== targetZone && targetZone === userBay) {
                try { chimeService.playArrivalChime(); } catch { /* ignore */ }
                try { hapticService.triggerArrivalHaptic(); } catch { /* ignore */ }
              }

              return prev.map(v => {
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
                };
              });
            });
            debouncedRefetch();
          }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'vehicles' }, (payload) => {
          if (payload.old && isMountedRef.current) {
            const deletedId = (payload.old as { id: string }).id;
            setVehicles(prev => prev.filter(v => v.id !== deletedId));
            if (selectedVehicleState?.id === deletedId) {
              setSelectedVehicleState(null);
            }
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_tasks' }, () => {
          debouncedRefetch();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'stage_logs' }, () => {
          debouncedRefetch();
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
  }, [fetchSupabaseData, debouncedRefetch, selectedVehicleState?.id]);

  // 2b. Midnight Rollover: Automatically reconciles and resets bays at 12:00:01 AM every day
  useEffect(() => {
    let timer: NodeJS.Timeout;

    const scheduleMidnightRollover = () => {
      const now = new Date();
      // Calculate next midnight in local time
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      const msUntilMidnight = Math.max(1000, nextMidnight.getTime() - now.getTime());

      timer = setTimeout(async () => {
        console.log('[VehicleContext] Midnight reached! Resetting bays for new service day...');
        try {
          await vehicleService.reconcileDailyVehicles();
        } catch (err) {
          console.warn('[VehicleContext] Midnight reconciliation error:', err);
        }
        fetchSupabaseData(false);
        // Schedule next midnight rollover
        scheduleMidnightRollover();
      }, msUntilMidnight);
    };

    scheduleMidnightRollover();
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
      if (isMountedRef.current) {
        setVehicles(prev => prev.map(v => (v.id === newVehicleId ? created : v)));
      }
    } catch (err) {
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
    updatedRemarks: string
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

        return { ...v, tasks: updatedTasks, remarks: updatedRemarks };
      })
    );

    try {
      await vehicleService.updateJobOrder(vehicleId, targetVehicle.tasks, finalTaskTypes, updatedRemarks);
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

  // 6. TRANSFER VEHICLE ZONE
  const transferVehicleZone = useCallback(async (vehicleId: string, targetZone: BayZone, targetZoneName: string) => {
    try { hapticService.triggerSuccessHaptic(); } catch { /* ignore */ }
    const now = new Date().toISOString();
    const prevVehicles = vehicles;
    const targetVehicle = vehicles.find(v => v.id === vehicleId);
    const lastLog = targetVehicle?.stage_logs[targetVehicle.stage_logs.length - 1] || null;

    setVehicles(prev =>
      prev.map(v => {
        if (v.id !== vehicleId) return v;
        const updatedLogs = [...v.stage_logs];
        const lastIdx = updatedLogs.length - 1;

        if (lastIdx >= 0 && !updatedLogs[lastIdx].exited_at) {
          const prevL = updatedLogs[lastIdx];
          const entered = new Date(prevL.entered_at).getTime();
          const dur = Math.floor((new Date(now).getTime() - entered) / 1000);
          const idle = prevL.work_started_at
            ? (prevL.idle_seconds || Math.floor((new Date(prevL.work_started_at).getTime() - entered) / 1000))
            : dur;
          updatedLogs[lastIdx] = {
            ...prevL,
            exited_at: now,
            duration_seconds: dur,
            idle_seconds: idle,
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
          stage_logs: updatedLogs,
          is_paused: false,
          paused_at: null,
        };
      })
    );

    try {
      await vehicleService.transferZone(
        vehicleId,
        targetZone,
        targetZoneName,
        targetVehicle?.current_zone,
        now,
        lastLog?.id || null,
        lastLog?.entered_at || null,
        lastLog?.work_started_at || null,
        lastLog?.idle_seconds
      );
    } catch (err) {
      console.error('[VehicleContext] transferVehicleZone error:', err);
      if (isMountedRef.current) {
        setVehicles(prevVehicles);
        showError('Transfer Failed', 'Could not move the vehicle. The change has been reverted.');
      }
    }
  }, [vehicles]);

  // 7. START STAGE WORK (Transitions from IDLE to ACTIVE)
  const startStageWork = useCallback(async (vehicleId: string, startedBy: string) => {
    try { hapticService.triggerLightHaptic(); } catch { /* ignore */ }
    const now = new Date().toISOString();
    const targetVehicle = vehicles.find(v => v.id === vehicleId);
    const activeLog = targetVehicle?.stage_logs.find(l => !l.exited_at && !l.work_started_at);
    const computedIdle = activeLog?.entered_at
      ? Math.max(0, Math.floor((new Date(now).getTime() - new Date(activeLog.entered_at).getTime()) / 1000))
      : 0;

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

    try {
      await vehicleService.startWork(
        vehicleId,
        startedBy,
        now,
        activeLog?.id || null,
        activeLog?.entered_at || null
      );
    } catch (err) {
      console.warn('[VehicleContext] startStageWork error:', err);
    }
  }, [vehicles]);

  // 8. FINISH VEHICLE JOB SHEET (Advisor Handover)
  const finishVehicleJobSheet = useCallback(async (vehicleId: string, advisorName: string) => {
    try { hapticService.triggerSuccessHaptic(); } catch { /* ignore */ }
    const now = new Date().toISOString();
    const prevVehicles = vehicles;
    const targetVehicle = vehicles.find(v => v.id === vehicleId);
    const lastLog = targetVehicle?.stage_logs[targetVehicle.stage_logs.length - 1] || null;

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

    try {
      await vehicleService.finishJob(
        vehicleId,
        advisorName,
        now,
        lastLog?.id || null,
        lastLog?.entered_at || null,
        lastLog?.work_started_at || null,
        lastLog?.idle_seconds
      );
    } catch (err) {
      console.error('[VehicleContext] finishJob error:', err);
      if (isMountedRef.current) {
        setVehicles(prevVehicles);
        showError('Finish Failed', 'Could not complete the vehicle job sheet. Please try again.');
      }
    }
  }, [vehicles]);

  // 9. TOGGLE STAGE TIMER (Pause / Resume)
  const toggleStageTimer = useCallback(async (vehicleId: string, pause: boolean) => {
    try { hapticService.triggerLightHaptic(); } catch { /* ignore */ }
    const now = new Date().toISOString();
    const targetVehicle = vehicles.find(v => v.id === vehicleId);
    if (!targetVehicle) return;

    setVehicles(prev =>
      prev.map(v => {
        if (v.id !== vehicleId) return v;
        const updatedLogs = [...v.stage_logs];
        const lastIdx = updatedLogs.length - 1;

        if (pause) {
          if (lastIdx >= 0 && !updatedLogs[lastIdx].exited_at) {
            updatedLogs[lastIdx] = { ...updatedLogs[lastIdx], is_paused: true, paused_at: now };
          }
          return { ...v, is_paused: true, paused_at: now, stage_logs: updatedLogs };
        } else {
          const pausedAtTime = v.paused_at ? new Date(v.paused_at).getTime() : Date.now();
          const addedDuration = Math.max(0, Math.floor((Date.now() - pausedAtTime) / 1000));
          const newPaused = (v.paused_seconds || 0) + addedDuration;

          if (lastIdx >= 0 && !updatedLogs[lastIdx].exited_at) {
            const logPaused = (updatedLogs[lastIdx].paused_seconds || 0) + addedDuration;
            updatedLogs[lastIdx] = {
              ...updatedLogs[lastIdx],
              is_paused: false,
              paused_at: null,
              paused_seconds: logPaused,
            };
          }

          return { ...v, is_paused: false, paused_at: null, paused_seconds: newPaused, stage_logs: updatedLogs };
        }
      })
    );

    try {
      await vehicleService.toggleTimer(
        vehicleId,
        pause,
        now,
        targetVehicle.paused_seconds || 0,
        targetVehicle.paused_at || null
      );
    } catch (err) {
      console.warn('[VehicleContext] toggleStageTimer note:', err);
    }
  }, [vehicles]);

  // 10. DELETE VEHICLE
  const deleteVehicle = useCallback(async (vehicleId: string) => {
    try { hapticService.triggerLightHaptic(); } catch { /* ignore */ }
    const prevVehicles = vehicles;

    setVehicles(prev => prev.filter(v => v.id !== vehicleId));
    if (selectedVehicleState?.id === vehicleId) {
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
  }, [vehicles, selectedVehicleState?.id]);

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
    datePreset: 'today' | 'yesterday' | '7days' | 'month' | 'all'
  ): Promise<Vehicle[]> => {
    if (!isSupabaseConnected) return vehicles;
    try {
      return await vehicleService.fetchHistoricalVehicles(datePreset);
    } catch (err) {
      console.warn('[VehicleContext] fetchHistoricalVehicles error:', err);
      return vehicles;
    }
  }, [vehicles]);

  const value = useMemo<VehicleContextType>(
    () => ({
      vehicles,
      currentRole,
      setCurrentRole,
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
      toggleStageTimer,
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
      selectedVehicle,
      setSelectedVehicle,
      ui,
      addVehicle,
      updateVehicleJobOrder,
      toggleTaskCompletion,
      transferVehicleZone,
      toggleStageTimer,
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
