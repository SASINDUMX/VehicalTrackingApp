-- ==============================================================================
-- United Motors Vehicle Tracking - Migration v5: Clean Telemetry & Hardening
-- ==============================================================================

-- 1. ADD BREAK_SECONDS COLUMN TO STAGE_LOGS
ALTER TABLE stage_logs ADD COLUMN IF NOT EXISTS break_seconds INT NOT NULL DEFAULT 0;

-- 2. DEDUCT WORKSHOP BREAK OVERLAP (SRI LANKA WORKSHOP STANDARD)
-- Morning Tea: 09:45 - 10:00 (15m)
-- Lunch Break: 12:30 - 13:00 (30m)
-- Evening Tea: 14:45 - 15:00 (15m)
CREATE OR REPLACE FUNCTION calculate_break_overlap_seconds(
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ
)
RETURNS INT AS 
DECLARE
  v_total_break_sec INT := 0;
  v_day_start DATE;
  v_day_end DATE;
  v_curr_day DATE;
  v_start_colombo TIMESTAMPTZ;
  v_end_colombo TIMESTAMPTZ;
  v_break_start TIMESTAMPTZ;
  v_break_end TIMESTAMPTZ;
  v_overlap_start TIMESTAMPTZ;
  v_overlap_end TIMESTAMPTZ;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN
    RETURN 0;
  END IF;

  v_start_colombo := p_start AT TIME ZONE 'Asia/Colombo';
  v_end_colombo := p_end AT TIME ZONE 'Asia/Colombo';
  v_day_start := v_start_colombo::DATE;
  v_day_end := v_end_colombo::DATE;
  v_curr_day := v_day_start;

  WHILE v_curr_day <= v_day_end LOOP
    -- Morning Tea: 09:45 to 10:00
    v_break_start := (v_curr_day || ' 09:45:00')::TIMESTAMP AT TIME ZONE 'Asia/Colombo';
    v_break_end := (v_curr_day || ' 10:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Colombo';
    v_overlap_start := GREATEST(p_start, v_break_start);
    v_overlap_end := LEAST(p_end, v_break_end);
    IF v_overlap_end > v_overlap_start THEN
      v_total_break_sec := v_total_break_sec + EXTRACT(EPOCH FROM (v_overlap_end - v_overlap_start))::INT;
    END IF;

    -- Lunch Break: 12:30 to 13:00
    v_break_start := (v_curr_day || ' 12:30:00')::TIMESTAMP AT TIME ZONE 'Asia/Colombo';
    v_break_end := (v_curr_day || ' 13:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Colombo';
    v_overlap_start := GREATEST(p_start, v_break_start);
    v_overlap_end := LEAST(p_end, v_break_end);
    IF v_overlap_end > v_overlap_start THEN
      v_total_break_sec := v_total_break_sec + EXTRACT(EPOCH FROM (v_overlap_end - v_overlap_start))::INT;
    END IF;

    -- Evening Tea: 14:45 to 15:00
    v_break_start := (v_curr_day || ' 14:45:00')::TIMESTAMP AT TIME ZONE 'Asia/Colombo';
    v_break_end := (v_curr_day || ' 15:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Colombo';
    v_overlap_start := GREATEST(p_start, v_break_start);
    v_overlap_end := LEAST(p_end, v_break_end);
    IF v_overlap_end > v_overlap_start THEN
      v_total_break_sec := v_total_break_sec + EXTRACT(EPOCH FROM (v_overlap_end - v_overlap_start))::INT;
    END IF;

    v_curr_day := v_curr_day + INTERVAL '1 day';
  END LOOP;

  RETURN v_total_break_sec;
END;
 LANGUAGE plpgsql IMMUTABLE;

-- 3. BACKFILL BREAK_SECONDS ON HISTORICAL CLOSED LOGS
UPDATE stage_logs
SET break_seconds = calculate_break_overlap_seconds(entered_at, exited_at)
WHERE exited_at IS NOT NULL AND break_seconds = 0;

-- 4. HARDEN ATOMIC RPC: TRANSFER VEHICLE ZONE
CREATE OR REPLACE FUNCTION transfer_vehicle_zone(
  p_vehicle_id UUID,
  p_to_zone bay_zone,
  p_moved_by TEXT DEFAULT NULL
)
RETURNS JSONB AS 
DECLARE
  v_from_zone bay_zone;
  v_active_log_id UUID;
  v_entered_at TIMESTAMPTZ;
  v_work_started_at TIMESTAMPTZ;
  v_existing_idle INT;
  v_duration INT := 0;
  v_idle INT := 0;
  v_break INT := 0;
  v_new_log_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_effective_completed TIMESTAMPTZ := NULL;
  v_task_completed_at TIMESTAMPTZ := NULL;
BEGIN
  SELECT current_zone INTO v_from_zone FROM vehicles WHERE id = p_vehicle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found: %', p_vehicle_id;
  END IF;

  -- Close active log
  SELECT id, entered_at, work_started_at, idle_seconds
  INTO v_active_log_id, v_entered_at, v_work_started_at, v_existing_idle
  FROM stage_logs
  WHERE vehicle_id = p_vehicle_id AND exited_at IS NULL
  ORDER BY entered_at DESC
  LIMIT 1;

  IF v_active_log_id IS NOT NULL THEN
    v_duration := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_entered_at))::INT);
    v_break := calculate_break_overlap_seconds(v_entered_at, v_now);

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
        idle_seconds = v_idle,
        break_seconds = v_break
    WHERE id = v_active_log_id;
  END IF;

  -- Insert new stage log
  INSERT INTO stage_logs (
    vehicle_id, from_zone, to_zone, entered_at, moved_by,
    work_started_at, idle_seconds, break_seconds, duration_seconds
  ) VALUES (
    p_vehicle_id, v_from_zone, p_to_zone, v_now, COALESCE(p_moved_by, 'Staff'),
    NULL, 0, 0, 0
  ) RETURNING id INTO v_new_log_id;

  -- Turnaround Freeze on entering inspection zone
  IF p_to_zone = 'inspection' THEN
    v_effective_completed := v_now;
  END IF;

  UPDATE vehicles
  SET current_zone = p_to_zone,
      effective_completed_at = COALESCE(v_effective_completed, effective_completed_at)
  WHERE id = p_vehicle_id;

  RETURN jsonb_build_object(
    'success', true,
    'from_zone', v_from_zone,
    'to_zone', p_to_zone,
    'new_log_id', v_new_log_id,
    'duration_seconds', v_duration,
    'idle_seconds', v_idle,
    'break_seconds', v_break,
    'effective_completed_at', v_effective_completed
  );
