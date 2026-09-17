import React, { createContext, useContext, useCallback, useMemo, useEffect, ReactNode } from 'react';
import { Vehicle, BayZone, TaskType, UserRole, NavigationTab } from '../types/vehicle';
import { DateFilterPreset } from '../utils/reportExportUtils';
import { vehicleService } from '../services/vehicleService';
import { outboxService } from '../services/outboxService';
import { hapticService } from '../lib/haptics';
import { getBreakOverlap } from '../utils/workshopHoursUtils';
import { APP_TERMINOLOGY } from '../constants/terminology';
import { isSupabaseConnected } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { VehicleInternalContext } from './VehicleStateContext';

const showError = (title: string, message: string) => {
  console.warn(`[${title}] ${message}`);
};

const isNetworkOrOfflineError = (err: any): boolean => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('failed to fetch') ||
    msg.includes('offline') ||
    msg.includes('timeout') ||
    msg.includes('abort') ||
    msg.includes('connection') ||
    msg.includes('supabase is not connected')
  );
};

export interface VehicleDispatchContextType {
  addVehicle: (
    vehicleNo: string,
    tasks: TaskType[],
    targetZone: BayZone,
    assignedTech: string,
    remarks: string,
    isUrgent?: boolean,
    urgentNote?: string | null,
    technicianName?: string | null,
    isBooking?: boolean,
    hasAdditionalRepairs?: boolean
  ) => Promise<void>;
  updateVehiclePlate: (vehicleId: string, newPlate: string) => Promise<boolean>;
  toggleVehiclePause: (vehicleId: string, isPaused: boolean, reason?: string) => Promise<boolean>;
  updateVehicleJobOrder: (
    vehicleId: string,
    updatedTaskTypes: TaskType[],
    updatedRemarks: string,
    urgencyData?: { is_urgent: boolean; urgent_note: string | null },
    metadata?: {
      vehicle_no?: string;
      technician_name?: string | null;
      is_booking?: boolean;
      has_additional_repairs?: boolean;
    }
  ) => Promise<void>;
  toggleTaskCompletion: (vehicleId: string, taskId: string, completedBy?: string) => Promise<void>;
  transferVehicleZone: (
    vehicleId: string,
    targetZone: BayZone,
    targetZoneName: string,
    techName?: string
  ) => Promise<boolean>;
  startStageWork: (vehicleId: string, startedBy: string) => Promise<boolean>;
  finishVehicleJobSheet: (vehicleId: string, advisorName: string) => Promise<boolean>;
  deleteVehicle: (vehicleId: string) => Promise<void>;
  updateUrgency: (vehicleId: string, isUrgent: boolean, note?: string | null) => Promise<void>;
  refreshVehicles: () => Promise<void>;
  fetchHistoricalVehicles: (
    datePreset: DateFilterPreset,
    customStartDate?: string,
    customEndDate?: string
  ) => Promise<Vehicle[]>;
  drainOutbox: () => Promise<{ successCount: number; failureCount: number }>;
  setSelectedVehicle: (vehicle: Vehicle | null) => void;
  setCurrentRole: (role: UserRole) => void;
  setActiveTab: (tab: NavigationTab) => void;
}

export const VehicleDispatchContext = createContext<VehicleDispatchContextType | undefined>(undefined);

