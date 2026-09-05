import { supabase, isSupabaseConnected } from '../lib/supabase';
import { Vehicle, VehicleTask, StageLog, BayZone, TaskType } from '../types/vehicle';

/**
 * Tier 3 Data Access Service & Repository for Vehicles, Checklists, and Stage Telemetry.
 * Encapsulates all Supabase queries, RPC calls, error fallbacks, and payload shaping.
 */
export const vehicleService = {
  /**
   * Option B Soft-Filtering: Queries active vehicles (is_finished = false)
   * plus jobs finished within the last 48 hours.
   */
  async fetchLiveVehicles(): Promise<Vehicle[]> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return [];

    const cutoff48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const liveFilter = `is_finished.eq.false,created_at.gte.${cutoff48h}`;

    const vRes = await client
      .from('vehicles')
      .select('*')
      .or(liveFilter)
      .order('created_at', { ascending: false });

    if (vRes.error) throw vRes.error;
    const dbVehicles = vRes.data || [];
    const vehicleIds = dbVehicles.map((v: any) => v.id);

    const [tRes, lRes] = vehicleIds.length > 0
      ? await Promise.all([
          client.from('vehicle_tasks').select('*').in('vehicle_id', vehicleIds),
          client.from('stage_logs').select('*').in('vehicle_id', vehicleIds).order('entered_at', { ascending: true }),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];

    if (tRes.error) throw tRes.error;
    if (lRes.error) throw lRes.error;

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

    return dbVehicles.map((v: Record<string, unknown>) => ({
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
      stage_logs: logMap.get(v.id as string) || [],
    }));
  },

  /**
   * On-Demand Historical Range Querying for Service Reports.
   */
  async fetchHistoricalVehicles(datePreset: 'today' | 'yesterday' | '7days' | 'month' | 'all'): Promise<Vehicle[]> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return [];

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
      current_zone: v.current_zone,
      assigned_tech: v.assigned_tech || 'Unassigned',
      remarks: v.remarks || '',
      intake_at: v.intake_at,
      completed_at: v.completed_at,
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
  },

  /**
   * Intakes a new vehicle, creating initial stage_log and checklist tasks in database.
   */
  async createVehicle(
    vehicleData: {
      vehicle_no: string;
      current_zone: BayZone;
      assigned_tech: string;
      remarks: string;
      intake_at: string;
      status: 'active' | 'finished' | 'incomplete';
      is_urgent: boolean;
      urgent_note: string | null;
    },
    tasksList: { task_name: string; task_type: TaskType; is_required: boolean }[]
  ): Promise<Vehicle> {
    const client = supabase;
    if (!client || !isSupabaseConnected) throw new Error('Database not connected');

    const { data: insertedV, error: vErr } = await client
      .from('vehicles')
      .insert({
        vehicle_no: vehicleData.vehicle_no,
        current_zone: vehicleData.current_zone,
        assigned_tech: vehicleData.assigned_tech,
        remarks: vehicleData.remarks,
        intake_at: vehicleData.intake_at,
        status: vehicleData.status,
        is_urgent: vehicleData.is_urgent,
        urgent_note: vehicleData.urgent_note,
        is_finished: false,
      })
      .select()
      .single();

    if (vErr) throw vErr;

    const { data: insertedLog, error: lErr } = await client
      .from('stage_logs')
      .insert({
        vehicle_id: insertedV.id,
        to_zone: vehicleData.current_zone,
        entered_at: vehicleData.intake_at,
        work_started_at: null,
        idle_seconds: 0,
        moved_by: 'Job Supervisor',
      })
      .select()
      .single();

    if (lErr) console.warn('[vehicleService] initial stage_log insert warning:', lErr.message);

    let insertedTasks: VehicleTask[] = [];
    if (tasksList.length > 0) {
      const taskInserts = tasksList.map(t => ({
        vehicle_id: insertedV.id,
        task_name: t.task_name,
        task_type: t.task_type,
        is_required: t.is_required,
        is_completed: false,
      }));

      const { data: tData, error: tErr } = await client
        .from('vehicle_tasks')
        .insert(taskInserts)
        .select();

      if (tErr) console.warn('[vehicleService] vehicle_tasks insert warning:', tErr.message);
      if (tData) insertedTasks = tData as VehicleTask[];
    }

    return {
      id: insertedV.id,
      vehicle_no: insertedV.vehicle_no,
      current_zone: insertedV.current_zone,
      assigned_tech: insertedV.assigned_tech || 'Unassigned',
      remarks: insertedV.remarks || '',
      intake_at: insertedV.intake_at,
      completed_at: insertedV.completed_at,
      is_finished: insertedV.is_finished,
      created_at: insertedV.created_at,
      status: insertedV.status,
      is_urgent: insertedV.is_urgent,
      urgent_note: insertedV.urgent_note,
      is_paused: insertedV.is_paused || false,
      paused_at: insertedV.paused_at,
      paused_seconds: insertedV.paused_seconds || 0,
      tasks: insertedTasks,
      stage_logs: insertedLog ? [insertedLog as StageLog] : [],
    };
  },

  /**
   * Updates vehicle remarks and required tasks matrix.
   */
  async updateJobOrder(
    vehicleId: string,
    existingTasks: VehicleTask[],
    finalTaskTypes: TaskType[],
    updatedRemarks: string
  ): Promise<void> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return;

    const { error: vErr } = await client
      .from('vehicles')
      .update({ remarks: updatedRemarks })
      .eq('id', vehicleId);
    if (vErr) throw vErr;

    const allPossibleTasks: { name: string; type: TaskType }[] = [
      { name: 'General Service', type: 'general_service' },
      { name: 'Hoist Service', type: 'hoist_service' },
      { name: 'Wheel Alignment', type: 'wheel_alignment' },
    ];

    for (const taskDef of allPossibleTasks) {
      const existingTask = existingTasks.find(t => t.task_type === taskDef.type);
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
          is_completed: false,
        });
      }
    }
  },

  /**
   * Toggles task completion state with RPC + direct table fallback.
   */
  async toggleTask(taskId: string, isCompleted: boolean, completedBy?: string): Promise<void> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return;

    const { error } = await client.rpc('toggle_task_completion', {
      p_task_id: taskId,
      p_is_completed: isCompleted,
    });

    if (error) {
      console.warn('[vehicleService] RPC toggle_task_completion fallback:', error.message);
      const { error: directErr } = await client
        .from('vehicle_tasks')
        .update({
          is_completed: isCompleted,
          completed_at: isCompleted ? new Date().toISOString() : null,
          completed_by: isCompleted ? (completedBy || 'Technician') : null,
        })
        .eq('id', taskId);
      if (directErr) throw directErr;
    }
  },

  /**
   * Transfers a vehicle to a new bay, closing active stage log and inserting new log.
   */
  async transferZone(
    vehicleId: string,
    targetZone: BayZone,
    targetZoneName: string,
    fromZone: BayZone | undefined,
    now: string,
    activeLogId: string | null,
    enteredAt: string | null,
    workStartedAt: string | null,
    existingIdleSec?: number
  ): Promise<void> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return;

    const { error } = await client.rpc('transfer_vehicle_zone', {
      p_vehicle_id: vehicleId,
      p_target_zone: targetZone,
      p_target_zone_name: targetZoneName,
      p_transferred_by: 'Staff',
    });

    if (error) {
      console.warn('[vehicleService] RPC transfer_vehicle_zone fallback:', error.message);

      // Close active log
      if (activeLogId && !activeLogId.startsWith('log-')) {
        const entered = enteredAt ? new Date(enteredAt).getTime() : new Date(now).getTime();
        const duration = Math.max(0, Math.floor((new Date(now).getTime() - entered) / 1000));
        const idle = workStartedAt
          ? (existingIdleSec || Math.max(0, Math.floor((new Date(workStartedAt).getTime() - entered) / 1000)))
          : duration;

        await client
          .from('stage_logs')
          .update({ exited_at: now, duration_seconds: duration, idle_seconds: idle })
          .eq('id', activeLogId);
      } else {
        const { data: dbLogs } = await client
          .from('stage_logs')
          .select('*')
          .eq('vehicle_id', vehicleId)
          .is('exited_at', null)
          .order('entered_at', { ascending: false });

        if (dbLogs && dbLogs.length > 0) {
          const activeLog = dbLogs[0];
          const entered = new Date(activeLog.entered_at).getTime();
          const duration = Math.max(0, Math.floor((new Date(now).getTime() - entered) / 1000));
          const idle = activeLog.work_started_at
            ? (activeLog.idle_seconds || Math.max(0, Math.floor((new Date(activeLog.work_started_at).getTime() - entered) / 1000)))
            : duration;
          await client
            .from('stage_logs')
            .update({ exited_at: now, duration_seconds: duration, idle_seconds: idle })
            .eq('id', activeLog.id);
        }
      }

      // Insert new stage log
      await client.from('stage_logs').insert({
        vehicle_id: vehicleId,
        from_zone: fromZone || null,
        to_zone: targetZone,
        entered_at: now,
        work_started_at: null,
        idle_seconds: 0,
        duration_seconds: 0,
      });

      // Update vehicle zone & unpause
      const { error: directErr } = await client
        .from('vehicles')
        .update({
          current_zone: targetZone,
          is_paused: false,
          paused_at: null,
        })
        .eq('id', vehicleId);
      if (directErr) throw directErr;
    }
  },

  /**
   * Starts wrench work in a station, transitioning from IDLE to ACTIVE.
   */
  async startWork(
    vehicleId: string,
    startedBy: string,
    now: string,
    activeLogId: string | null,
    enteredAt: string | null
  ): Promise<void> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return;

    if (startedBy) {
      await client
        .from('vehicles')
        .update({ assigned_tech: startedBy })
        .eq('id', vehicleId);
    }

    const computedIdle = enteredAt
      ? Math.max(0, Math.floor((new Date(now).getTime() - new Date(enteredAt).getTime()) / 1000))
      : 0;

    if (activeLogId && !activeLogId.startsWith('log-')) {
      await client
        .from('stage_logs')
        .update({ work_started_at: now, idle_seconds: computedIdle })
        .eq('id', activeLogId);
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
  },

  /**
   * Completes a vehicle job sheet (Advisor Handover), closing active inspection stage log.
   */
  async finishJob(
    vehicleId: string,
    advisorName: string,
    now: string,
    activeLogId: string | null,
    enteredAt: string | null,
    workStartedAt: string | null,
    existingIdleSec?: number
  ): Promise<void> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return;

    const { error } = await client.rpc('finish_vehicle_job', {
      p_vehicle_id: vehicleId,
      p_advisor_name: advisorName,
    });

    if (error) {
      console.warn('[vehicleService] RPC finish_vehicle_job fallback:', error.message);

      // Close active inspection stage log
      if (activeLogId && !activeLogId.startsWith('log-')) {
        const entered = enteredAt ? new Date(enteredAt).getTime() : new Date(now).getTime();
        const duration = Math.max(0, Math.floor((new Date(now).getTime() - entered) / 1000));
        const idle = workStartedAt
          ? (existingIdleSec || Math.max(0, Math.floor((new Date(workStartedAt).getTime() - entered) / 1000)))
          : duration;
        await client
          .from('stage_logs')
          .update({ exited_at: now, duration_seconds: duration, idle_seconds: idle })
          .eq('id', activeLogId);
      } else {
        const { data: dbLogs } = await client
          .from('stage_logs')
          .select('*')
          .eq('vehicle_id', vehicleId)
          .is('exited_at', null)
          .order('entered_at', { ascending: false });

        if (dbLogs && dbLogs.length > 0) {
          const activeLog = dbLogs[0];
          const entered = new Date(activeLog.entered_at).getTime();
          const duration = Math.max(0, Math.floor((new Date(now).getTime() - entered) / 1000));
          const idle = activeLog.work_started_at
            ? (activeLog.idle_seconds || Math.max(0, Math.floor((new Date(activeLog.work_started_at).getTime() - entered) / 1000)))
            : duration;
          await client
            .from('stage_logs')
            .update({ exited_at: now, duration_seconds: duration, idle_seconds: idle })
            .eq('id', activeLog.id);
        }
      }

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
  },

  /**
   * Deletes a vehicle record from the database (PostgreSQL cascades tasks & logs).
   */
  async deleteVehicle(vehicleId: string): Promise<void> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return;

    const { error } = await client.from('vehicles').delete().eq('id', vehicleId);
    if (error) throw error;
  },

  /**
   * Updates vehicle urgency toggle and supervisor urgent note.
   */
  async updateUrgency(vehicleId: string, isUrgent: boolean, note: string | null): Promise<void> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return;

    const { error } = await client
      .from('vehicles')
      .update({ is_urgent: isUrgent, urgent_note: note })
      .eq('id', vehicleId);
    if (error) throw error;
  },

  /**
   * Pauses or resumes a vehicle stage timer.
   */
  async toggleTimer(
    vehicleId: string,
    pause: boolean,
    now: string,
    pausedSeconds: number,
    pausedAt: string | null
  ): Promise<void> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return;

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
      const pausedAtTime = pausedAt ? new Date(pausedAt).getTime() : Date.now();
      const addedPauseDuration = Math.max(0, Math.floor((Date.now() - pausedAtTime) / 1000));
      const newPausedSec = (pausedSeconds || 0) + addedPauseDuration;

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
  },

  /**
   * Silent 90-day retention auto-purge.
   */
  async purgeOldRecords(): Promise<void> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return;

    const { error } = await client.rpc('purge_records_older_than_90_days');
    if (error) console.warn('[vehicleService] Purge RPC note:', error.message);
  },
};