END;
 LANGUAGE plpgsql SECURITY DEFINER;

-- 5. HARDEN ATOMIC RPC: FINISH VEHICLE JOB
CREATE OR REPLACE FUNCTION finish_vehicle_job(
  p_vehicle_id UUID,
  p_advisor_name TEXT DEFAULT NULL
)
RETURNS JSONB AS 
DECLARE
  v_active_log_id UUID;
  v_entered_at TIMESTAMPTZ;
  v_duration INT := 0;
  v_break INT := 0;
  v_now TIMESTAMPTZ := NOW();
  v_existing_effective TIMESTAMPTZ;
BEGIN
  SELECT id, entered_at
  INTO v_active_log_id, v_entered_at
  FROM stage_logs
  WHERE vehicle_id = p_vehicle_id AND exited_at IS NULL
  ORDER BY entered_at DESC
  LIMIT 1;

  IF v_active_log_id IS NOT NULL THEN
    v_duration := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_entered_at))::INT);
    v_break := calculate_break_overlap_seconds(v_entered_at, v_now);
    UPDATE stage_logs
    SET exited_at = v_now,
        duration_seconds = v_duration,
        break_seconds = v_break
    WHERE id = v_active_log_id;
  END IF;

  SELECT effective_completed_at INTO v_existing_effective FROM vehicles WHERE id = p_vehicle_id;

  UPDATE vehicles
  SET is_finished = TRUE,
      completed_at = v_now,
      effective_completed_at = COALESCE(v_existing_effective, v_now),
      status = 'finished'
  WHERE id = p_vehicle_id;

  RETURN jsonb_build_object(
    'success', true,
    'vehicle_id', p_vehicle_id,
    'completed_at', v_now,
    'advisor_name', p_advisor_name
  );
END;
 LANGUAGE plpgsql SECURITY DEFINER;

-- 6. HARDEN ATOMIC RPC: GET SERVICE REPORT KPIS
CREATE OR REPLACE FUNCTION get_service_report_kpis(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_branch_id TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'all'
)
RETURNS JSONB AS 
DECLARE
  v_result JSONB;
BEGIN
  WITH filtered_vehicles AS (
    SELECT v.id, v.is_finished, v.current_zone, v.intake_at, v.effective_completed_at
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
      -- Active Labor = Duration - Idle (QueueIn + QueueOut) - Overlapping Breaks
      COALESCE(SUM(GREATEST(0, sl.duration_seconds - sl.idle_seconds - COALESCE(sl.break_seconds, 0))), 0) AS active_sec,
      COALESCE(SUM(sl.idle_seconds), 0) AS idle_sec,
      COALESCE(SUM(sl.duration_seconds), 0) AS stage_sec
    FROM stage_logs sl
    INNER JOIN filtered_vehicles fv ON sl.vehicle_id = fv.id
    WHERE sl.exited_at IS NOT NULL
      AND sl.to_zone IN ('workshop', 'alignment', 'hoist')
      -- STRICT AUDIT & MULTI-VISIT RESILIENT RULE:
      -- Only count the specific visit log in which the task was actually completed
      AND EXISTS (
        SELECT 1 FROM vehicle_tasks vt
        WHERE vt.vehicle_id = sl.vehicle_id
          AND vt.is_completed = TRUE
          AND vt.completed_at IS NOT NULL
          AND vt.completed_at >= sl.entered_at
          AND vt.completed_at <= sl.exited_at
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
 LANGUAGE plpgsql SECURITY DEFINER;
