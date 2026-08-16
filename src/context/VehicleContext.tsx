import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform } from 'react-native';
import { Vehicle, UserRole, BayZone, TaskType, VehicleTask } from '../types/vehicle';
import { INITIAL_MOCK_VEHICLES } from '../lib/mockData';
import { supabase, isSupabaseConnected } from '../lib/supabase';
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

export const VehicleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>(() => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('um_cached_vehicles') || localStorage.getItem('um_local_vehicles');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Remove legacy dummy vehicles starting with v-10
            const clean = parsed.filter((v: any) => v && v.id && !v.id.startsWith('v-10'));
            return clean;
          }
        } catch (e) { /* fallback */ }
      }
    }
    return [];
  });

  const [currentRole, setCurrentRole] = useState<UserRole>('supervisor');
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    // Only show loading spinner if connected to Supabase AND no cached vehicles exist yet
    if (isSupabaseConnected) {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('um_cached_vehicles');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) return false;
          } catch (e) {}
        }
      }
      return true;
    }
    return false;
  });
  const [isRealtimeConnected, setIsRealtimeConnected] = useState<boolean>(isSupabaseConnected);

  // Sync to local storage on web
  useEffect(() => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined' && vehicles.length > 0) {
      localStorage.setItem('um_cached_vehicles', JSON.stringify(vehicles));
    }
  }, [vehicles]);

  // Fetch from Supabase with parallel Promise.all (3x faster)
  const fetchSupabaseData = async (isInitialLoad: boolean = false) => {
    const client = supabase;
    if (!client || !isSupabaseConnected) return;
    if (isInitialLoad && vehicles.length === 0) setIsLoading(true);

    try {
      // Execute all 3 queries in parallel to cut network roundtrip time by 3x
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

      // Create quick lookup maps for fast sub-millisecond assembly
      const taskMap = new Map<string, any[]>();
      dbTasks.forEach((t: any) => {
        if (!taskMap.has(t.vehicle_id)) taskMap.set(t.vehicle_id, []);
        taskMap.get(t.vehicle_id)!.push(t);
      });

      const logMap = new Map<string, any[]>();
      dbLogs.forEach((l: any) => {
        if (!logMap.has(l.vehicle_id)) logMap.set(l.vehicle_id, []);
        logMap.get(l.vehicle_id)!.push(l);
      });

      const formatted: Vehicle[] = dbVehicles.map((v: any) => ({
        id: v.id,
        vehicle_no: v.vehicle_no,
        current_zone: v.current_zone,
        assigned_tech: v.assigned_tech || 'Unassigned',
        remarks: v.remarks || '',
        intake_at: v.intake_at,
        completed_at: v.completed_at,
        is_finished: v.is_finished,
        created_at: v.created_at,
        tasks: taskMap.get(v.id) || [],
        stage_logs: logMap.get(v.id) || []
      }));

      setVehicles(formatted);
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem('um_cached_vehicles', JSON.stringify(formatted));
      }
      setIsRealtimeConnected(true);
    } catch (err) {
      console.warn('Supabase fetch error, fallback to local state:', err);
      setIsRealtimeConnected(false);
    } finally {
      if (isInitialLoad) setIsLoading(false);
    }
  };

  // Realtime channel subscriptions
  useEffect(() => {
    fetchSupabaseData(true);

    const client = supabase;
    if (client && isSupabaseConnected) {
      const channel = client
        .channel('public:vehicle_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => fetchSupabaseData(false))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_tasks' }, () => fetchSupabaseData(false))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'stage_logs' }, () => fetchSupabaseData(false))
        .subscribe((status) => {
          setIsRealtimeConnected(status === 'SUBSCRIBED');
        });

      return () => {
        client.removeChannel(channel);
      };
    }
  }, []);

  // 1. ADD VEHICLE (Job Supervisor)
  const addVehicle = async (
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

    const initialLog = {
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
      }
    }

    setVehicles(prev => [newVehicle, ...prev]);
  };

  // 1.5 UPDATE VEHICLE JOB ORDER (Supervisor Edit)
  const updateVehicleJobOrder = async (
    vehicleId: string,
    updatedTaskTypes: TaskType[],
    updatedRemarks: string
  ) => {
    const targetVehicle = vehicles.find(v => v.id === vehicleId);
    if (!targetVehicle) return;

    // Completed tasks CANNOT be removed or edited by supervisor
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

      return {
        ...v,
        remarks: updatedRemarks,
        tasks: updatedTasks
      };
    }));
  };

  // 2. TOGGLE TASK COMPLETION (Optimistic Instant Update)
  const toggleTaskCompletion = async (vehicleId: string, taskId: string, completedBy: string) => {
    const now = new Date().toISOString();

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

    // 2. Silent background Supabase sync
    const client = supabase;
    if (client && isSupabaseConnected) {
      try {
        const targetVehicle = vehicles.find(v => v.id === vehicleId);
        const targetTask = targetVehicle?.tasks.find(t => t.id === taskId);
        if (targetTask) {
          const nextState = !targetTask.is_completed;
          await client
            .from('vehicle_tasks')
            .update({
              is_completed: nextState,
              completed_at: nextState ? now : null,
              completed_by: nextState ? completedBy : null
            })
            .eq('id', taskId);
        }
      } catch (err) {
        console.error('Supabase task update error:', err);
      }
    }
  };

  // 3. TRANSFER VEHICLE ZONE (Smooth Instant Transfer)
  const transferVehicleZone = async (vehicleId: string, toZone: BayZone, movedBy: string) => {
    try { chimeService.playChime(); } catch (e) { /* ignore audio error */ }
    const now = new Date().toISOString();

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

        return {
          ...v,
          current_zone: toZone,
          stage_logs: updatedLogs
        };
      })
    );

    // 2. Silent Background Supabase Sync (no re-fetch or loader flash!)
    const client = supabase;
    if (client && isSupabaseConnected) {
      try {
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
          await client
            .from('stage_logs')
            .update({ exited_at: now, duration_seconds: duration })
            .eq('id', activeLog.id);
        }

        await client.from('stage_logs').insert({
          vehicle_id: vehicleId,
          to_zone: toZone,
          entered_at: now,
          moved_by: movedBy
        });

        await client
          .from('vehicles')
          .update({ current_zone: toZone })
          .eq('id', vehicleId);
      } catch (err) {
        console.error('Supabase transfer error:', err);
      }
    }
  };

  // 4. FINISH VEHICLE JOB SHEET (Service Advisor)
  const finishVehicleJobSheet = async (vehicleId: string, advisorName: string) => {
    const now = new Date().toISOString();
    const client = supabase;

    if (client && isSupabaseConnected) {
      try {
        await client
          .from('vehicles')
          .update({
            current_zone: 'completed',
            is_finished: true,
            completed_at: now
          })
          .eq('id', vehicleId);

        await fetchSupabaseData();
        return;
      } catch (err) {
        console.error('Supabase finish job error:', err);
      }
    }

    setVehicles(prev =>
      prev.map(v => {
        if (v.id !== vehicleId) return v;
        return {
          ...v,
          current_zone: 'completed',
          is_finished: true,
          completed_at: now
        };
      })
    );
  };

  return (
    <VehicleContext.Provider
      value={{
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
        isRealtimeConnected
      }}
    >
      {children}
    </VehicleContext.Provider>
  );
};

export const useVehicles = () => {
  const ctx = useContext(VehicleContext);
  if (!ctx) throw new Error('useVehicles must be used within VehicleProvider');
  return ctx;
};
