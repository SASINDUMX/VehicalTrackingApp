import { supabase, isSupabaseConnected } from '../lib/supabase';
import { Vehicle, VehicleTask, StageLog, BayZone, TaskType } from '../types/vehicle';

/**
 * Tier 3 Data Access Service & Repository for Vehicles, Checklists, and Stage Telemetry.
 * Encapsulates all Supabase queries, RPC calls, error fallbacks, and payload shaping.
 */
export const vehicleService = {
  /**
   * Reconciles overnight vehicles across day transitions for same-day service operations:
   * 1. Vehicles left in 'inspection' zone from previous days are automatically marked completed.
   * 2. Vehicles left unfinished in working bays ('workshop', 'alignment', 'hoist') from previous days
   *    are deleted as out-of-scope for the new day.
   * This guarantees that every morning starts with clean, fresh bays.
   */
  /**
   * Reconciles overnight vehicles across day transitions for same-day service operations:
   * Calls PostgreSQL RPC `reconcile_daily_vehicles` atomically.
   * If RPC is unavailable, falls back to direct table update/delete.
   */
  async reconcileDailyVehicles(): Promise<{ completedCount: number; deletedCount: number }> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return { completedCount: 0, deletedCount: 0 };

    try {
      const { data: rpcRes, error: rpcErr } = await client.rpc('reconcile_daily_vehicles');
      if (!rpcErr && rpcRes) {
        return {
          completedCount: Number(rpcRes.completed_count || 0),
          deletedCount: Number(rpcRes.deleted_count || 0),
        };
      }
      if (rpcErr) {
        console.warn('[vehicleService] RPC reconcile_daily_vehicles fallback:', rpcErr.message);
      }

      // Direct fallback if RPC is not present
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const { data: unfinished, error } = await client
        .from('vehicles')
        .select('id, vehicle_no, current_zone, intake_at, created_at')
        .eq('is_finished', false);

      if (error || !unfinished || unfinished.length === 0) {
        return { completedCount: 0, deletedCount: 0 };
      }

      const stale = unfinished.filter(v => {
        const d = new Date(v.intake_at || v.created_at);
        return !isNaN(d.getTime()) && d < startOfToday;
      });

      if (stale.length === 0) return { completedCount: 0, deletedCount: 0 };

      // 1. Complete inspection vehicles from previous days
      const inspectionVehicles = stale.filter(v => v.current_zone === 'inspection');
      for (const iv of inspectionVehicles) {
        const nowIso = now.toISOString();
        const { data: logs } = await client
          .from('stage_logs')
          .select('*')
          .eq('vehicle_id', iv.id)
          .is('exited_at', null);

        if (logs && logs.length > 0) {
          for (const l of logs) {
            const entered = new Date(l.entered_at).getTime();
            const dur = Math.max(0, Math.floor((now.getTime() - entered) / 1000));
            await client
              .from('stage_logs')
              .update({ exited_at: nowIso, duration_seconds: dur, idle_seconds: dur })
              .eq('id', l.id);
          }
        }

        await client
          .from('vehicles')
          .update({
            current_zone: 'completed',
            is_finished: true,
            completed_at: nowIso,
            is_paused: false,
            paused_at: null,
          })
          .eq('id', iv.id);
      }

      // 2. Delete out-of-scope unfinished vehicles in working bays from previous days
      const bayVehicles = stale.filter(v => v.current_zone !== 'inspection');
      const bayIds = bayVehicles.map(v => v.id);
      if (bayIds.length > 0) {
        await client.from('stage_logs').delete().in('vehicle_id', bayIds);
        await client.from('vehicle_tasks').delete().in('vehicle_id', bayIds);
        await client.from('vehicles').delete().in('id', bayIds);
      }

      return { completedCount: inspectionVehicles.length, deletedCount: bayVehicles.length };
    } catch (err) {
      console.warn('[vehicleService] Daily reconciliation note:', err);
      return { completedCount: 0, deletedCount: 0 };
    }
  },

  /**
   * High-Performance Single-Trip Fetching:
   * Queries active vehicles (is_finished = false) plus jobs finished within the last 48 hours,
   * embedding vehicle_tasks and stage_logs in a single HTTP network trip.
   */
  async fetchLiveVehicles(): Promise<Vehicle[]> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return [];

    const cutoff48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const liveFilter = `is_finished.eq.false,created_at.gte.${cutoff48h}`;

    // Single-trip PostgREST nested select with pre-sorted stage_logs
    const vRes = await client
      .from('vehicles')
      .select('*, tasks:vehicle_tasks(*), stage_logs(*)')
      .or(liveFilter)
      .order('created_at', { ascending: false })
      .order('entered_at', { foreignTable: 'stage_logs', ascending: true });

    if (vRes.error) {
      // If nested join fails (e.g. schema cache reloading), fallback to parallel query
      console.warn('[vehicleService] Single-trip fetch fallback:', vRes.error.message);
      return this._fallbackParallelFetch(liveFilter);
    }

    const dbVehicles = vRes.data || [];
    return dbVehicles.map((v: any) => this._mapRawVehicle(v));
  },

  /**
   * Internal mapper for relational vehicle payloads.
   */
  _mapRawVehicle(v: any): Vehicle {
    const rawLogs = (v.stage_logs || []) as StageLog[];
    // Sort logs chronologically
    const sortedLogs = [...rawLogs].sort(
      (a, b) => new Date(a.entered_at).getTime() - new Date(b.entered_at).getTime()
    );

    return {
      id: v.id as string,
      vehicle_no: v.vehicle_no as string,
      current_zone: v.current_zone as BayZone,
      assigned_tech: (v.assigned_tech as string) || 'Unassigned',
      remarks: (v.remarks as string) || '',
      intake_at: v.intake_at as string,
      completed_at: (v.completed_at as string) || null,
      is_finished: Boolean(v.is_finished),
      created_at: v.created_at as string,
      status: (v.status as 'active' | 'finished' | 'incomplete') || 'active',
      is_urgent: Boolean(v.is_urgent),
      urgent_note: (v.urgent_note as string) || null,
      is_paused: Boolean(v.is_paused),
      paused_at: (v.paused_at as string) || null,
      paused_seconds: Number(v.paused_seconds) || 0,
      effective_completed_at: (v.effective_completed_at as string) || null,
      gross_tat_seconds: Number(v.gross_tat_seconds) || 0,
      net_tat_seconds: Number(v.net_tat_seconds) || 0,
      total_break_seconds: Number(v.total_break_seconds) || 0,
      tasks: (v.tasks || []) as VehicleTask[],
      stage_logs: sortedLogs,
    };
  },

  /**
   * Resilient fallback in case nested relational join encounters permission/schema cache delay.
   */
  async _fallbackParallelFetch(filterString?: string): Promise<Vehicle[]> {
    const client = supabase;
    if (!client) return [];

    let query = client.from('vehicles').select('*');
    if (filterString) {
      query = query.or(filterString);
    }
    const vRes = await query.order('created_at', { ascending: false });
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
      ...this._mapRawVehicle(v),
      tasks: taskMap.get(v.id) || [],
      stage_logs: logMap.get(v.id) || [],
    }));
  },

  /**
   * Fetches a single vehicle by ID with its relational tasks and stage_logs embedded.
   * Used for high-speed, flicker-free WebSocket INSERT event reconciliation.
   */
  async fetchVehicleById(vehicleId: string): Promise<Vehicle | null> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return null;

    const { data, error } = await client
      .from('vehicles')
      .select('*, tasks:vehicle_tasks(*), stage_logs(*)')
      .eq('id', vehicleId)
      .single();

    if (error || !data) {
      console.warn('[vehicleService] fetchVehicleById fallback:', error?.message);
      return null;
    }
    return this._mapRawVehicle(data);
  },

  /**
   * On-Demand Single-Trip Historical Range Querying for Service Reports.
   * Harmonized to filter by intake_at (falling back to created_at) to align with get_service_report_kpis.
   */
  async fetchHistoricalVehicles(datePreset: 'today' | 'yesterday' | '7days' | 'month' | '3months'): Promise<Vehicle[]> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return [];

    let query = client
      .from('vehicles')
      .select(`
        id, vehicle_no, current_zone, assigned_tech, remarks, intake_at, completed_at, effective_completed_at,
        is_finished, status, is_urgent, urgent_note, branch_id, gross_tat_seconds, net_tat_seconds, total_break_seconds, created_at,
        tasks:vehicle_tasks(id, vehicle_id, task_name, task_type, is_required, is_completed, completed_at, completed_by, created_at),
        stage_logs(id, vehicle_id, from_zone, to_zone, entered_at, work_started_at, exited_at, duration_seconds, idle_seconds, moved_by)
      `)
      .order('entered_at', { foreignTable: 'stage_logs', ascending: true });
    const now = new Date();

    if (datePreset === 'today') {
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      query = query.gte('intake_at', startOfToday);
    } else if (datePreset === 'yesterday') {
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
      query = query.gte('intake_at', startOfYesterday.toISOString()).lt('intake_at', startOfToday.toISOString());
    } else if (datePreset === '7days') {
      const startOf7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('intake_at', startOf7Days);
    } else if (datePreset === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      query = query.gte('intake_at', startOfMonth);
    } else if (datePreset === '3months') {
      const startOf3Months = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).toISOString();
      query = query.gte('intake_at', startOf3Months);
    }

    const { data: dbVehicles, error: vErr } = await query.order('intake_at', { ascending: false });
    if (vErr) {
      console.warn('[vehicleService] Historical single-trip fetch fallback:', vErr.message);
      return this._fallbackParallelFetch();
    }

    if (!dbVehicles || dbVehicles.length === 0) return [];
    return dbVehicles.map((v: any) => this._mapRawVehicle(v));
  },

  /**
   * Server-Side KPI Aggregation via PostgreSQL RPC `get_service_report_kpis`.
   * Computes instant aggregate statistics directly in DB, bypassing client-side N-log traversal.
   */
  async fetchReportKPIs(params: {
    startDate?: string | null;
    endDate?: string | null;
    branchId?: string;
    status?: 'all' | 'completed' | 'in_progress';
  }): Promise<any | null> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return null;

    try {
      const { data, error } = await client.rpc('get_service_report_kpis', {
        p_start_date: params.startDate || null,
        p_end_date: params.endDate || null,
        p_branch_id: params.branchId || null,
        p_status: params.status || 'all',
      });

      if (error) {
        console.warn('[vehicleService] RPC get_service_report_kpis note:', error.message);
        return null;
      }
      if (!data) return null;

      // Normalize string or array wrapping
      let raw: any = data;
      if (typeof raw === 'string') {
        try {
          raw = JSON.parse(raw);
        } catch {
          return null;
        }
      }
      if (Array.isArray(raw)) {
        raw = raw[0];
      }
      if (!raw || typeof raw !== 'object') return null;

      // Extract and normalize bay data, supporting camelCase, snake_case, and nested station_averages
      const stationAverages = raw.station_averages ?? raw.stationAverages ?? {};
      const normalizeBay = (bay: any, defaultZone: string, defaultName: string) => {
        const source = (bay && typeof bay === 'object') ? bay : {};
        return {
          zone: source.zone || defaultZone,
          name: source.name || defaultName,
          vehicleCount: Number(source.vehicleCount ?? source.vehicle_count ?? source.count ?? 0),
          totalActiveSec: Number(source.totalActiveSec ?? source.total_active_sec ?? source.active_sec ?? source.total_active ?? 0),
          avgActiveSec: Number(source.avgActiveSec ?? source.avg_active_sec ?? source.avg_active ?? 0),
          totalIdleSec: Number(source.totalIdleSec ?? source.total_idle_sec ?? source.idle_sec ?? source.total_idle ?? 0),
          avgIdleSec: Number(source.avgIdleSec ?? source.avg_idle_sec ?? source.avg_idle ?? 0),
          totalStageSec: Number(source.totalStageSec ?? source.total_stage_sec ?? source.stage_sec ?? source.total_stage ?? 0),
          avgStageSec: Number(source.avgStageSec ?? source.avg_stage_sec ?? source.avg_stage ?? source.avg_duration ?? 0),
        };
      };

      const workshopBay = normalizeBay(
        raw.workshopBay ?? raw.workshop_bay ?? stationAverages.workshop ?? stationAverages.workshop_bay,
        'workshop',
        'General Service'
      );
      const alignmentBay = normalizeBay(
        raw.alignmentBay ?? raw.alignment_bay ?? stationAverages.alignment ?? stationAverages.alignment_bay,
        'alignment',
        'Wheel Alignment'
      );
      const hoistBay = normalizeBay(
        raw.hoistBay ?? raw.hoist_bay ?? stationAverages.hoist ?? stationAverages.hoist_bay,
        'hoist',
        'Hoist Service'
      );

      const totalVehicles = Number(raw.totalVehicles ?? raw.total_vehicles ?? raw.total_intake ?? raw.totalIntake ?? 0);
      const completedCount = Number(raw.completedCount ?? raw.completed_count ?? raw.total_completed ?? raw.totalCompleted ?? 0);
      const inProgressCount = Number(raw.inProgressCount ?? raw.in_progress_count ?? raw.total_active ?? raw.totalActive ?? 0);
      const totalBreakSeconds = Number(raw.totalBreakSeconds ?? raw.total_break_seconds ?? raw.total_break_sec ?? 0);

      return {
        totalVehicles,
        completedCount,
        inProgressCount,
        workshopBay,
        alignmentBay,
        hoistBay,
        totalBreakSeconds,
      };
    } catch (err) {
      console.warn('[vehicleService] RPC get_service_report_kpis error:', err);
      return null;
    }
  },

  /**
   * Intakes a new vehicle, creating initial stage_log and checklist tasks in database.
   * Calls PostgreSQL RPC `intake_vehicle` for atomic single-transaction execution.
   * If RPC is unavailable, falls back to direct table inserts.
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

    // Try atomic RPC
    try {
      const { data: rpcRes, error: rpcErr } = await client.rpc('intake_vehicle', {
        p_vehicle_no: vehicleData.vehicle_no,
        p_target_zone: vehicleData.current_zone,
        p_assigned_tech: vehicleData.assigned_tech,
        p_remarks: vehicleData.remarks,
        p_is_urgent: vehicleData.is_urgent,
        p_urgent_note: vehicleData.urgent_note,
        p_tasks: tasksList,
        p_branch_id: 'main_workshop',
      });

      if (!rpcErr && rpcRes && rpcRes.vehicle_id) {
        // Fetch newly created vehicle with full relations
        const { data: createdV, error: fetchErr } = await client
          .from('vehicles')
          .select('*, tasks:vehicle_tasks(*), stage_logs(*)')
          .eq('id', rpcRes.vehicle_id)
          .single();

        if (!fetchErr && createdV) {
          return this._mapRawVehicle(createdV);
        }
      } else if (rpcErr) {
        console.warn('[vehicleService] RPC intake_vehicle fallback:', rpcErr.message);
      }
    } catch (rpcEx) {
      console.warn('[vehicleService] RPC intake_vehicle error, using fallback:', rpcEx);
    }

    // Direct multi-step fallback
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
    updatedRemarks: string,
    urgencyData?: { is_urgent: boolean; urgent_note: string | null }
  ): Promise<void> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return;

    // 1. Single consolidated vehicle update
    const vehicleUpdatePayload: Record<string, any> = { remarks: updatedRemarks };
    if (urgencyData !== undefined) {
      vehicleUpdatePayload.is_urgent = urgencyData.is_urgent;
      vehicleUpdatePayload.urgent_note = urgencyData.urgent_note;
    }

    const { error: vErr } = await client
      .from('vehicles')
      .update(vehicleUpdatePayload)
      .eq('id', vehicleId);
    if (vErr) throw vErr;

    // 2. Only update tasks that actually changed (Diff-checking)
    const allPossibleTasks: { name: string; type: TaskType }[] = [
      { name: 'General Service', type: 'general_service' },
      { name: 'Hoist Service', type: 'hoist_service' },
      { name: 'Wheel Alignment', type: 'wheel_alignment' },
    ];

    const taskUpdates: PromiseLike<any>[] = [];

    for (const taskDef of allPossibleTasks) {
      const existingTask = existingTasks.find(t => t.task_type === taskDef.type);
      const isRequired = finalTaskTypes.includes(taskDef.type);

      if (existingTask) {
        // Only fire PATCH if is_required actually changed!
        if (!existingTask.is_completed && existingTask.is_required !== isRequired) {
          taskUpdates.push(
            client
              .from('vehicle_tasks')
              .update({ is_required: isRequired })
              .eq('id', existingTask.id)
          );
        }
      } else if (isRequired) {
        taskUpdates.push(
          client.from('vehicle_tasks').insert({
            vehicle_id: vehicleId,
            task_name: taskDef.name,
            task_type: taskDef.type,
            is_required: true,
            is_completed: false,
          })
        );
      }
    }

    if (taskUpdates.length > 0) {
      const results = await Promise.all(taskUpdates);
      for (const res of results) {
        if (res?.error) throw res.error;
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
   * Transfers a vehicle to a new bay, closing the active stage log and inserting a new one.
   * Task completion and work-start are handled by VehicleContext BEFORE this call.
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
    existingIdleSec?: number,
    movedBy?: string
  ): Promise<void> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return;

    const { error } = await client.rpc('transfer_vehicle_zone', {
      p_vehicle_id: vehicleId,
      p_to_zone: targetZone,
      p_moved_by: movedBy || 'Staff',
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

        const { error: updateErr } = await client
          .from('stage_logs')
          .update({ exited_at: now, duration_seconds: duration, idle_seconds: idle })
          .eq('id', activeLogId);
        if (updateErr) throw updateErr;
      } else {
        const { data: dbLogs, error: selectErr } = await client
          .from('stage_logs')
          .select('*')
          .eq('vehicle_id', vehicleId)
          .is('exited_at', null)
          .order('entered_at', { ascending: false });
        if (selectErr) throw selectErr;

        if (dbLogs && dbLogs.length > 0) {
          const activeLog = dbLogs[0];
          const entered = new Date(activeLog.entered_at).getTime();
          const duration = Math.max(0, Math.floor((new Date(now).getTime() - entered) / 1000));
          const idle = activeLog.work_started_at
            ? (activeLog.idle_seconds || Math.max(0, Math.floor((new Date(activeLog.work_started_at).getTime() - entered) / 1000)))
            : duration;
          const { error: updateActiveErr } = await client
            .from('stage_logs')
            .update({ exited_at: now, duration_seconds: duration, idle_seconds: idle })
            .eq('id', activeLog.id);
          if (updateActiveErr) throw updateActiveErr;
        }
      }

      // Insert new stage log
      const { error: insertErr } = await client.from('stage_logs').insert({
        vehicle_id: vehicleId,
        from_zone: fromZone || null,
        to_zone: targetZone,
        entered_at: now,
        work_started_at: null,
        idle_seconds: 0,
        duration_seconds: 0,
      });
      if (insertErr) throw insertErr;

      // Update vehicle zone & effective_completed_at if moving to inspection
      const updatePayload: any = {
        current_zone: targetZone,
        is_paused: false,
        paused_at: null,
      };
      if (targetZone === 'inspection') {
        updatePayload.effective_completed_at = now;
      }

      const { error: directErr } = await client
        .from('vehicles')
        .update(updatePayload)
        .eq('id', vehicleId);
      if (directErr) throw directErr;
    }
  },

  /**
   * Starts wrench work in a station, transitioning from IDLE to ACTIVE.
   * Calls PostgreSQL RPC `start_stage_work` atomically.
   * If RPC is unavailable, falls back to direct table update.
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

    try {
      const { data: rpcRes, error: rpcErr } = await client.rpc('start_stage_work', {
        p_vehicle_id: vehicleId,
        p_tech_name: startedBy || null,
      });

      if (!rpcErr && rpcRes && rpcRes.success) {
        return;
      }
      if (rpcErr) {
        console.warn('[vehicleService] RPC start_stage_work fallback:', rpcErr.message);
      }
    } catch (rpcEx) {
      console.warn('[vehicleService] RPC start_stage_work error, using fallback:', rpcEx);
    }

    // Direct table update fallback
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
        const { error: updateErr } = await client
          .from('stage_logs')
          .update({ exited_at: now, duration_seconds: duration, idle_seconds: idle })
          .eq('id', activeLogId);
        if (updateErr) throw updateErr;
      } else {
        const { data: dbLogs, error: selectErr } = await client
          .from('stage_logs')
          .select('*')
          .eq('vehicle_id', vehicleId)
          .is('exited_at', null)
          .order('entered_at', { ascending: false });
        if (selectErr) throw selectErr;

        if (dbLogs && dbLogs.length > 0) {
          const activeLog = dbLogs[0];
          const entered = new Date(activeLog.entered_at).getTime();
          const duration = Math.max(0, Math.floor((new Date(now).getTime() - entered) / 1000));
          const idle = activeLog.work_started_at
            ? (activeLog.idle_seconds || Math.max(0, Math.floor((new Date(activeLog.work_started_at).getTime() - entered) / 1000)))
            : duration;
          const { error: updateActiveErr } = await client
            .from('stage_logs')
            .update({ exited_at: now, duration_seconds: duration, idle_seconds: idle })
            .eq('id', activeLog.id);
          if (updateActiveErr) throw updateActiveErr;
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
   * 90-day retention auto-purge.
   * Can be invoked manually from the client or autonomously executed via backend pg_cron.
   */
  async purgeOldRecords(): Promise<{ success: boolean; purged_count?: number } | void> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return;

    const { data, error } = await client.rpc('purge_records_older_than_90_days');
    if (error) {
      console.warn('[vehicleService] Purge RPC note:', error.message);
      return;
    }
    return data;
  },
};
