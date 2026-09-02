import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { Platform, Alert } from 'react-native';
import { Vehicle, UserRole, BayZone, TaskType, VehicleTask, StageLog } from '../types/vehicle';
import { supabase, isSupabaseConnected, safeStorage } from '../lib/supabase';
import { chimeService } from '../lib/chime';
import { hapticService } from '../lib/haptics';
import { getRoleBay } from '../constants/bays';
import { useDateWatcher } from '../hooks/useDateWatcher';

interface VehicleContextType {
  vehicles: Vehicle[];
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  selectedVehicle: Vehicle | null;
  setSelectedVehicle: (vehicle: Vehicle | null) => void;
  isAddModalOpen: boolean;
  setIsAddModalOpen: (open: boolean) => void;
  isConfigModalOpen: boolean;
  setIsConfigModalOpen: (open: boolean) => void;
  isReportsModalOpen: boolean;
  setIsReportsModalOpen: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  addVehicle: (vehicleNo: string, tasks: TaskType[], targetZone: BayZone, assignedTech: string, remarks: string, isUrgent?: boolean, urgentNote?: string) => Promise<void>;
  updateVehicleJobOrder: (vehicleId: string, updatedTaskTypes: TaskType[], updatedRemarks: string) => Promise<void>;
  toggleTaskCompletion: (vehicleId: string, taskId: string, completedBy: string) => Promise<void>;
  transferVehicleZone: (vehicleId: string, toZone: BayZone, movedBy: string) => Promise<void>;
  toggleStageTimer: (vehicleId: string, pause: boolean, updatedBy: string) => Promise<void>;
  startStageWork: (vehicleId: string, startedBy: string) => Promise<void>;
  finishVehicleJobSheet: (vehicleId: string, advisorName: string) => Promise<void>;
  deleteVehicle: (vehicleId: string) => Promise<void>;
  updateUrgency: (vehicleId: string, isUrgent: boolean, note: string) => Promise<void>;
  refreshVehicles: () => Promise<void>;
  fetchHistoricalVehicles: (datePreset: 'today' | 'yesterday' | '7days' | 'month' | 'all') => Promise<Vehicle[]>;
  urgentModalData: { vehicleNo: string; note: string } | null;
  showUrgentNote: (vehicleNo: string, note?: string | null) => void;
  hideUrgentNote: () => void;
  isLoading: boolean;
  isRealtimeConnected: boolean;
}

const VehicleContext = createContext<VehicleContextType | undefined>(undefined);

// Helper: show error to user
const showError = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    try { window.alert(`${title}: ${message}`); } catch { /* fallback */ }
  } else {
    Alert.alert(title, message);
  }
};