export const VehicleDispatchProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { activeBranchId } = useAuth();
  const internal = useContext(VehicleInternalContext);

  if (!internal) {
    throw new Error('VehicleDispatchProvider must be nested within VehicleStateProvider');
  }

  const {
    setVehicles,
    setSelectedVehicle,
    setCurrentRole,
    setActiveTab,
    vehiclesRef,
    selectedVehicleStateRef,
    locallyCreatedVehiclesRef,
    isMountedRef,
    debouncedRefetch,
    fetchSupabaseData,
  } = internal;

  // Drain Outbox
  const drainOutbox = useCallback(async () => {
    const res = await outboxService.drainQueue();
    if (res.successCount > 0) {
      debouncedRefetch();
    }
    return res;
  }, [debouncedRefetch]);

  // Auto-drain when connection is restored, tab becomes visible/focused, or via retry interval
  useEffect(() => {
    const triggerDrainIfPending = () => {
      if (outboxService.getPendingCount() > 0) {
        drainOutbox();
      }
    };

    // 1. Initial check on mount
    triggerDrainIfPending();

    // 2. Subscribe to queue changes: set up periodic retry interval if items are pending
    let retryTimer: any = null;
    const updateRetryInterval = (pendingCount: number) => {
      if (pendingCount > 0 && !retryTimer) {
        retryTimer = setInterval(() => {
          triggerDrainIfPending();
        }, 12000); // Check and retry every 12 seconds while items are pending
      } else if (pendingCount === 0 && retryTimer) {
        clearInterval(retryTimer);
        retryTimer = null;
      }
    };

    const unsubscribe = outboxService.subscribe((count) => {
      updateRetryInterval(count);
    });

    // 3. Web lifecycle listeners for connection recovery and focus/visibility return
    if (typeof window !== 'undefined') {
      const handleOnline = () => triggerDrainIfPending();
      const handleVisibilityChange = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          triggerDrainIfPending();
        }
      };
      const handleFocus = () => triggerDrainIfPending();

      window.addEventListener('online', handleOnline);
      window.addEventListener('focus', handleFocus);
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibilityChange);
      }

      return () => {
        unsubscribe();
        if (retryTimer) clearInterval(retryTimer);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('focus', handleFocus);
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        }
      };
    }

    return () => {
      unsubscribe();
      if (retryTimer) clearInterval(retryTimer);
    };
  }, [drainOutbox]);

  // 1. ADD VEHICLE
  const addVehicle = useCallback(
    async (
      vehicleNo: string,
      tasks: TaskType[],
      targetZone: BayZone,
      assignedTech: string,
      remarks: string,
      isUrgent = false,
      urgentNote: string | null = null,
      technicianName: string | null = null,
      isBooking = false,
      hasAdditionalRepairs = false
    ) => {
      const cleanNo = vehicleNo.trim().toUpperCase();
      const currentList = vehiclesRef.current;
      const existing = currentList.find(v => !v.is_finished && v.vehicle_no.trim().toUpperCase() === cleanNo);
      if (existing) {
        showError('Duplicate Vehicle', `Vehicle ${cleanNo} is already active in the workshop.`);
        return;
      }

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
        technician_name: technicianName || null,
        assigned_tech: assignedTech || 'Unassigned',
        remarks: remarks || '',
        is_booking: isBooking,
        has_additional_repairs: hasAdditionalRepairs,
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
            visit_number: 1,
            entered_at: now,
            exited_at: null,
            duration_seconds: 0,
            work_started_at: null,
            idle_seconds: 0,
            moved_by: 'Job Supervisor',
            technician_name: technicianName || null,
          },
        ],
      };

      const prevVehicles = currentList;
      setVehicles(prev => [newVehicle, ...prev]);

      try {
        const created = await vehicleService.createVehicle(
          {
            vehicle_no: cleanNo,
            current_zone: targetZone,
            technician_name: technicianName || null,
            assigned_tech: assignedTech || 'Unassigned',
            remarks: remarks || '',
            is_booking: isBooking,
            has_additional_repairs: hasAdditionalRepairs,
            intake_at: now,
            status: 'active',
            is_urgent: isUrgent,
            urgent_note: isUrgent ? (urgentNote?.trim() || null) : null,
            branch_id: activeBranchId,
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
        console.error('[VehicleDispatchContext] addVehicle error:', err);
        if (isMountedRef.current) {
          setVehicles(prevVehicles);
          showError('Add Vehicle Failed', 'Could not save the vehicle. Please try again.');
        }
      }
    },
    [activeBranchId, setVehicles, locallyCreatedVehiclesRef, isMountedRef, vehiclesRef]
  );

  // 2. UPDATE VEHICLE LICENSE PLATE
  const updateVehiclePlate = useCallback(
    async (vehicleId: string, newPlate: string): Promise<boolean> => {
      const cleanPlate = newPlate.trim().toUpperCase();
      if (!cleanPlate) {
        showError('Invalid Plate', 'License plate cannot be empty.');
        return false;
      }

      const prevVehicles = vehiclesRef.current;
      setVehicles(prev =>
        prev.map(v => (v.id === vehicleId ? { ...v, vehicle_no: cleanPlate } : v))
      );

      try {
        await vehicleService.updateVehiclePlate(vehicleId, cleanPlate);
        try { hapticService.triggerSuccessHaptic(); } catch { /* ignore */ }
        return true;
      } catch (err: any) {
        if (isNetworkOrOfflineError(err)) {
          console.warn('[VehicleDispatchContext] Offline: Enqueued updateVehiclePlate to outbox');
          outboxService.enqueue('UPDATE_PLATE', { vehicleId, newPlate: cleanPlate }, activeBranchId);
          try { hapticService.triggerLightHaptic(); } catch { /* ignore */ }
          return true;
        }
        console.error('[VehicleDispatchContext] updateVehiclePlate error:', err);
        if (isMountedRef.current) {
          setVehicles(prevVehicles);
          showError('Update Failed', err?.message || 'Could not update vehicle license plate.');
        }
        return false;
      }
    },
    [activeBranchId, setVehicles, isMountedRef, vehiclesRef]
  );

  // 3. TOGGLE VEHICLE PAUSE / HOLD
  const toggleVehiclePause = useCallback(
    async (vehicleId: string, isPaused: boolean, reason?: string): Promise<boolean> => {
      const prevVehicles = vehiclesRef.current;
      const nowIso = new Date().toISOString();

      setVehicles(prev =>
        prev.map(v => {
          if (v.id !== vehicleId) return v;
          return {
            ...v,
            is_paused: isPaused,
            paused_at: isPaused ? nowIso : null,
            pause_reason: isPaused ? (reason || 'major_repair') : null,
            status: isPaused ? 'on_hold' : 'active',
          };
        })
      );

      try {
        await vehicleService.togglePauseVehicle(vehicleId, isPaused, reason);
        try { hapticService.triggerLightHaptic(); } catch { /* ignore */ }
        return true;
      } catch (err: any) {
        if (isNetworkOrOfflineError(err)) {
          console.warn('[VehicleDispatchContext] Offline: Enqueued toggleVehiclePause to outbox');
          outboxService.enqueue('TOGGLE_PAUSE', { vehicleId, isPaused, reason }, activeBranchId);
          try { hapticService.triggerLightHaptic(); } catch { /* ignore */ }
          return true;
        }
        console.error('[VehicleDispatchContext] toggleVehiclePause error:', err);
        if (isMountedRef.current) {
          setVehicles(prevVehicles);
          showError('Pause Failed', err?.message || 'Could not update vehicle hold state.');
        }
        return false;
      }
    },
    [activeBranchId, setVehicles, isMountedRef, vehiclesRef]
  );

  // 4. UPDATE JOB ORDER
  const updateVehicleJobOrder = useCallback(
    async (
      vehicleId: string,
      updatedTaskTypes: TaskType[],
      updatedRemarks: string,
      urgencyData?: { is_urgent: boolean; urgent_note: string | null },
      metadata?: {
        vehicle_no?: string;
        technician_name?: string | null;
        is_booking?: boolean;
        has_additional_repairs?: boolean;
      }
    ) => {
      try { hapticService.triggerLightHaptic(); } catch { /* ignore */ }
      const currentList = vehiclesRef.current;
      const targetVehicle = currentList.find(v => v.id === vehicleId);
      if (!targetVehicle) return;

      const completedTaskTypes = targetVehicle.tasks
        .filter(t => t.is_completed)
        .map(t => t.task_type);

      const finalTaskTypes = Array.from(new Set([...completedTaskTypes, ...updatedTaskTypes]));
      const prevVehicles = currentList;

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
            ...(metadata?.vehicle_no ? { vehicle_no: metadata.vehicle_no.trim().toUpperCase() } : {}),
            ...(metadata?.technician_name !== undefined ? { technician_name: metadata.technician_name } : {}),
            ...(metadata?.is_booking !== undefined ? { is_booking: metadata.is_booking } : {}),
            ...(metadata?.has_additional_repairs !== undefined ? { has_additional_repairs: metadata.has_additional_repairs } : {}),
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
          urgencyData,
          metadata
        );
      } catch (err) {
        if (isNetworkOrOfflineError(err)) {
          console.warn('[VehicleDispatchContext] Offline: Enqueued updateVehicleJobOrder to outbox');
          outboxService.enqueue('UPDATE_JOB_ORDER', {
            vehicleId,
            currentTasks: targetVehicle.tasks,
            finalTaskTypes,
            updatedRemarks,
            urgencyData,
            metadata,
          }, activeBranchId);
          return;
        }
        console.error('[VehicleDispatchContext] updateJobOrder error:', err);
        if (isMountedRef.current) {
          setVehicles(prevVehicles);
          showError('Update Failed', 'Could not update vehicle job order.');
        }
      }
    },
    [activeBranchId, setVehicles, isMountedRef, vehiclesRef]
  );

  // 5. TOGGLE TASK COMPLETION
  const toggleTaskCompletion = useCallback(
    async (vehicleId: string, taskId: string, completedBy?: string) => {
      try { hapticService.triggerSuccessHaptic(); } catch { /* ignore */ }
      const currentList = vehiclesRef.current;
      const targetVehicle = currentList.find(v => v.id === vehicleId);
      const targetTask = targetVehicle?.tasks.find(t => t.id === taskId);
      if (!targetTask) return;

      const nextCompleted = !targetTask.is_completed;
      const prevVehicles = currentList;

      setVehicles(prev =>
        prev.map(v => {
          if (v.id !== vehicleId) return v;
          return {
            ...v,
            tasks: v.tasks.map(t =>
              t.id === taskId
                ? {
                    ...t,
                    is_completed: nextCompleted,
                    completed_at: nextCompleted ? new Date().toISOString() : null,
                    completed_by: nextCompleted ? (completedBy || 'Technician') : null,
                  }
                : t
            ),
          };
        })
      );

      try {
        await vehicleService.toggleTask(
          taskId,
          nextCompleted,
          completedBy,
          targetTask ? { vehicleId, taskType: targetTask.task_type } : undefined
        );
      } catch (err) {
        if (isNetworkOrOfflineError(err)) {
          console.warn('[VehicleDispatchContext] Offline: Enqueued toggleTask to outbox');
          outboxService.enqueue('TOGGLE_TASK', { taskId, nextCompleted, completedBy }, activeBranchId);
          return;
        }
        console.error('[VehicleDispatchContext] toggleTask error:', err);
        if (isMountedRef.current) {
          setVehicles(prevVehicles);
          showError('Task Update Failed', 'Could not update task status.');
        }
      }
    },
    [activeBranchId, setVehicles, isMountedRef, vehiclesRef]
  );

  // 6. START STAGE WORK
  const startStageWork = useCallback(
    async (vehicleId: string, startedBy: string): Promise<boolean> => {
      const now = new Date().toISOString();
      const currentList = vehiclesRef.current;
      const targetVehicle = currentList.find(v => v.id === vehicleId);
      if (!targetVehicle) return false;

      const activeLog = targetVehicle.stage_logs.find(l => !l.exited_at && !l.work_started_at);
      const computedIdle = activeLog?.entered_at
        ? Math.max(0, Math.floor((new Date(now).getTime() - new Date(activeLog.entered_at).getTime()) / 1000))
        : 0;

      let isPersistedOrQueued = false;

      try {
        await vehicleService.startWork(
          vehicleId,
          startedBy,
          now,
          activeLog?.id || null,
          activeLog?.entered_at || null
        );
        isPersistedOrQueued = true;
        try { hapticService.triggerLightHaptic(); } catch { /* ignore */ }
      } catch (err: any) {
        if (isNetworkOrOfflineError(err)) {
          console.warn('[VehicleDispatchContext] Offline: Enqueued startStageWork to outbox');
          outboxService.enqueue('START_STAGE_WORK', { vehicleId, startedBy }, activeBranchId);
          try { hapticService.triggerLightHaptic(); } catch { /* ignore */ }
          isPersistedOrQueued = true;
        } else {
          console.error('[VehicleDispatchContext] startStageWork error:', err);
          if (isMountedRef.current) {
            showError('Start Work Failed', err?.message || 'Could not start work on vehicle. Please try again.');
          }
          return false;
        }
      }

      if (isPersistedOrQueued) {
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
      }
      return false;
    },
    [activeBranchId, setVehicles, isMountedRef, vehiclesRef]
  );

  // 7. TRANSFER VEHICLE ZONE
  const transferVehicleZone = useCallback(
    async (vehicleId: string, targetZone: BayZone, targetZoneName: string, techName?: string): Promise<boolean> => {
      const now = new Date().toISOString();
      const currentList = vehiclesRef.current;
      const targetVehicle = currentList.find(v => v.id === vehicleId);
      if (!targetVehicle) return false;
      const lastLog = targetVehicle.stage_logs[targetVehicle.stage_logs.length - 1] || null;

      const currentBayTask = targetVehicle.tasks.find(
        t => t.is_required && !t.is_completed && APP_TERMINOLOGY.tasks[t.task_type]?.stationId === targetVehicle.current_zone
      );

      const mover = techName || targetZoneName || 'Staff';
      let isPersistedOrQueued = false;

      try {
        if (currentBayTask) {
          await toggleTaskCompletion(vehicleId, currentBayTask.id, mover);
        }

        const enterMs = lastLog?.entered_at ? new Date(lastLog.entered_at).getTime() : new Date(now).getTime();
        const exitMs = new Date(now).getTime();
        const queueIn = lastLog?.work_started_at
          ? Math.max(0, Math.floor((new Date(lastLog.work_started_at).getTime() - enterMs) / 1000))
          : Math.max(0, Math.floor((exitMs - enterMs) / 1000));

        const bayTask = targetVehicle.tasks.find(
          t => APP_TERMINOLOGY.tasks[t.task_type]?.stationId === targetVehicle.current_zone
        );
        const taskDoneMs = currentBayTask ? exitMs : (bayTask?.completed_at ? new Date(bayTask.completed_at).getTime() : Number.NaN);
        const queueOut = !Number.isNaN(taskDoneMs) && taskDoneMs >= enterMs && taskDoneMs <= exitMs
          ? Math.max(0, Math.floor((exitMs - taskDoneMs) / 1000))
          : 0;
        const totalIdleForBay = lastLog?.work_started_at ? (queueIn + queueOut) : queueIn;

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
        isPersistedOrQueued = true;
        try { hapticService.triggerSuccessHaptic(); } catch { /* ignore */ }
      } catch (err: any) {
        if (isNetworkOrOfflineError(err)) {
          console.warn('[VehicleDispatchContext] Offline: Enqueued transferVehicleZone to outbox');
          outboxService.enqueue('TRANSFER_ZONE', { vehicleId, toZone: targetZone, movedBy: mover }, activeBranchId);
          try { hapticService.triggerLightHaptic(); } catch { /* ignore */ }
          isPersistedOrQueued = true;
        } else {
          console.error('[VehicleDispatchContext] transferVehicleZone error:', err);
          if (isMountedRef.current) {
            showError('Transfer Failed', err?.message || 'Could not move the vehicle. The change has been reverted.');
          }
          return false;
        }
      }

      if (isPersistedOrQueued) {
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

              const queueIn = prevL.work_started_at
                ? Math.max(0, Math.floor((new Date(prevL.work_started_at).getTime() - entered) / 1000))
                : dur;

              const bayTask = v.tasks.find(
                t => APP_TERMINOLOGY.tasks[t.task_type]?.stationId === v.current_zone
              );
              const taskCompletedMs = bayTask?.completed_at ? new Date(bayTask.completed_at).getTime() : Number.NaN;
              const queueOut = !Number.isNaN(taskCompletedMs) && taskCompletedMs >= entered && taskCompletedMs <= exitTime
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
              effective_completed_at: targetZone === 'inspection' ? now : null,
              is_finished: targetZone === 'completed',
              stage_logs: updatedLogs,
              is_paused: false,
              paused_at: null,
            };
          })
        );
        return true;
      }
      return false;
    },
    [activeBranchId, setVehicles, isMountedRef, toggleTaskCompletion, vehiclesRef]
  );

  // 8. FINISH VEHICLE JOB SHEET
  const finishVehicleJobSheet = useCallback(
    async (vehicleId: string, advisorName: string): Promise<boolean> => {
      const now = new Date().toISOString();
      const currentList = vehiclesRef.current;
      const targetVehicle = currentList.find(v => v.id === vehicleId);
      if (!targetVehicle) return false;
      const lastLog = targetVehicle.stage_logs[targetVehicle.stage_logs.length - 1] || null;
      let isPersistedOrQueued = false;

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
        isPersistedOrQueued = true;
        try { hapticService.triggerSuccessHaptic(); } catch { /* ignore */ }
      } catch (err: any) {
        if (isNetworkOrOfflineError(err)) {
          console.warn('[VehicleDispatchContext] Offline: Enqueued finishVehicleJobSheet to outbox');
          outboxService.enqueue('FINISH_JOB', { vehicleId, advisorName }, activeBranchId);
          try { hapticService.triggerLightHaptic(); } catch { /* ignore */ }
          isPersistedOrQueued = true;
        } else {
          console.error('[VehicleDispatchContext] finishJob error:', err);
          if (isMountedRef.current) {
            showError('Finish Failed', err?.message || 'Could not complete the vehicle job sheet. Please try again.');
          }
          return false;
        }
      }

      if (isPersistedOrQueued) {
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
      }
      return false;
    },
    [activeBranchId, setVehicles, isMountedRef, vehiclesRef]
  );

  // 9. DELETE VEHICLE
  const deleteVehicle = useCallback(
    async (vehicleId: string) => {
      try { hapticService.triggerLightHaptic(); } catch { /* ignore */ }
      const prevVehicles = vehiclesRef.current;

      setVehicles(prev => prev.filter(v => v.id !== vehicleId));
      if (selectedVehicleStateRef.current?.id === vehicleId) {
        setSelectedVehicle(null);
      }

      try {
        await vehicleService.deleteVehicle(vehicleId);
      } catch (err) {
        console.error('[VehicleDispatchContext] deleteVehicle error:', err);
        if (isMountedRef.current) {
          setVehicles(prevVehicles);
          showError('Delete Failed', 'Could not delete vehicle.');
        }
      }
    },
    [setVehicles, setSelectedVehicle, selectedVehicleStateRef, isMountedRef, vehiclesRef]
  );

  // 10. UPDATE URGENCY
  const updateUrgency = useCallback(
    async (vehicleId: string, isUrgent: boolean, note?: string | null) => {
      try { hapticService.triggerLightHaptic(); } catch { /* ignore */ }
      const prevVehicles = vehiclesRef.current;
      const cleanNote = note ? note.trim() : null;

      setVehicles(prev =>
        prev.map(v => (v.id === vehicleId ? { ...v, is_urgent: isUrgent, urgent_note: isUrgent ? cleanNote : null } : v))
      );

      try {
        await vehicleService.updateUrgency(vehicleId, isUrgent, isUrgent ? cleanNote : null);
      } catch (err) {
        console.error('[VehicleDispatchContext] updateUrgency error:', err);
        if (isMountedRef.current) {
          setVehicles(prevVehicles);
          showError('Urgency Update Failed', 'Could not update vehicle priority.');
        }
      }
    },
    [setVehicles, isMountedRef, vehiclesRef]
  );

  // 11. HISTORICAL VEHICLES QUERY
  const fetchHistoricalVehicles = useCallback(
    async (
      datePreset: DateFilterPreset,
      customStartDate?: string,
      customEndDate?: string
    ): Promise<Vehicle[]> => {
      if (!isSupabaseConnected) return vehiclesRef.current;
      try {
        return await vehicleService.fetchHistoricalVehicles(datePreset, customStartDate, customEndDate, activeBranchId);
      } catch (err) {
        console.warn('[VehicleDispatchContext] fetchHistoricalVehicles error:', err);
        return vehiclesRef.current;
      }
    },
    [activeBranchId, vehiclesRef]
  );

  const dispatchValue = useMemo<VehicleDispatchContextType>(
    () => ({
      addVehicle,
      updateVehiclePlate,
      toggleVehiclePause,
      updateVehicleJobOrder,
      toggleTaskCompletion,
      transferVehicleZone,
      startStageWork,
      finishVehicleJobSheet,
      deleteVehicle,
      updateUrgency,
      refreshVehicles: () => fetchSupabaseData(false),
      fetchHistoricalVehicles,
      drainOutbox,
      setSelectedVehicle,
      setCurrentRole,
      setActiveTab,
    }),
    [
      addVehicle,
      updateVehiclePlate,
      toggleVehiclePause,
      updateVehicleJobOrder,
      toggleTaskCompletion,
      transferVehicleZone,
      startStageWork,
      finishVehicleJobSheet,
      deleteVehicle,
      updateUrgency,
      fetchSupabaseData,
      fetchHistoricalVehicles,
      drainOutbox,
      setSelectedVehicle,
      setCurrentRole,
      setActiveTab,
    ]
  );

  return (
    <VehicleDispatchContext.Provider value={dispatchValue}>
      {children}
    </VehicleDispatchContext.Provider>
  );
};

export const useVehicleDispatch = (): VehicleDispatchContextType => {
  const ctx = useContext(VehicleDispatchContext);
  if (!ctx) {
    throw new Error('useVehicleDispatch must be used within a VehicleDispatchProvider');
  }
  return ctx;
};
