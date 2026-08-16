import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { Platform, Alert } from 'react-native';
import { Vehicle, UserRole, BayZone, TaskType, VehicleTask, StageLog } from '../types/vehicle';
import { supabase, isSupabaseConnected, safeStorage } from '../lib/supabase';
import { chimeService } from '../lib/chime';

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
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  addVehicle: (vehicleNo: string, tasks: TaskType[], targetZone: BayZone, assignedTech: string, remarks: string) => Promise<void>;
  updateVehicleJobOrder: (vehicleId: string, updatedTaskTypes: TaskType[], updatedRemarks: string) => Promise<void>;
  toggleTaskCompletion: (vehicleId: string, taskId: string, completedBy: string) => Promise<void>;
  transferVehicleZone: (vehicleId: string, toZone: BayZone, movedBy: string) => Promise<void>;
  finishVehicleJobSheet: (vehicleId: string, advisorName: string) => Promise<void>;
  refreshVehicles: () => Promise<void>;
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
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
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

  // Sync to local storage on web
  useEffect(() => {
    if (vehicles.length > 0) {
      safeStorage.setItem('um_cached_vehicles', JSON.stringify(vehicles));
    }
  }, [vehicles]);

  // Fetch from Supabase with parallel Promise.all
  const fetchSupabaseData = useCallback(async (isInitialLoad: boolean = false) => {
    const client = supabase;
    if (!client || !isSupabaseConnected) return;
    if (isInitialLoad && vehicles.length === 0) setIsLoading(true);

    try {
      const [vRes, tRes, lRes] = await Promise.all([
        client.from('vehicles').select('*').order('created_at', { ascending: false }),
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

    const client = supabase;
    if (client && isSupabaseConnected) {
      const channel = client
        .channel('public:vehicle_changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vehicles' }, (payload) => {
          if (payload.new && isMountedRef.current) {
            const newV = payload.new as Record<string, unknown>;
            setVehicles(prev => {
              if (prev.some(v => v.id === newV.id)) return prev;
              const vehicle: Vehicle = {
                id: newV.id as string,
                vehicle_no: newV.vehicle_no as string,
                current_zone: newV.current_zone as BayZone,
                assigned_tech: (newV.assigned_tech as string) || 'Unassigned',
                remarks: (newV.remarks as string) || '',
                intake_at: newV.intake_at as string,
                completed_at: newV.completed_at as string | null,
                is_finished: newV.is_finished as boolean,
                created_at: newV.created_at as string,
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
            setVehicles(prev => prev.map(v => {
              if (v.id !== updated.id) return v;
              return {
                ...v,
                current_zone: updated.current_zone as BayZone,
                assigned_tech: (updated.assigned_tech as string) || v.assigned_tech,
                remarks: (updated.remarks as string) ?? v.remarks,
                is_finished: updated.is_finished as boolean,
                completed_at: updated.completed_at as string | null,
              };
            }));
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
    remarks: string
  ) => {
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

    const initialLog: StageLog = {
      id: `log-${newId}-1`,
      vehicle_id: newId,
      from_zone: null,
      to_zone: targetZone,
      entered_at: now,
      duration_seconds: 0,
      moved_by: 'Job Supervisor'
    };

    const newVehicle: Vehicle = {
      id: newId,
      vehicle_no: vehicleNo.trim().toUpperCase(),
      current_zone: targetZone,
      assigned_tech: assignedTech || 'Job Supervisor',
      remarks,
      intake_at: now,
      is_finished: false,
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
            intake_at: now
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
          moved_by: 'Job Supervisor'
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

    // 2. Server-side RPC (atomic, with row locking)
    const client = supabase;
    if (client && isSupabaseConnected) {
      try {
        const { error } = await client.rpc('toggle_task_completion', {
          p_task_id: taskId,
          p_completed_by: completedBy
        });

        if (error) throw error;
      } catch (err) {
        console.error('Supabase task toggle error:', err);
        if (isMountedRef.current) {
          setVehicles(prevVehicles);
          showError('Task Update Failed', 'Could not save the task change. It has been reverted.');
        }
      }
    }
  }, [vehicles]);

  // 3. TRANSFER VEHICLE ZONE (Optimistic + RPC + Rollback)
  const transferVehicleZone = useCallback(async (vehicleId: string, toZone: BayZone, movedBy: string) => {
    try { chimeService.playChime(); } catch { /* ignore audio error */ }
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
          const entered = new Date(updatedLogs[lastLogIdx].entered_at).getTime();
          const dur = Math.floor((new Date(now).getTime() - entered) / 1000);
          updatedLogs[lastLogIdx] = {
            ...updatedLogs[lastLogIdx],
            exited_at: now,
            duration_seconds: dur
          };
        }

        updatedLogs.push({
          id: `log-${v.id}-${Date.now()}`,
          vehicle_id: v.id,
          from_zone: fromZone,
          to_zone: toZone,
          entered_at: now,
          duration_seconds: 0,
          moved_by: movedBy
        });

        return { ...v, current_zone: toZone, stage_logs: updatedLogs };
      })
    );

    // 2. Server-side RPC (atomic transaction)
    const client = supabase;
    if (client && isSupabaseConnected) {
      try {
        const { error } = await client.rpc('transfer_vehicle_zone', {
          p_vehicle_id: vehicleId,
          p_to_zone: toZone,
          p_moved_by: movedBy
        });

        if (error) throw error;
      } catch (err) {
        console.error('Supabase zone transfer error:', err);
        if (isMountedRef.current) {
          setVehicles(prevVehicles);
          showError('Transfer Failed', 'Could not move the vehicle. The change has been reverted.');
        }
      }
    }
  }, [vehicles]);

  // 4. FINISH VEHICLE JOB SHEET (Service Advisor — RPC)
  const finishVehicleJobSheet = useCallback(async (vehicleId: string, advisorName: string) => {
    const now = new Date().toISOString();
    const prevVehicles = vehicles;
    const client = supabase;

    // Optimistic update
    setVehicles(prev =>
      prev.map(v => {
        if (v.id !== vehicleId) return v;
        return { ...v, current_zone: 'completed' as BayZone, is_finished: true, completed_at: now };
      })
    );

    if (client && isSupabaseConnected) {
      try {
        const { error } = await client.rpc('finish_vehicle_job', {
          p_vehicle_id: vehicleId,
          p_advisor_name: advisorName
        });

        if (error) throw error;
      } catch (err) {
        console.error('Supabase finish job error:', err);
        if (isMountedRef.current) {
          setVehicles(prevVehicles);
          showError('Finish Failed', 'Could not complete the vehicle job sheet. Please try again.');
        }
      }
    }
  }, [vehicles]);

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
      searchQuery,
      setSearchQuery,
      addVehicle,
      updateVehicleJobOrder,
      toggleTaskCompletion,
      transferVehicleZone,
      finishVehicleJobSheet,
      refreshVehicles: fetchSupabaseData,
      isLoading,
      isRealtimeConnected,
    }),
    [
      vehicles,
      currentRole,
      selectedVehicle,
      isAddModalOpen,
      isConfigModalOpen,
      searchQuery,
      addVehicle,
      updateVehicleJobOrder,
      toggleTaskCompletion,
      transferVehicleZone,
      finishVehicleJobSheet,
      fetchSupabaseData,
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