export const VehicleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Track mounted state to prevent setState on unmounted component
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const [vehicles, setVehicles] = useState<Vehicle[]>(() => {
    const saved = safeStorage.getItem('um_cached_vehicles') || safeStorage.getItem('um_local_vehicles');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter((v: Vehicle) => v && v.id && !v.id.startsWith('v-10'));
        }
      } catch { /* fallback */ }
    }
    return [];
  });

  const [currentRole, setCurrentRole] = useState<UserRole>('supervisor');
  const currentRoleRef = useRef<UserRole>(currentRole);
  useEffect(() => {
    currentRoleRef.current = currentRole;
  }, [currentRole]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [isReportsModalOpen, setIsReportsModalOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [urgentModalData, setUrgentModalData] = useState<{ vehicleNo: string; note: string } | null>(null);

  const showUrgentNote = useCallback((vehicleNo: string, note?: string | null) => {
    try { hapticService.triggerLightHaptic(); } catch {}
    setUrgentModalData({ vehicleNo, note: note || '' });
  }, []);

  const hideUrgentNote = useCallback(() => {
    setUrgentModalData(null);
  }, []);
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (isSupabaseConnected) {
      const saved = safeStorage.getItem('um_cached_vehicles');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return false;
        } catch {}
      }
      return true;
    }
    return false;
  });
  const [isRealtimeConnected, setIsRealtimeConnected] = useState<boolean>(isSupabaseConnected);

  // Debounce ref for realtime events
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync to local storage on web (always keep cache up to date, even when empty)
  useEffect(() => {
    safeStorage.setItem('um_cached_vehicles', JSON.stringify(vehicles));
    safeStorage.removeItem('um_local_vehicles');
  }, [vehicles]);

  // Fetch from Supabase with parallel Promise.all
  const fetchSupabaseData = useCallback(async (isInitialLoad: boolean = false) => {
    const client = supabase;
    if (!client || !isSupabaseConnected) return;
    if (isInitialLoad && vehicles.length === 0) setIsLoading(true);

    try {
      // Option B (Soft Filtering):
      // Live workshop floor loads ALL active in-workshop vehicles (is_finished = false)
      // plus vehicles completed within the last 48 hours for recent review.
      const cutoff48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
      const liveFilter = `is_finished.eq.false,created_at.gte.${cutoff48h}`;

      const [vRes, tRes, lRes] = await Promise.all([
        client.from('vehicles').select('*').or(liveFilter).order('created_at', { ascending: false }),
        client.from('vehicle_tasks').select('*'),
        client.from('stage_logs').select('*').order('entered_at', { ascending: true }),
      ]);

      if (vRes.error) throw vRes.error;
      if (tRes.error) throw tRes.error;
      if (lRes.error) throw lRes.error;

      const dbVehicles = vRes.data || [];
      const dbTasks = tRes.data || [];
      const dbLogs = lRes.data || [];

      const taskMap = new Map<string, VehicleTask[]>();
      dbTasks.forEach((t: VehicleTask) => {
        if (!taskMap.has(t.vehicle_id)) taskMap.set(t.vehicle_id, []);
        taskMap.get(t.vehicle_id)!.push(t);
      });

      const logMap = new Map<string, StageLog[]>();
      dbLogs.forEach((l: StageLog) => {
        if (!logMap.has(l.vehicle_id)) logMap.set(l.vehicle_id, []);
        logMap.get(l.vehicle_id)!.push(l);
      });

      const formatted: Vehicle[] = dbVehicles.map((v: Record<string, unknown>) => ({
        id: v.id as string,
        vehicle_no: v.vehicle_no as string,
        current_zone: v.current_zone as BayZone,
        assigned_tech: (v.assigned_tech as string) || 'Unassigned',
        remarks: (v.remarks as string) || '',
        intake_at: v.intake_at as string,
        completed_at: v.completed_at as string | null,
        is_finished: v.is_finished as boolean,
        created_at: v.created_at as string,
        status: (v.status as 'active' | 'finished' | 'incomplete') || 'active',
        is_urgent: (v.is_urgent as boolean) || false,
        urgent_note: (v.urgent_note as string) || null,
        is_paused: (v.is_paused as boolean) || false,
        paused_at: v.paused_at as string | null,
        paused_seconds: (v.paused_seconds as number) || 0,
        tasks: taskMap.get(v.id as string) || [],
        stage_logs: logMap.get(v.id as string) || []
      }));

      if (isMountedRef.current) {
        setVehicles(formatted);
        safeStorage.setItem('um_cached_vehicles', JSON.stringify(formatted));
        setIsRealtimeConnected(true);
      }
    } catch (err) {
      console.warn('Supabase fetch error, fallback to local state:', err);
      if (isMountedRef.current) setIsRealtimeConnected(false);
    } finally {
      if (isInitialLoad && isMountedRef.current) setIsLoading(false);
    }
  }, []);

  // Debounced refetch — collapses rapid realtime events into one fetch
  const debouncedRefetch = useCallback(() => {
    if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    realtimeDebounceRef.current = setTimeout(() => {
      fetchSupabaseData(false);
    }, 300);
  }, [fetchSupabaseData]);

  // Realtime channel subscriptions with targeted payload merging
  useEffect(() => {
    fetchSupabaseData(true);

    // Phase 3: Silent 90-day auto-cleanup — fire-and-forget on app mount
    if (supabase && isSupabaseConnected) {
      supabase.rpc('purge_records_older_than_90_days').then(({ error }) => {
        if (error) console.warn('[Auto-cleanup] purge RPC error:', error.message);
        else console.info('[Auto-cleanup] 90-day purge completed silently.');
      });
    }

    const client = supabase;
    if (client && isSupabaseConnected) {
      const channel = client
        .channel('public:vehicle_changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vehicles' }, (payload) => {
          if (payload.new && isMountedRef.current) {
            const newV = payload.new as Record<string, unknown>;
            const targetZone = newV.current_zone as BayZone;
            const userBay = getRoleBay(currentRoleRef.current);

            // Play arrival chime & vibration if new vehicle was dispatched directly to current user's bay
            if (targetZone === userBay) {
              try { chimeService.playArrivalChime(); } catch { /* ignore audio error */ }
              try { hapticService.triggerArrivalHaptic(); } catch { /* ignore haptic error */ }
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
                stage_logs: []
              };
              return [vehicle, ...prev];
            });
            debouncedRefetch();
          }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vehicles' }, (payload) => {
          if (payload.new && isMountedRef.current) {
            const updated = payload.new as Record<string, unknown>;
            setVehicles(prev => {
              const prevV = prev.find(v => v.id === updated.id);
              const prevZone = prevV?.current_zone;
              const nextZone = updated.current_zone as BayZone;
              const userBay = getRoleBay(currentRoleRef.current);

              // Play arrival chime & vibration if vehicle was transferred to current user's active bay
              if (prevZone && prevZone !== nextZone && nextZone === userBay) {
                try { chimeService.playArrivalChime(); } catch { /* ignore audio error */ }
                try { hapticService.triggerArrivalHaptic(); } catch { /* ignore haptic error */ }
              }

              return prev.map(v => {
                if (v.id !== updated.id) return v;
                return {
                  ...v,
                  current_zone: updated.current_zone as BayZone,
                  assigned_tech: (updated.assigned_tech as string) || v.assigned_tech,
                  remarks: (updated.remarks as string) ?? v.remarks,
                  is_finished: updated.is_finished as boolean,
                  completed_at: updated.completed_at as string | null,
                  status: (updated.status as 'active' | 'finished' | 'incomplete') ?? v.status,
                  is_urgent: updated.is_urgent !== undefined ? (updated.is_urgent as boolean) : v.is_urgent,
                  urgent_note: updated.urgent_note !== undefined ? (updated.urgent_note as string) : v.urgent_note,
                };
              });
            });
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_tasks' }, () => {
          debouncedRefetch();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'stage_logs' }, () => {
          debouncedRefetch();
        })
        .subscribe((status) => {
          if (isMountedRef.current) setIsRealtimeConnected(status === 'SUBSCRIBED');
        });

      return () => {
        if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
        client.removeChannel(channel);
      };
    }
  }, [fetchSupabaseData, debouncedRefetch]);

  // 1. ADD VEHICLE (Job Supervisor)
  const addVehicle = useCallback(async (
    vehicleNo: string,
    tasksTypes: TaskType[],
    targetZone: BayZone,
    assignedTech: string,
    remarks: string,
    isUrgent: boolean = false,
    urgentNote: string = ''
  ) => {
    const cleanNo = vehicleNo.trim().toUpperCase();
    const existing = vehicles.find(v => !v.is_finished && v.vehicle_no.trim().toUpperCase() === cleanNo);
    if (existing) {
      showError('Duplicate Vehicle', `Vehicle ${cleanNo} is already active in the workshop.`);
      return;
    }

    const now = new Date().toISOString();
    const newId = 'v-' + Date.now();

    const taskDefinitions: { name: string; type: TaskType }[] = [
      { name: 'General Service', type: 'general_service' },
      { name: 'Hoist Service', type: 'hoist_service' },
      { name: 'Wheel Alignment', type: 'wheel_alignment' }
    ];

    const tasksList: VehicleTask[] = taskDefinitions.map((t, idx) => ({
      id: `t-${newId}-${idx}`,
      vehicle_id: newId,
      task_name: t.name,
      task_type: t.type,
      is_required: tasksTypes.includes(t.type),
      is_completed: false
    }));

    const isInspection = targetZone === 'inspection';
    const initialLog: StageLog = {
      id: `log-${newId}-1`,
      vehicle_id: newId,
      from_zone: null,
      to_zone: targetZone,
      entered_at: now,
      duration_seconds: 0,
      moved_by: 'Job Supervisor',
      work_started_at: isInspection ? now : null,
      idle_seconds: 0,
    };

    const newVehicle: Vehicle = {
      id: newId,
      vehicle_no: vehicleNo.trim().toUpperCase(),
      current_zone: targetZone,
      assigned_tech: assignedTech || 'Job Supervisor',
      remarks,
      intake_at: now,
      is_finished: false,
      status: 'active',
      is_urgent: isUrgent,
      urgent_note: urgentNote || null,
      created_at: now,
      tasks: tasksList,
      stage_logs: [initialLog]
    };

    const client = supabase;
    if (client && isSupabaseConnected) {
      try {
        const { data: insertedV, error: vErr } = await client
          .from('vehicles')
          .insert({
            vehicle_no: newVehicle.vehicle_no,
            current_zone: targetZone,
            assigned_tech: newVehicle.assigned_tech,
            remarks: remarks,
            intake_at: now,
            is_urgent: isUrgent,
            urgent_note: urgentNote || null,
            status: 'active'
          })
          .select()
          .single();

        if (vErr) throw vErr;

        const dbTasks = tasksList.map(t => ({
          vehicle_id: insertedV.id,
          task_name: t.task_name,
          task_type: t.task_type,
          is_required: t.is_required,
          is_completed: false
        }));

        await client.from('vehicle_tasks').insert(dbTasks);
        await client.from('stage_logs').insert({
          vehicle_id: insertedV.id,
          to_zone: targetZone,
          entered_at: now,
          moved_by: 'Job Supervisor',
          work_started_at: isInspection ? now : null,
          idle_seconds: 0,
        });

        await fetchSupabaseData();
        return;
      } catch (err) {
        console.error('Supabase insert failed:', err);
        showError('Failed to Create Vehicle', 'The vehicle could not be saved to the server. Please try again.');
        throw err;
      }
    }

    setVehicles(prev => [newVehicle, ...prev]);
  }, [fetchSupabaseData]);

  // 1.5 UPDATE VEHICLE JOB ORDER (Supervisor Edit)
  const updateVehicleJobOrder = useCallback(async (
    vehicleId: string,
    updatedTaskTypes: TaskType[],
    updatedRemarks: string
  ) => {
    const targetVehicle = vehicles.find(v => v.id === vehicleId);
    if (!targetVehicle) return;

    const completedTaskTypes = targetVehicle.tasks
      .filter(t => t.is_completed)
      .map(t => t.task_type);

    const finalTaskTypes = Array.from(new Set([...completedTaskTypes, ...updatedTaskTypes]));

    const client = supabase;
    if (client && isSupabaseConnected) {
      try {
        await client
          .from('vehicles')
          .update({ remarks: updatedRemarks })
          .eq('id', vehicleId);

        const allPossibleTasks: { name: string; type: TaskType }[] = [
          { name: 'General Service', type: 'general_service' },
          { name: 'Hoist Service', type: 'hoist_service' },
          { name: 'Wheel Alignment', type: 'wheel_alignment' },
        ];

        for (const taskDef of allPossibleTasks) {
          const existingTask = targetVehicle.tasks.find(t => t.task_type === taskDef.type);
          const isRequired = finalTaskTypes.includes(taskDef.type);

          if (existingTask) {
            if (!existingTask.is_completed) {
              await client
                .from('vehicle_tasks')
                .update({ is_required: isRequired })
                .eq('id', existingTask.id);
            }
          } else if (isRequired) {
            await client.from('vehicle_tasks').insert({
              vehicle_id: vehicleId,
              task_name: taskDef.name,
              task_type: taskDef.type,
              is_required: true,
              is_completed: false
            });
          }
        }

        await fetchSupabaseData();
        return;
      } catch (err) {
        console.error('Supabase Job Order update error:', err);
        showError('Update Failed', 'Could not save job order changes. Please try again.');
        throw err;
      }
    }

    // Local state fallback
    setVehicles(prev => prev.map(v => {
      if (v.id !== vehicleId) return v;

      const existingTasks = v.tasks;
      const allPossibleTasks: { name: string; type: TaskType }[] = [
        { name: 'General Service', type: 'general_service' },
        { name: 'Hoist Service', type: 'hoist_service' },
        { name: 'Wheel Alignment', type: 'wheel_alignment' },
      ];

      const updatedTasks: VehicleTask[] = allPossibleTasks.map(taskDef => {
        const existing = existingTasks.find(t => t.task_type === taskDef.type);
        const isReq = finalTaskTypes.includes(taskDef.type);
        if (existing) {
          return existing.is_completed ? existing : { ...existing, is_required: isReq };
        }
        return {
          id: `t_${Date.now()}_${Math.random()}`,
          vehicle_id: vehicleId,
          task_name: taskDef.name,
          task_type: taskDef.type,
          is_required: isReq,
          is_completed: false
        };
      });

      return { ...v, remarks: updatedRemarks, tasks: updatedTasks };
    }));
  }, [vehicles, fetchSupabaseData]);

  // 2. TOGGLE TASK COMPLETION (Optimistic + RPC + Rollback)
  const toggleTaskCompletion = useCallback(async (vehicleId: string, taskId: string, completedBy: string) => {
    try { hapticService.triggerLightHaptic(); } catch { /* ignore haptic error */ }
    const now = new Date().toISOString();
    const prevVehicles = vehicles;

    // 1. Instant local update (0ms lag)
    setVehicles(prev =>
      prev.map(v => {
        if (v.id !== vehicleId) return v;
        return {
          ...v,
          tasks: v.tasks.map(t => {
            if (t.id !== taskId) return t;
            const nextCompleted = !t.is_completed;
            return {
              ...t,
              is_completed: nextCompleted,
              completed_at: nextCompleted ? now : null,
              completed_by: nextCompleted ? completedBy : null
            };
          })
        };
      })
    );

    // 2. Server-side RPC with direct table fallback
    const client = supabase;
    if (client && isSupabaseConnected) {
      try {
        const { error } = await client.rpc('toggle_task_completion', {
          p_task_id: taskId,
          p_completed_by: completedBy
        });

        if (error) {
          console.warn('RPC toggle_task_completion failed, attempting direct table update:', error.message);
          const targetVehicle = vehicles.find(v => v.id === vehicleId);
          const targetTask = targetVehicle?.tasks.find(t => t.id === taskId);
          const nextState = targetTask ? !targetTask.is_completed : true;
          const { error: directErr } = await client
            .from('vehicle_tasks')
            .update({
              is_completed: nextState,
              completed_at: nextState ? now : null,
              completed_by: nextState ? completedBy : null
            })
            .eq('id', taskId);
          if (directErr) throw directErr;
        }
      } catch (err) {
        console.error('Supabase task toggle error:', err);
        if (isMountedRef.current) {
          setVehicles(prevVehicles);
          showError('Task Update Failed', 'Could not save the task change. It has been reverted.');
        }
      }
    }
  }, [vehicles]);

  // 3. TRANSFER VEHICLE ZONE (Optimistic + RPC + Fallback + Rollback)
  const transferVehicleZone = useCallback(async (vehicleId: string, toZone: BayZone, movedBy: string) => {
    try { chimeService.playChime(); } catch { /* ignore audio error */ }
    try { hapticService.triggerArrivalHaptic(); } catch { /* ignore haptic error */ }
    const now = new Date().toISOString();
    const prevVehicles = vehicles;

    // 1. Instant Optimistic Local Update (0ms lag)
    setVehicles(prev =>
      prev.map(v => {
        if (v.id !== vehicleId) return v;
        const fromZone = v.current_zone;
        const updatedLogs = [...v.stage_logs];
        const lastLogIdx = updatedLogs.length - 1;

        if (lastLogIdx >= 0 && !updatedLogs[lastLogIdx].exited_at) {
          const prevLog = updatedLogs[lastLogIdx];
          const entered = new Date(prevLog.entered_at).getTime();
          const dur = Math.floor((new Date(now).getTime() - entered) / 1000);
          const idle = prevLog.work_started_at
            ? (prevLog.idle_seconds || Math.floor((new Date(prevLog.work_started_at).getTime() - entered) / 1000))
            : dur;
          updatedLogs[lastLogIdx] = {
            ...prevLog,
            exited_at: now,
            duration_seconds: dur,
            idle_seconds: idle,
          };
        }

        const isInspection = toZone === 'inspection';
        updatedLogs.push({
          id: `log-${v.id}-${Date.now()}`,
          vehicle_id: v.id,
          from_zone: fromZone,
          to_zone: toZone,
          entered_at: now,
          duration_seconds: 0,
          moved_by: movedBy,
          work_started_at: isInspection ? now : null,
          idle_seconds: 0,
        });

        return {
          ...v,
          current_zone: toZone,
          stage_logs: updatedLogs
        };
      })
    );

    // 2. Server-side RPC with direct table fallback
    const client = supabase;
    if (client && isSupabaseConnected) {
      try {
        const { error } = await client.rpc('transfer_vehicle_zone', {
          p_vehicle_id: vehicleId,
          p_to_zone: toZone,
          p_moved_by: movedBy
        });

        if (error) {
          console.warn('RPC transfer_vehicle_zone failed, attempting direct table update:', error.message);
          const { data: dbLogs } = await client
            .from('stage_logs')
            .select('*')
            .eq('vehicle_id', vehicleId)
            .is('exited_at', null)
            .order('entered_at', { ascending: false });

          if (dbLogs && dbLogs.length > 0) {
            const activeLog = dbLogs[0];
            const entered = new Date(activeLog.entered_at).getTime();
            const duration = Math.floor((new Date(now).getTime() - entered) / 1000);
            const idle = activeLog.work_started_at
              ? (activeLog.idle_seconds || Math.floor((new Date(activeLog.work_started_at).getTime() - entered) / 1000))
              : duration;
            await client
              .from('stage_logs')
              .update({ exited_at: now, duration_seconds: duration, idle_seconds: idle })
              .eq('id', activeLog.id);
          }

          const isInspection = toZone === 'inspection';
          await client.from('stage_logs').insert({
            vehicle_id: vehicleId,
            to_zone: toZone,
            entered_at: now,
            moved_by: movedBy,
            work_started_at: isInspection ? now : null,
            idle_seconds: 0,
          });

          const { error: directErr } = await client
            .from('vehicles')
            .update({ current_zone: toZone })
            .eq('id', vehicleId);

          if (directErr) throw directErr;
        }
      } catch (err) {
        console.error('Supabase zone transfer error:', err);
        if (isMountedRef.current) {
          setVehicles(prevVehicles);
          showError('Transfer Failed', 'Could not move the vehicle. The change has been reverted.');
        }
      }
    }
  }, [vehicles]);

  // 4. FINISH VEHICLE JOB SHEET (Service Advisor — RPC + Fallback)
  const finishVehicleJobSheet = useCallback(async (vehicleId: string, advisorName: string) => {
    try { hapticService.triggerSuccessHaptic(); } catch { /* ignore haptic error */ }
    const now = new Date().toISOString();
    const prevVehicles = vehicles;
    const client = supabase;

    // Optimistic update
    setVehicles(prev =>
      prev.map(v => {
        if (v.id !== vehicleId) return v;
        return { ...v, current_zone: 'completed' as BayZone, is_finished: true, completed_at: now, is_paused: false, paused_at: null };
      })
    );

    if (client && isSupabaseConnected) {
      try {
        const { error } = await client.rpc('finish_vehicle_job', {
          p_vehicle_id: vehicleId,
          p_advisor_name: advisorName
        });

        if (error) {
          console.warn('RPC finish_vehicle_job failed, attempting direct table update:', error.message);
          const { error: directErr } = await client
            .from('vehicles')
            .update({
              current_zone: 'completed',
              is_finished: true,
              completed_at: now,
              is_paused: false,
              paused_at: null,
            })
            .eq('id', vehicleId);
          if (directErr) throw directErr;
        }
      } catch (err) {
        console.error('Supabase finish job error:', err);
        if (isMountedRef.current) {
          setVehicles(prevVehicles);
          showError('Finish Failed', 'Could not complete the vehicle job sheet. Please try again.');
        }
      }
    }
  }, [vehicles]);

  // 5. TOGGLE STAGE TIMER (START / STOP / PAUSE / RESUME)
  const toggleStageTimer = useCallback(async (vehicleId: string, pause: boolean, updatedBy: string) => {
    try { hapticService.triggerLightHaptic(); } catch { /* ignore haptic error */ }
    const now = new Date().toISOString();
    const client = supabase;

    // Optimistic Update
    setVehicles(prev =>
      prev.map(v => {
        if (v.id !== vehicleId) return v;

        const updatedLogs = [...v.stage_logs];
        const lastIndex = updatedLogs.length - 1;
        let newPausedSec = v.paused_seconds || 0;

        if (pause) {
          // Pausing / Stopping Timer
          if (lastIndex >= 0) {
            updatedLogs[lastIndex] = {
              ...updatedLogs[lastIndex],
              is_paused: true,
              paused_at: now,
            };
          }
          return {
            ...v,
            is_paused: true,
            paused_at: now,
            stage_logs: updatedLogs,
          };
        } else {
          // Starting / Resuming Timer
          const pausedAtTime = v.paused_at ? new Date(v.paused_at).getTime() : Date.now();
          const addedPauseDuration = Math.max(0, Math.floor((Date.now() - pausedAtTime) / 1000));
          newPausedSec += addedPauseDuration;

          if (lastIndex >= 0) {
            const logPausedSec = (updatedLogs[lastIndex].paused_seconds || 0) + addedPauseDuration;
            updatedLogs[lastIndex] = {
              ...updatedLogs[lastIndex],
              is_paused: false,
              paused_at: null,
              paused_seconds: logPausedSec,
            };
          }

          return {
            ...v,
            is_paused: false,
            paused_at: null,
            paused_seconds: newPausedSec,
            stage_logs: updatedLogs,
          };
        }
      })
    );

    // Supabase Sync with Fallback
    if (client && isSupabaseConnected) {
      try {
        const targetVehicle = vehicles.find(v => v.id === vehicleId);
        if (!targetVehicle) return;

        if (pause) {
          await client
            .from('vehicles')
            .update({ is_paused: true, paused_at: now })
            .eq('id', vehicleId);

          const { data: dbLogs } = await client
            .from('stage_logs')
            .select('*')
            .eq('vehicle_id', vehicleId)
            .is('exited_at', null)
            .order('entered_at', { ascending: false });

          if (dbLogs && dbLogs.length > 0) {
            await client
              .from('stage_logs')
              .update({ is_paused: true, paused_at: now })
              .eq('id', dbLogs[0].id);
          }
        } else {
          const pausedAtTime = targetVehicle.paused_at ? new Date(targetVehicle.paused_at).getTime() : Date.now();
          const addedPauseDuration = Math.max(0, Math.floor((Date.now() - pausedAtTime) / 1000));
          const newPausedSec = (targetVehicle.paused_seconds || 0) + addedPauseDuration;

          await client
            .from('vehicles')
            .update({ is_paused: false, paused_at: null, paused_seconds: newPausedSec })
            .eq('id', vehicleId);

          const { data: dbLogs } = await client
            .from('stage_logs')
            .select('*')
            .eq('vehicle_id', vehicleId)
            .is('exited_at', null)
            .order('entered_at', { ascending: false });

          if (dbLogs && dbLogs.length > 0) {
            const logPausedSec = (dbLogs[0].paused_seconds || 0) + addedPauseDuration;
            await client
              .from('stage_logs')
              .update({ is_paused: false, paused_at: null, paused_seconds: logPausedSec })
              .eq('id', dbLogs[0].id);
          }
        }
      } catch (err) {
        console.warn('Supabase stage timer sync note:', err);
      }
    }
  }, [vehicles]);

  // 5b. START STAGE WORK (Transitions bay stage from IDLE to ACTIVE)
  const startStageWork = useCallback(async (vehicleId: string, startedBy: string) => {
    try { hapticService.triggerLightHaptic(); } catch { /* ignore */ }
    const now = new Date().toISOString();
    const client = supabase;

    const targetVehicle = vehicles.find(v => v.id === vehicleId);
    const activeLog = targetVehicle?.stage_logs.find(l => !l.exited_at && !l.work_started_at);
    const targetLogId: string | null = activeLog?.id || null;
    const computedIdleSec = activeLog?.entered_at
      ? Math.max(0, Math.floor((new Date(now).getTime() - new Date(activeLog.entered_at).getTime()) / 1000))
      : 0;

    // 1. Optimistic Local State Update
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
              idle_seconds: computedIdleSec,
            };
          }
        }

        return {
          ...v,
          stage_logs: updatedLogs,
        };
      })
    );

    // 2. Supabase DB update
    if (client && isSupabaseConnected) {
      try {
        if (targetLogId && !targetLogId.startsWith('log-')) {
          await client
            .from('stage_logs')
            .update({ work_started_at: now, idle_seconds: computedIdleSec })
            .eq('id', targetLogId);
        } else {
          const { data: dbLogs } = await client
            .from('stage_logs')
            .select('*')
            .eq('vehicle_id', vehicleId)
            .is('exited_at', null)
            .order('entered_at', { ascending: false })
            .limit(1);

          if (dbLogs && dbLogs.length > 0) {
            const dbActiveLog = dbLogs[0];
            const entered = new Date(dbActiveLog.entered_at).getTime();
            const idle = Math.max(0, Math.floor((new Date(now).getTime() - entered) / 1000));
            await client
              .from('stage_logs')
              .update({ work_started_at: now, idle_seconds: idle })
              .eq('id', dbActiveLog.id);
          }
        }
      } catch (err) {
        console.warn('Supabase start stage work error:', err);
      }
    }
  }, [vehicles]);

  // 6. DELETE VEHICLE JOB SHEET (Supervisor only — Cascades in DB)
  const deleteVehicle = useCallback(async (vehicleId: string) => {
    try { hapticService.triggerLightHaptic(); } catch { /* ignore */ }
    const prevVehicles = vehicles;
    const client = supabase;

    // 1. Optimistic removal from React state
    const nextVehicles = prevVehicles.filter(v => v.id !== vehicleId);
    setVehicles(nextVehicles);
    if (selectedVehicle?.id === vehicleId) {
      setSelectedVehicle(null);
    }

    // 2. Synchronously purge from local browser caches immediately
    safeStorage.setItem('um_cached_vehicles', JSON.stringify(nextVehicles));
    safeStorage.removeItem('um_local_vehicles');

    // 3. Supabase DB Cascade Deletion
    if (client && isSupabaseConnected) {
      try {
        // Explicitly delete child logs and checklist tasks first to prevent FK constraint violations
        await client.from('stage_logs').delete().eq('vehicle_id', vehicleId);
        await client.from('vehicle_tasks').delete().eq('vehicle_id', vehicleId);

        const { error } = await client
          .from('vehicles')
          .delete()
          .eq('id', vehicleId);

        if (error) throw error;
      } catch (err: any) {
        console.error('Supabase delete vehicle error:', err);
        if (isMountedRef.current) {
          setVehicles(prevVehicles);
          safeStorage.setItem('um_cached_vehicles', JSON.stringify(prevVehicles));
          showError('Delete Failed', err?.message || 'Could not delete the vehicle record. Please try again.');
        }
      }
    }
  }, [vehicles, selectedVehicle]);

  // 7. UPDATE URGENCY (Supervisor only)
  const updateUrgency = useCallback(async (vehicleId: string, isUrgent: boolean, note: string) => {
    setVehicles(prev => prev.map(v =>
      v.id === vehicleId ? { ...v, is_urgent: isUrgent, urgent_note: note || null } : v
    ));
    const client = supabase;
    if (client && isSupabaseConnected) {
      try {
        await client.from('vehicles').update({ is_urgent: isUrgent, urgent_note: note || null }).eq('id', vehicleId);
      } catch (err) {
        console.error('Failed to update urgency:', err);
      }
    }
  }, []);

  // Option B: Fetch historical vehicles on-demand for reports
  const fetchHistoricalVehicles = useCallback(async (datePreset: 'today' | 'yesterday' | '7days' | 'month' | 'all'): Promise<Vehicle[]> => {
    const client = supabase;
    if (!client || !isSupabaseConnected) {
      return vehicles;
    }

    try {
      let query = client.from('vehicles').select('*');

      const now = new Date();
      if (datePreset === 'today') {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        query = query.gte('created_at', startOfToday);
      } else if (datePreset === 'yesterday') {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
        query = query.gte('created_at', startOfYesterday.toISOString()).lt('created_at', startOfToday.toISOString());
      } else if (datePreset === '7days') {
        const startOf7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('created_at', startOf7Days);
      } else if (datePreset === 'month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        query = query.gte('created_at', startOfMonth);
      }
      // 'all' has no date bounds

      const { data: dbVehicles, error: vErr } = await query.order('created_at', { ascending: false });
      if (vErr) throw vErr;
      if (!dbVehicles || dbVehicles.length === 0) return [];

      const vIds = dbVehicles.map(v => v.id);

      const [tRes, lRes] = await Promise.all([
        client.from('vehicle_tasks').select('*').in('vehicle_id', vIds),
        client.from('stage_logs').select('*').in('vehicle_id', vIds).order('entered_at', { ascending: true }),
      ]);

      const taskMap = new Map<string, VehicleTask[]>();
      (tRes.data || []).forEach((t: VehicleTask) => {
        if (!taskMap.has(t.vehicle_id)) taskMap.set(t.vehicle_id, []);
        taskMap.get(t.vehicle_id)!.push(t);
      });

      const logMap = new Map<string, StageLog[]>();
      (lRes.data || []).forEach((l: StageLog) => {
        if (!logMap.has(l.vehicle_id)) logMap.set(l.vehicle_id, []);
        logMap.get(l.vehicle_id)!.push(l);
      });

      return dbVehicles.map((v: any) => ({
        id: v.id,
        vehicle_no: v.vehicle_no,
        current_zone: v.current_zone as BayZone,
        assigned_tech: v.assigned_tech || 'Unassigned',
        remarks: v.remarks || '',
        intake_at: v.intake_at,
        completed_at: v.completed_at || null,
        is_finished: v.is_finished,
        created_at: v.created_at,
        status: v.status || 'active',
        is_urgent: v.is_urgent || false,
        urgent_note: v.urgent_note || null,
        is_paused: v.is_paused || false,
        paused_at: v.paused_at || null,
        paused_seconds: v.paused_seconds || 0,
        tasks: taskMap.get(v.id) || [],
        stage_logs: logMap.get(v.id) || [],
      }));
    } catch (err) {
      console.warn('Failed to fetch historical report vehicles:', err);
      return vehicles;
    }
  }, [vehicles]);

  // Option B: Midnight refresh — re-syncs live floor so finished vehicles > 48h old drop off, while active vehicles stay on the floor
  const handleMidnightReset = useCallback(async () => {
    await fetchSupabaseData(false);
  }, [fetchSupabaseData]);

  useDateWatcher(handleMidnightReset);

  const value = useMemo(
    () => ({
      vehicles,
      currentRole,
      setCurrentRole,
      selectedVehicle,
      setSelectedVehicle,
      isAddModalOpen,
      setIsAddModalOpen,
      isConfigModalOpen,
      setIsConfigModalOpen,
      isReportsModalOpen,
      setIsReportsModalOpen,
      searchQuery,
      setSearchQuery,
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
      urgentModalData,
      showUrgentNote,
      hideUrgentNote,
      isLoading,
      isRealtimeConnected,
    }),
    [
      vehicles,
      currentRole,
      selectedVehicle,
      isAddModalOpen,
      isConfigModalOpen,
      isReportsModalOpen,
      searchQuery,
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
      urgentModalData,
      showUrgentNote,
      hideUrgentNote,
      isLoading,
      isRealtimeConnected,
    ]
  );

  return (
    <VehicleContext.Provider value={value}>
      {children}
    </VehicleContext.Provider>
  );
};

export const useVehicles = () => {
  const ctx = useContext(VehicleContext);
  if (!ctx) throw new Error('useVehicles must be used within VehicleProvider');
  return ctx;
};
