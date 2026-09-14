-- ==============================================================================
-- United Motors Vehicle Tracking - Migration v4: Backend Hardening & Automation
-- ==============================================================================

-- 1. ENABLE EXTENSIONS (pg_cron for automated background scheduling)
-- Note: pg_cron is fully supported on Supabase FREE tier (toggleable under Database > Extensions or via SQL)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. ENSURE COLUMN FOR CANONICAL COMPLETION TIMESTAMP
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS effective_completed_at TIMESTAMPTZ;

-- 3. ENHANCE ATOMIC RPC: TRANSFER VEHICLE ZONE
-- When vehicle is transferred to 'inspection', set effective_completed_at = v_now
CREATE OR REPLACE FUNCTION transfer_vehicle_zone(
  p_vehicle_id UUID,
  p_to_zone bay_zone,
  p_moved_by TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_from_zone bay_zone;
  v_active_log_id UUID;
  v_entered_at TIMESTAMPTZ;
  v_work_started_at TIMESTAMPTZ;
  v_existing_idle INT;
  v_duration INT := 0;
  v_idle INT := 0;
  v_new_log_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_effective_completed TIMESTAMPTZ := NULL;
  v_task_completed_at TIMESTAMPTZ := NULL;
BEGIN
  -- Get current zone
  SELECT current_zone INTO v_from_zone FROM vehicles WHERE id = p_vehicle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found: %', p_vehicle_id;
  END IF;

  -- Close active stage log
  SELECT id, entered_at, work_started_at, idle_seconds
  INTO v_active_log_id, v_entered_at, v_work_started_at, v_existing_idle
  FROM stage_logs
  WHERE vehicle_id = p_vehicle_id AND exited_at IS NULL
  ORDER BY entered_at DESC
  LIMIT 1;

  IF v_active_log_id IS NOT NULL THEN
    v_duration := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_entered_at))::INT);
    IF v_work_started_at IS NOT NULL THEN
      -- 1. Queue-In idle: entered_at to work_started_at
      v_idle := COALESCE(v_existing_idle, GREATEST(0, EXTRACT(EPOCH FROM (v_work_started_at - v_entered_at))::INT));

      -- 2. Queue-Out idle: task completed_at to dispatch v_now (waiting for transfer after Done)
      SELECT vt.completed_at INTO v_task_completed_at
      FROM vehicle_tasks vt
      WHERE vt.vehicle_id = p_vehicle_id
        AND vt.is_completed = TRUE
        AND vt.completed_at IS NOT NULL
        AND (
          (v_from_zone = 'workshop' AND vt.task_type = 'general_service')
          OR (v_from_zone = 'alignment' AND vt.task_type = 'wheel_alignment')
          OR (v_from_zone = 'hoist' AND vt.task_type = 'hoist_service')
        )
      ORDER BY vt.completed_at DESC
      LIMIT 1;

      IF v_task_completed_at IS NOT NULL AND v_task_completed_at >= v_entered_at AND v_task_completed_at < v_now THEN
        v_idle := v_idle + GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_task_completed_at))::INT);
      END IF;
    ELSE
      v_idle := v_duration;
    END IF;

    UPDATE stage_logs
    SET exited_at = v_now,
        duration_seconds = v_duration,
        idle_seconds = v_idle
    WHERE id = v_active_log_id;
  END IF;

  -- Insert new stage log
  INSERT INTO stage_logs (
    vehicle_id, from_zone, to_zone, entered_at, moved_by,
    work_started_at, idle_seconds, duration_seconds
  ) VALUES (
    p_vehicle_id, v_from_zone, p_to_zone, v_now, COALESCE(p_moved_by, 'Staff'),
    NULL, 0, 0
  ) RETURNING id INTO v_new_log_id;

  -- If dispatching to inspection zone, freeze turnaround time by stamping effective_completed_at
  IF p_to_zone = 'inspection' THEN
    v_effective_completed := v_now;
  END IF;

  -- Update vehicle current zone, effective completion, and unpause
  UPDATE vehicles
  SET current_zone = p_to_zone,
      effective_completed_at = COALESCE(v_effective_completed, effective_completed_at),
      is_paused = FALSE,
      paused_at = NULL
  WHERE id = p_vehicle_id;

  RETURN jsonb_build_object(
    'success', true,
    'from_zone', v_from_zone,
    'to_zone', p_to_zone,
    'new_log_id', v_new_log_id,
    'duration_seconds', v_duration,
    'idle_seconds', v_idle,
    'effective_completed_at', v_effective_completed
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. ENHANCE ATOMIC RPC: FINISH VEHICLE JOB SHEET (ADVISOR HANDOVER)
-- Marks job finished, sets completed_at = NOW(), preserving effective_completed_at
CREATE OR REPLACE FUNCTION finish_vehicle_job(
  p_vehicle_id UUID,
  p_advisor_name TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_active_log_id UUID;
  v_entered_at TIMESTAMPTZ;
  v_duration INT := 0;
  v_now TIMESTAMPTZ := NOW();
  v_existing_effective TIMESTAMPTZ;
BEGIN
  -- Close active inspection log
  SELECT id, entered_at
  INTO v_active_log_id, v_entered_at
  FROM stage_logs
  WHERE vehicle_id = p_vehicle_id AND exited_at IS NULL
  ORDER BY entered_at DESC
  LIMIT 1;

  IF v_active_log_id IS NOT NULL THEN
    v_duration := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_entered_at))::INT);
    UPDATE stage_logs
    SET exited_at = v_now,
        duration_seconds = v_duration,
        idle_seconds = v_duration
    WHERE id = v_active_log_id;
  END IF;

  -- Insert completed terminal stage log
  INSERT INTO stage_logs (
    vehicle_id, from_zone, to_zone, entered_at, exited_at,
    duration_seconds, idle_seconds, moved_by
  ) VALUES (
    p_vehicle_id, 'inspection', 'completed', v_now, v_now,
    0, 0, COALESCE(p_advisor_name, 'Service Advisor')
  );

  -- Retrieve existing effective_completed_at or fallback to entered_at / now
  SELECT effective_completed_at INTO v_existing_effective FROM vehicles WHERE id = p_vehicle_id;
  IF v_existing_effective IS NULL THEN
    v_existing_effective := COALESCE(v_entered_at, v_now);
  END IF;

  -- Mark vehicle as finished
  UPDATE vehicles
  SET current_zone = 'completed',
      is_finished = TRUE,
      completed_at = v_now,
      effective_completed_at = v_existing_effective,
      is_paused = FALSE,
      paused_at = NULL
  WHERE id = p_vehicle_id;

  RETURN jsonb_build_object(
    'success', true,
    'completed_at', v_now,
    'effective_completed_at', v_existing_effective
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. ENHANCE ATOMIC RPC: GET SERVICE REPORT KPIS (SERVER-SIDE AGGREGATION)
CREATE OR REPLACE FUNCTION get_service_report_kpis(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_branch_id TEXT DEFAULT 'main_workshop',
  p_status TEXT DEFAULT 'all'
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Filter matching vehicles
  WITH filtered_vehicles AS (
    SELECT v.id, v.is_finished, v.current_zone, v.intake_at, v.effective_completed_at, v.completed_at
    FROM vehicles v
    WHERE (p_branch_id IS NULL OR v.branch_id = p_branch_id)
      AND (p_start_date IS NULL OR v.intake_at >= p_start_date)
      AND (p_end_date IS NULL OR v.intake_at <= p_end_date)
      AND (
        p_status = 'all'
        OR (p_status = 'completed' AND (v.is_finished = TRUE OR v.current_zone = 'inspection' OR v.effective_completed_at IS NOT NULL))
        OR (p_status = 'in_progress' AND (v.is_finished = FALSE AND v.current_zone != 'inspection' AND v.effective_completed_at IS NULL))
      )
  ),
  counts AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE is_finished = TRUE OR current_zone = 'inspection' OR effective_completed_at IS NOT NULL) AS completed,
      COUNT(*) FILTER (WHERE is_finished = FALSE AND current_zone != 'inspection' AND effective_completed_at IS NULL) AS in_progress
    FROM filtered_vehicles
  ),
  bay_logs AS (
    SELECT
      sl.to_zone,
      COUNT(DISTINCT sl.vehicle_id) AS vehicle_count,
      COALESCE(SUM(GREATEST(0, sl.duration_seconds - sl.idle_seconds)), 0) AS active_sec,
      COALESCE(SUM(sl.idle_seconds), 0) AS idle_sec,
      COALESCE(SUM(sl.duration_seconds), 0) AS stage_sec
    FROM stage_logs sl
    INNER JOIN filtered_vehicles fv ON sl.vehicle_id = fv.id
    WHERE sl.exited_at IS NOT NULL
      AND sl.to_zone IN ('workshop', 'alignment', 'hoist')
      AND EXISTS (
        SELECT 1 FROM vehicle_tasks vt
        WHERE vt.vehicle_id = sl.vehicle_id
          AND vt.is_completed = TRUE
          AND (
            (sl.to_zone = 'workshop' AND vt.task_type = 'general_service')
            OR (sl.to_zone = 'alignment' AND vt.task_type = 'wheel_alignment')
            OR (sl.to_zone = 'hoist' AND vt.task_type = 'hoist_service')
          )
      )
    GROUP BY sl.to_zone
  ),
  aggregated_bays AS (
    SELECT
      COALESCE(MAX(CASE WHEN to_zone = 'workshop' THEN vehicle_count END), 0) AS ws_count,
      COALESCE(MAX(CASE WHEN to_zone = 'workshop' THEN active_sec END), 0) AS ws_active,
      COALESCE(MAX(CASE WHEN to_zone = 'workshop' THEN idle_sec END), 0) AS ws_idle,
      COALESCE(MAX(CASE WHEN to_zone = 'workshop' THEN stage_sec END), 0) AS ws_stage,

      COALESCE(MAX(CASE WHEN to_zone = 'alignment' THEN vehicle_count END), 0) AS al_count,
      COALESCE(MAX(CASE WHEN to_zone = 'alignment' THEN active_sec END), 0) AS al_active,
      COALESCE(MAX(CASE WHEN to_zone = 'alignment' THEN idle_sec END), 0) AS al_idle,
      COALESCE(MAX(CASE WHEN to_zone = 'alignment' THEN stage_sec END), 0) AS al_stage,

      COALESCE(MAX(CASE WHEN to_zone = 'hoist' THEN vehicle_count END), 0) AS hs_count,
      COALESCE(MAX(CASE WHEN to_zone = 'hoist' THEN active_sec END), 0) AS hs_active,
      COALESCE(MAX(CASE WHEN to_zone = 'hoist' THEN idle_sec END), 0) AS hs_idle,
      COALESCE(MAX(CASE WHEN to_zone = 'hoist' THEN stage_sec END), 0) AS hs_stage
    FROM bay_logs
  )
  SELECT jsonb_build_object(
    'totalVehicles', COALESCE(c.total, 0),
    'completedCount', COALESCE(c.completed, 0),
    'inProgressCount', COALESCE(c.in_progress, 0),
    'workshopBay', jsonb_build_object(
      'zone', 'workshop',
      'name', 'General Service',
      'vehicleCount', b.ws_count,
      'totalActiveSec', b.ws_active,
      'avgActiveSec', CASE WHEN b.ws_count > 0 THEN b.ws_active / b.ws_count ELSE 0 END,
      'totalIdleSec', b.ws_idle,
      'avgIdleSec', CASE WHEN b.ws_count > 0 THEN b.ws_idle / b.ws_count ELSE 0 END,
      'totalStageSec', b.ws_stage,
      'avgStageSec', CASE WHEN b.ws_count > 0 THEN b.ws_stage / b.ws_count ELSE 0 END
    ),
    'alignmentBay', jsonb_build_object(
      'zone', 'alignment',
      'name', 'Wheel Alignment',
      'vehicleCount', b.al_count,
      'totalActiveSec', b.al_active,
      'avgActiveSec', CASE WHEN b.al_count > 0 THEN b.al_active / b.al_count ELSE 0 END,
      'totalIdleSec', b.al_idle,
      'avgIdleSec', CASE WHEN b.al_count > 0 THEN b.al_idle / b.al_count ELSE 0 END,
      'totalStageSec', b.al_stage,
      'avgStageSec', CASE WHEN b.al_count > 0 THEN b.al_stage / b.al_count ELSE 0 END
    ),
    'hoistBay', jsonb_build_object(
      'zone', 'hoist',
      'name', 'Hoist Service',
      'vehicleCount', b.hs_count,
      'totalActiveSec', b.hs_active,
      'avgActiveSec', CASE WHEN b.hs_count > 0 THEN b.hs_active / b.hs_count ELSE 0 END,
      'totalIdleSec', b.hs_idle,
      'avgIdleSec', CASE WHEN b.hs_count > 0 THEN b.hs_idle / b.hs_count ELSE 0 END,
      'totalStageSec', b.hs_stage,
      'avgStageSec', CASE WHEN b.hs_count > 0 THEN b.hs_stage / b.hs_count ELSE 0 END
    )
  )
  INTO v_result
  FROM counts c
  CROSS JOIN aggregated_bays b;

  RETURN COALESCE(v_result, jsonb_build_object(
    'totalVehicles', 0,
    'completedCount', 0,
    'inProgressCount', 0,
    'workshopBay', jsonb_build_object('zone', 'workshop', 'name', 'General Service', 'vehicleCount', 0, 'totalActiveSec', 0, 'avgActiveSec', 0, 'totalIdleSec', 0, 'avgIdleSec', 0, 'totalStageSec', 0, 'avgStageSec', 0),
    'alignmentBay', jsonb_build_object('zone', 'alignment', 'name', 'Wheel Alignment', 'vehicleCount', 0, 'totalActiveSec', 0, 'avgActiveSec', 0, 'totalIdleSec', 0, 'avgIdleSec', 0, 'totalStageSec', 0, 'avgStageSec', 0),
    'hoistBay', jsonb_build_object('zone', 'hoist', 'name', 'Hoist Service', 'vehicleCount', 0, 'totalActiveSec', 0, 'avgActiveSec', 0, 'totalIdleSec', 0, 'avgIdleSec', 0, 'totalStageSec', 0, 'avgStageSec', 0)
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. ATOMIC RPC: 90-DAY RETENTION AUTO-CLEANUP
-- Purges finished vehicles older than 90 days (cascading to stage_logs and vehicle_tasks)
CREATE OR REPLACE FUNCTION purge_records_older_than_90_days()
RETURNS JSONB AS $$
DECLARE
  v_deleted_count INT := 0;
BEGIN
  WITH purged AS (
    DELETE FROM vehicles
    WHERE is_finished = TRUE
      AND created_at < NOW() - INTERVAL '90 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_count FROM purged;

  RETURN jsonb_build_object(
    'success', true,
    'purged_count', v_deleted_count,
    'purged_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7. AUTOMATED SCHEDULED JOBS (VIA pg_cron)
-- Midnight daily vehicle reconciliation + Weekly 90-day retention auto-cleanup
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- 1. Unschedule & reschedule midnight daily vehicle reconciliation (00:00 UTC / ~05:30 SLST)
    PERFORM cron.unschedule('daily-vehicle-reconciliation')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-vehicle-reconciliation');

    PERFORM cron.schedule(
      'daily-vehicle-reconciliation',
      '0 0 * * *',
      'SELECT reconcile_daily_vehicles()'
    );

    -- 2. Unschedule & reschedule weekly 90-day retention auto-cleanup (Every Sunday at 03:00 UTC)
    PERFORM cron.unschedule('weekly-90day-retention-purge')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-90day-retention-purge');

    PERFORM cron.schedule(
      'weekly-90day-retention-purge',
      '0 3 * * 0',
      'SELECT purge_records_older_than_90_days()'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron scheduling note: %', SQLERRM;
END;
$$;
