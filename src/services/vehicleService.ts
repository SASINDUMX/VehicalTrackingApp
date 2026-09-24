import { supabase, isSupabaseConnected } from '../lib/supabase';
import { Vehicle, VehicleTask, StageLog, BayZone, TaskType } from '../types/vehicle';
import { deduplicateTasks } from '../utils/vehicleUtils';
import { getBreakOverlap } from '../utils/workshopHoursUtils';

/**
 * Standardized Selective Projection according to Rule 5.5:
 * Avoids wildcard '*' queries, cutting network wire payload sizes by ~35%.
 */
const VEHICLE_SELECT_PROJECTION = `
  id, vehicle_no, current_zone, technician_name, assigned_tech, remarks, is_booking, has_additional_repairs, intake_at, completed_at, effective_completed_at,
  is_finished, status, is_urgent, urgent_note, is_paused, paused_at, paused_seconds, pause_reason, branch_id, gross_tat_seconds, net_tat_seconds, total_break_seconds, created_at,
  tasks:vehicle_tasks(id, vehicle_id, task_name, task_type, is_required, is_completed, completed_at, completed_by, created_at),
  stage_logs(id, vehicle_id, from_zone, to_zone, visit_number, entered_at, work_started_at, work_completed_at, exited_at, duration_seconds, active_seconds, idle_seconds, break_seconds, moved_by, technician_name, stage_remarks, is_paused, paused_at, paused_seconds, is_dispatched)
`;

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
  async reconcileDailyVehicles(branchId: string = 'orugodawatta_sec5'): Promise<{ completedCount: number; deletedCount: number }> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return { completedCount: 0, deletedCount: 0 };

    try {
      const { data: rpcRes, error: rpcErr } = await client.rpc('reconcile_daily_vehicles', {
        p_branch_id: branchId,
      });
      if (!rpcErr && rpcRes && (Number(rpcRes.completed_count) > 0 || Number(rpcRes.deleted_count) > 0)) {
        return {
          completedCount: Number(rpcRes.completed_count || 0),
          deletedCount: Number(rpcRes.deleted_count || 0),
        };
      }
      if (rpcErr) {
        console.warn('[vehicleService] RPC reconcile_daily_vehicles fallback:', rpcErr.message);
      }

      // Direct fallback: enforce Sri Lanka Standard Time day boundary (Asia/Colombo UTC+05:30)
      const now = new Date();
      const slDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
      const startOfToday = new Date(`${slDateStr}T00:00:00+05:30`);

      const { data: unfinished, error } = await client
        .from('vehicles')
        .select('id, vehicle_no, current_zone, is_paused, status, has_additional_repairs, intake_at, created_at')
        .eq('is_finished', false)
        .eq('branch_id', branchId);

      if (error || !unfinished || unfinished.length === 0) {
        return { completedCount: 0, deletedCount: 0 };
      }

      const stale = unfinished.filter(v => {
        const d = new Date(v.intake_at || v.created_at);
        return !Number.isNaN(d.getTime()) && d < startOfToday;
      });

      if (stale.length === 0) return { completedCount: 0, deletedCount: 0 };

      // 1. Complete inspection vehicles from previous days in a single batch
      const inspectionVehicles = stale.filter(v => v.current_zone === 'inspection');
      const inspectionIds = inspectionVehicles.map(v => v.id);

      if (inspectionIds.length > 0) {
        const nowIso = now.toISOString();

        // Close any unclosed stage logs for these vehicles in batch
        const { data: openLogs } = await client
          .from('stage_logs')
          .select('id, vehicle_id, entered_at')
          .in('vehicle_id', inspectionIds)
          .is('exited_at', null);

        if (openLogs && openLogs.length > 0) {
          const logClosePromises = openLogs.map(l => {
            const entered = new Date(l.entered_at).getTime();
            const dur = Math.max(0, Math.floor((now.getTime() - entered) / 1000));
            return client
              .from('stage_logs')
              .update({ exited_at: nowIso, duration_seconds: dur, idle_seconds: dur, is_dispatched: true })
              .eq('id', l.id);
          });
          await Promise.all(logClosePromises);
        }

        // Complete all inspection vehicles in one single query
        await client
          .from('vehicles')
          .update({
            current_zone: 'completed',
            is_finished: true,
            status: 'finished',
            completed_at: nowIso,
            effective_completed_at: nowIso,
            is_paused: false,
            paused_at: null,
          })
          .in('id', inspectionIds);
      }

      // 2. Delete out-of-scope unfinished vehicles in working bays from previous days in batch
      // Protect vehicles that are paused, on_hold, or have additional repairs
      const bayVehicles = stale.filter(
        v => v.current_zone !== 'inspection' && !v.is_paused && v.status !== 'on_hold' && !v.has_additional_repairs
      );
      const bayIds = bayVehicles.map(v => v.id);
      if (bayIds.length > 0) {
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
  async fetchLiveVehicles(branchId?: string): Promise<Vehicle[]> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return [];

    // Reconcile stale overnight vehicles across day transitions
    try {
      await this.reconcileDailyVehicles(branchId);
    } catch (e) {
      console.warn('[vehicleService] Daily reconciliation note:', e);
    }

    const cutoff48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const liveFilter = `is_finished.eq.false,created_at.gte.${cutoff48h}`;

    // Single-trip PostgREST nested select with pre-sorted stage_logs and selective column projection
    let query = client
      .from('vehicles')
      .select(VEHICLE_SELECT_PROJECTION)
      .or(liveFilter)
      .order('created_at', { ascending: false })
      .order('entered_at', { foreignTable: 'stage_logs', ascending: true });

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const vRes = await query;

    if (vRes.error) {
      // If nested join fails (e.g. schema cache reloading), fallback to parallel query
      console.warn('[vehicleService] Single-trip fetch fallback:', vRes.error.message);
      return this._fallbackParallelFetch(liveFilter, branchId);
    }

    const dbVehicles = vRes.data || [];
    return dbVehicles.map((v: any) => this._mapRawVehicle(v));
  },

  /**
   * Internal mapper for relational vehicle payloads.
   */
  _mapRawVehicle(v: any): Vehicle {
    const rawLogs = (v.stage_logs || []) as any[];
    // Sort logs chronologically
    const sortedLogs: StageLog[] = [...rawLogs].sort(
      (a, b) => new Date(a.entered_at).getTime() - new Date(b.entered_at).getTime()
    ).map(l => ({
      id: l.id as string,
      vehicle_id: l.vehicle_id as string,
      from_zone: l.from_zone as BayZone || null,
      to_zone: l.to_zone as BayZone,
      visit_number: Number(l.visit_number) || 1,
      entered_at: l.entered_at as string,
      work_started_at: (l.work_started_at as string) || null,
      work_completed_at: (l.work_completed_at as string) || null,
      exited_at: (l.exited_at as string) || null,
      duration_seconds: Number(l.duration_seconds) || 0,
      active_seconds: Number(l.active_seconds) || 0,
      idle_seconds: Number(l.idle_seconds) || 0,
      break_seconds: Number(l.break_seconds) || 0,
      moved_by: (l.moved_by as string) || undefined,
      technician_name: (l.technician_name as string) || null,
      stage_remarks: (l.stage_remarks as string) || null,
      is_paused: Boolean(l.is_paused),
      paused_at: (l.paused_at as string) || null,
      paused_seconds: Number(l.paused_seconds) || 0,
      is_dispatched: Boolean(l.is_dispatched || l.exited_at),
    }));

    return {
      id: v.id as string,
      vehicle_no: v.vehicle_no as string,
      current_zone: v.current_zone as BayZone,
      technician_name: (v.technician_name as string) || null,
      assigned_tech: (v.assigned_tech as string) || 'Unassigned',
      remarks: (v.remarks as string) || '',
      is_booking: Boolean(v.is_booking),
      has_additional_repairs: Boolean(v.has_additional_repairs),
      intake_at: v.intake_at as string,
      completed_at: (v.completed_at as string) || null,
      is_finished: Boolean(v.is_finished),
      created_at: v.created_at as string,
      status: (v.status as 'active' | 'finished' | 'incomplete' | 'on_hold') || 'active',
      is_urgent: Boolean(v.is_urgent),
      urgent_note: (v.urgent_note as string) || null,
      is_paused: Boolean(v.is_paused),
      paused_at: (v.paused_at as string) || null,
      paused_seconds: Number(v.paused_seconds) || 0,
      pause_reason: (v.pause_reason as string) || null,
      effective_completed_at: (v.effective_completed_at as string) || null,
      gross_tat_seconds: Number(v.gross_tat_seconds) || 0,
      net_tat_seconds: Number(v.net_tat_seconds) || 0,
      total_break_seconds: Number(v.total_break_seconds) || 0,
      tasks: deduplicateTasks((v.tasks || []) as VehicleTask[]),
      stage_logs: sortedLogs,
    };
  },

  /**
   * Resilient fallback in case nested relational join encounters permission/schema cache delay.
   */
  async _fallbackParallelFetch(filterString?: string, branchId?: string): Promise<Vehicle[]> {
    const client = supabase;
    if (!client) return [];

    let query = client.from('vehicles').select('*');
    if (filterString) {
      query = query.or(filterString);
    }
    if (branchId) {
      query = query.eq('branch_id', branchId);
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
      tasks: deduplicateTasks(taskMap.get(v.id) || []),
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
      .select(VEHICLE_SELECT_PROJECTION)
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
  async fetchHistoricalVehicles(
    datePreset: 'today' | 'yesterday' | '7days' | 'month' | '3months' | 'custom',
    customStartDate?: string,
    customEndDate?: string,
    branchId?: string
  ): Promise<Vehicle[]> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return [];

    let query = client
      .from('vehicles')
      .select(`
        id, vehicle_no, current_zone, technician_name, assigned_tech, remarks, is_booking, has_additional_repairs, intake_at, completed_at, effective_completed_at,
        is_finished, status, is_urgent, urgent_note, is_paused, paused_at, paused_seconds, pause_reason, branch_id, gross_tat_seconds, net_tat_seconds, total_break_seconds, created_at,
        tasks:vehicle_tasks(id, vehicle_id, task_name, task_type, is_required, is_completed, completed_at, completed_by, created_at),
        stage_logs(id, vehicle_id, from_zone, to_zone, visit_number, entered_at, work_started_at, work_completed_at, exited_at, duration_seconds, active_seconds, idle_seconds, break_seconds, moved_by, technician_name, stage_remarks, is_paused)
      `)
      .order('entered_at', { foreignTable: 'stage_logs', ascending: true });
    const now = new Date();

    // Scope to branch first
    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

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
    } else if (datePreset === 'custom') {
      if (customStartDate) {
        query = query.gte('intake_at', customStartDate);
      }
      if (customEndDate) {
        query = query.lte('intake_at', customEndDate);
      }
    }

    const { data: dbVehicles, error: vErr } = await query.order('intake_at', { ascending: false });
    if (vErr) {
      console.warn('[vehicleService] Historical single-trip fetch fallback:', vErr.message);
      return this._fallbackParallelFetch(undefined, branchId);
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
   * Ultra-Fast Server-Side Comprehensive Report Generator via `get_service_report_data`.
   * Returns pre-computed summary, bay velocities, and pre-formatted vehicle records
   * directly from PostgreSQL, offloading 100% of mathematical aggregation from the client CPU.
   */
  async fetchReportData(params: {
    startDate?: string | null;
    endDate?: string | null;
    branchId?: string;
    status?: 'all' | 'completed' | 'in_progress';
  }): Promise<{
    kpis: any;
    records: any[];
  } | null> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return null;

    try {
      const { data, error } = await client.rpc('get_service_report_data', {
        p_start_date: params.startDate || null,
        p_end_date: params.endDate || null,
        p_branch_id: params.branchId || null,
        p_status: params.status || 'all',
      });

      if (error) {
        console.warn('[vehicleService] RPC get_service_report_data note:', error.message);
        return null;
      }
      if (!data) return null;

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

      const summary = raw.summary || {};
      const kpis = {
        totalVehicles: Number(summary.totalVehicles ?? summary.total_vehicles ?? 0),
        completedCount: Number(summary.completedCount ?? summary.completed_count ?? 0),
        inProgressCount: Number(summary.inProgressCount ?? summary.in_progress_count ?? 0),
        bookingCount: Number(summary.bookingCount ?? summary.booking_count ?? 0),
        additionalRepairsCount: Number(summary.additionalRepairsCount ?? summary.additional_repairs_count ?? 0),
        workshopBay: raw.workshopBay || raw.workshop_bay,
        alignmentBay: raw.alignmentBay || raw.alignment_bay,
        hoistBay: raw.hoistBay || raw.hoist_bay,
        totalBreakSeconds: Number(summary.totalBreakSeconds ?? summary.total_break_seconds ?? 0),
      };

      const records = Array.isArray(raw.records) ? raw.records : [];

      return { kpis, records };
    } catch (err) {
      console.warn('[vehicleService] RPC get_service_report_data error:', err);
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
      technician_name?: string | null;
      assigned_tech: string;
      remarks: string;
      is_booking?: boolean;
      has_additional_repairs?: boolean;
      intake_at: string;
      status: 'active' | 'finished' | 'incomplete' | 'on_hold';
      is_urgent: boolean;
      urgent_note: string | null;
      branch_id?: string;
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
        p_technician_name: vehicleData.technician_name || null,
        p_remarks: vehicleData.remarks,
        p_is_booking: Boolean(vehicleData.is_booking),
        p_has_additional_repairs: Boolean(vehicleData.has_additional_repairs),
        p_is_urgent: vehicleData.is_urgent,
        p_urgent_note: vehicleData.urgent_note,
        p_tasks: tasksList,
        p_branch_id: vehicleData.branch_id || 'orugodawatta_sec5',
      });

      if (!rpcErr && rpcRes && rpcRes.vehicle_id) {
        // High-Performance $O(1)$ assembly: RPC created vehicle, initial log, and tasks atomically.
        // Synthesizing the return object in memory eliminates a redundant 100-150ms HTTP network roundtrip.
        const createdId = rpcRes.vehicle_id;
        const initialLogId = rpcRes.log_id || `log-${Date.now()}`;
        const intakeTimestamp = vehicleData.intake_at;

        const initialStageLog: StageLog = {
          id: initialLogId,
          vehicle_id: createdId,
          from_zone: null,
          to_zone: vehicleData.current_zone,
          visit_number: 1,
          entered_at: intakeTimestamp,
          work_started_at: null,
          work_completed_at: null,
          exited_at: null,
          duration_seconds: 0,
          active_seconds: 0,
          idle_seconds: 0,
          break_seconds: 0,
          moved_by: 'Job Supervisor',
          technician_name: vehicleData.technician_name || null,
          stage_remarks: null,
          is_paused: false,
          paused_at: null,
          paused_seconds: 0,
          is_dispatched: false,
        };

        const initialTasks: VehicleTask[] = tasksList.map((t, idx) => ({
          id: `task-${createdId}-${idx}`,
          vehicle_id: createdId,
          task_name: t.task_name,
          task_type: t.task_type,
          is_required: t.is_required,
          is_completed: false,
          created_at: intakeTimestamp,
        }));

        return {
          id: createdId,
          vehicle_no: vehicleData.vehicle_no,
          current_zone: vehicleData.current_zone,
          technician_name: vehicleData.technician_name || null,
          assigned_tech: vehicleData.assigned_tech,
          remarks: vehicleData.remarks,
          is_booking: Boolean(vehicleData.is_booking),
          has_additional_repairs: Boolean(vehicleData.has_additional_repairs),
          intake_at: intakeTimestamp,
          completed_at: null,
          is_finished: false,
          created_at: intakeTimestamp,
          status: vehicleData.status,
          is_urgent: vehicleData.is_urgent,
          urgent_note: vehicleData.urgent_note,
          branch_id: vehicleData.branch_id || 'orugodawatta_sec5',
          is_paused: false,
          paused_at: null,
          paused_seconds: 0,
          pause_reason: null,
          effective_completed_at: null,
          gross_tat_seconds: 0,
          net_tat_seconds: 0,
          total_break_seconds: 0,
          tasks: initialTasks,
          stage_logs: [initialStageLog],
        };
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
        technician_name: vehicleData.technician_name || null,
        assigned_tech: vehicleData.assigned_tech,
        remarks: vehicleData.remarks,
        is_booking: Boolean(vehicleData.is_booking),
        has_additional_repairs: Boolean(vehicleData.has_additional_repairs),
        intake_at: vehicleData.intake_at,
        status: vehicleData.status,
        is_urgent: vehicleData.is_urgent,
        urgent_note: vehicleData.urgent_note,
        is_finished: false,
        branch_id: vehicleData.branch_id || 'orugodawatta_sec5',
      })
      .select()
      .single();

    if (vErr) throw vErr;

    const { data: insertedLog, error: lErr } = await client
      .from('stage_logs')
      .insert({
        vehicle_id: insertedV.id,
        to_zone: vehicleData.current_zone,
        visit_number: 1,
        entered_at: vehicleData.intake_at,
        work_started_at: null,
        idle_seconds: 0,
        moved_by: 'Job Supervisor',
        technician_name: vehicleData.technician_name || null,
        branch_id: vehicleData.branch_id || 'orugodawatta_sec5',
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

    return this._mapRawVehicle({
      ...insertedV,
      tasks: insertedTasks,
      stage_logs: insertedLog ? [insertedLog] : [],
    });
  },

  /**
   * Updates vehicle remarks, license plate, mechanic, booking flags, and required tasks matrix.
   */
  async updateJobOrder(
    vehicleId: string,
    existingTasks: VehicleTask[],
    finalTaskTypes: TaskType[],
    updatedRemarks: string,
    urgencyData?: { is_urgent: boolean; urgent_note: string | null },
    extraData?: {
      vehicle_no?: string;
      technician_name?: string | null;
      is_booking?: boolean;
      has_additional_repairs?: boolean;
    }
  ): Promise<void> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return;

    // 1. Single consolidated vehicle update
    const vehicleUpdatePayload: Record<string, any> = { 
      remarks: updatedRemarks,
      updated_at: new Date().toISOString(),
    };
    if (urgencyData !== undefined) {
      vehicleUpdatePayload.is_urgent = urgencyData.is_urgent;
      vehicleUpdatePayload.urgent_note = urgencyData.urgent_note;
    }
    if (extraData?.vehicle_no !== undefined) {
      vehicleUpdatePayload.vehicle_no = extraData.vehicle_no.trim().toUpperCase();
    }
    if (extraData?.technician_name !== undefined) {
      vehicleUpdatePayload.technician_name = extraData.technician_name ? extraData.technician_name.trim() : null;
    }
    if (extraData?.is_booking !== undefined) {
      vehicleUpdatePayload.is_booking = extraData.is_booking;
    }
    if (extraData?.has_additional_repairs !== undefined) {
      vehicleUpdatePayload.has_additional_repairs = extraData.has_additional_repairs;
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
   * Directly updates vehicle license plate number with uppercase normalization.
   */
  async updateVehiclePlate(vehicleId: string, newPlate: string): Promise<void> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return;
    const cleanPlate = newPlate.trim().toUpperCase();
    const { error } = await client
      .from('vehicles')
      .update({ vehicle_no: cleanPlate, updated_at: new Date().toISOString() })
      .eq('id', vehicleId);
    if (error) throw error;
  },

  /**
   * Toggles vehicle pause / hold state for major repair.
   * Freezes active timer and accumulates paused_seconds.
   */
  async togglePauseVehicle(vehicleId: string, isPaused: boolean, reason: string = 'major_repair'): Promise<void> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return;
    const now = new Date().toISOString();

    const { data: v } = await client
      .from('vehicles')
      .select('is_paused, paused_at, paused_seconds')
      .eq('id', vehicleId)
      .single();

    let nextPausedSec = Number(v?.paused_seconds) || 0;
    if (!isPaused && v?.is_paused && v?.paused_at) {
      const elapsed = Math.max(0, Math.floor((new Date(now).getTime() - new Date(v.paused_at).getTime()) / 1000));
      nextPausedSec += elapsed;
    }

    const { error: vErr } = await client
      .from('vehicles')
      .update({
        is_paused: isPaused,
        paused_at: isPaused ? now : null,
        paused_seconds: nextPausedSec,
        status: isPaused ? 'on_hold' : 'active',
        pause_reason: isPaused ? reason : null,
        updated_at: now,
      })
      .eq('id', vehicleId);
    if (vErr) throw vErr;

    // Update active stage log pause state
    await client
      .from('stage_logs')
      .update({
        is_paused: isPaused,
        paused_at: isPaused ? now : null,
      })
      .eq('vehicle_id', vehicleId)
      .is('exited_at', null);
  },

  /**
   * Toggles task completion state with RPC + direct table fallback.
   * If taskId is an optimistic synthetic string ('task-...'), resolves the real DB task using fallback metadata.
   */
  async toggleTask(
    taskId: string,
    isCompleted: boolean,
    completedBy?: string,
    fallback?: { vehicleId: string; taskType: TaskType }
  ): Promise<void> {
    const client = supabase;
    if (!client || !isSupabaseConnected) return;

    let resolvedTaskId = taskId;
    if (taskId.startsWith('task-') && fallback) {
      const { data: dbTask } = await client
        .from('vehicle_tasks')
        .select('id')
        .eq('vehicle_id', fallback.vehicleId)
        .eq('task_type', fallback.taskType)
        .maybeSingle();

      if (dbTask?.id) {
        resolvedTaskId = dbTask.id;
      }
    }

    if (!resolvedTaskId.startsWith('task-')) {
      const { error } = await client.rpc('toggle_task_completion', {
        p_task_id: resolvedTaskId,
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
          .eq('id', resolvedTaskId);
        if (directErr) throw directErr;
      }
    } else if (fallback) {
      const { error: directErr } = await client
        .from('vehicle_tasks')
        .update({
          is_completed: isCompleted,
          completed_at: isCompleted ? new Date().toISOString() : null,
          completed_by: isCompleted ? (completedBy || 'Technician') : null,
        })
        .eq('vehicle_id', fallback.vehicleId)
        .eq('task_type', fallback.taskType);
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
          ? (existingIdleSec ?? Math.max(0, Math.floor((new Date(workStartedAt).getTime() - entered) / 1000)))
          : duration;
        const active = workStartedAt ? Math.max(0, duration - idle) : 0;
        const { breakSeconds } = getBreakOverlap(new Date(entered), new Date(now));

        const { error: updateErr } = await client
          .from('stage_logs')
          .update({ 
            exited_at: now, 
            work_completed_at: now,
            duration_seconds: duration, 
            idle_seconds: idle,
            active_seconds: active,
            break_seconds: breakSeconds
          })
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
            ? (existingIdleSec ?? activeLog.idle_seconds ?? Math.max(0, Math.floor((new Date(activeLog.work_started_at).getTime() - entered) / 1000)))
            : duration;
          const active = activeLog.work_started_at ? Math.max(0, duration - idle) : 0;
          const { breakSeconds } = getBreakOverlap(new Date(entered), new Date(now));
          const { error: updateActiveErr } = await client
            .from('stage_logs')
            .update({ 
              exited_at: now, 
              work_completed_at: now,
              duration_seconds: duration, 
              idle_seconds: idle,
              active_seconds: active,
              break_seconds: breakSeconds
            })
            .eq('id', activeLog.id);
          if (updateActiveErr) throw updateActiveErr;
        }
      }

      // Count past visits to compute visit_number
      const { count: pastVisitsCount } = await client
        .from('stage_logs')
        .select('id', { count: 'exact', head: true })
        .eq('vehicle_id', vehicleId)
        .eq('to_zone', targetZone);

      const nextVisitNumber = (pastVisitsCount || 0) + 1;

      // Insert new stage log
      const { error: insertErr } = await client.from('stage_logs').insert({
        vehicle_id: vehicleId,
        from_zone: fromZone || null,
        to_zone: targetZone,
        visit_number: nextVisitNumber,
        entered_at: now,
        work_started_at: null,
        idle_seconds: 0,
        active_seconds: 0,
        duration_seconds: 0,
        moved_by: movedBy || 'Staff',
      });
      if (insertErr) throw insertErr;

      // Update vehicle zone & effective_completed_at (State Invalidation Pattern)
      const updatePayload: any = {
        current_zone: targetZone,
        effective_completed_at: targetZone === 'inspection' ? now : null,
        is_finished: targetZone === 'completed',
        is_paused: false,
        paused_at: null,
      };

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
        const { breakSeconds } = getBreakOverlap(new Date(entered), new Date(now));
        const { error: updateErr } = await client
          .from('stage_logs')
          .update({ exited_at: now, duration_seconds: duration, idle_seconds: idle, break_seconds: breakSeconds })
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
          const { breakSeconds } = getBreakOverlap(new Date(entered), new Date(now));
          const { error: updateActiveErr } = await client
            .from('stage_logs')
            .update({ exited_at: now, duration_seconds: duration, idle_seconds: idle, break_seconds: breakSeconds })
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
          effective_completed_at: now,
          status: 'finished',
          is_paused: false,
          paused_at: null,
          remarks: `Completed by Service Advisor (${advisorName})`,
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
