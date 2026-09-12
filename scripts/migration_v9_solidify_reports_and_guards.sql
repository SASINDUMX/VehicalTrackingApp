-- ==============================================================================
-- UNITED MOTORS VEHICLE TRACKING - MIGRATION V9: SOLIDIFY BACKEND REPORTING & GUARDS
-- ==============================================================================
-- Run this in the Supabase Dashboard -> SQL Editor (project: eeoyfrhmgarocecphcky)
-- 100% Safe, Additive, and Idempotent.
-- ==============================================================================

-- 1. Hardened Zone Transfer with State Machine Guard
CREATE OR REPLACE FUNCTION transfer_vehicle_zone(
  p_vehicle_id UUID,
  p_to_zone bay_zone,
  p_moved_by TEXT DEFAULT 'Staff'
)
RETURNS JSONB AS $$
DECLARE
  v_from_zone bay_zone;
  v_branch_id VARCHAR(50);
  v_active_log_id UUID;
  v_entered_at TIMESTAMPTZ;
  v_work_started_at TIMESTAMPTZ;
  v_work_completed_at TIMESTAMPTZ;
  v_duration INT := 0;
  v_idle INT := 0;
  v_active INT := 0;
  v_break INT := 0;
  v_pass_count INT := 1;
  v_now TIMESTAMPTZ := NOW();
  v_pending_mandatory_tasks INT := 0;
BEGIN
  SELECT current_zone, branch_id 
  INTO v_from_zone, v_branch_id 
  FROM vehicles 
  WHERE id = p_vehicle_id;

  IF v_from_zone IS NULL THEN
    RAISE EXCEPTION 'Vehicle % not found', p_vehicle_id;
  END IF;

  -- State Machine Guard: If moving to inspection, verify required bay tasks are completed
  IF p_to_zone = 'inspection' THEN
    SELECT COUNT(*) INTO v_pending_mandatory_tasks
    FROM vehicle_tasks
    WHERE vehicle_id = p_vehicle_id 
      AND is_required = TRUE 
      AND is_completed = FALSE;

    IF v_pending_mandatory_tasks > 0 THEN
      RAISE EXCEPTION 'State Machine Guard: Vehicle % cannot move to inspection. There are % mandatory tasks incomplete.', p_vehicle_id, v_pending_mandatory_tasks;
    END IF;
  END IF;

  -- Close active log
  SELECT id, entered_at, work_started_at, work_completed_at
  INTO v_active_log_id, v_entered_at, v_work_started_at, v_work_completed_at
  FROM stage_logs
  WHERE vehicle_id = p_vehicle_id AND exited_at IS NULL
  ORDER BY entered_at DESC LIMIT 1;

  IF v_active_log_id IS NOT NULL THEN
    v_duration := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_entered_at))::INT);
    v_break := calculate_break_overlap_seconds(v_entered_at, v_now);
    
    IF v_work_started_at IS NOT NULL THEN
      IF v_work_completed_at IS NOT NULL THEN
        v_active := GREATEST(0, EXTRACT(EPOCH FROM (v_work_completed_at - v_work_started_at))::INT);
      ELSE
        v_active := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_work_started_at))::INT);
      END IF;
      v_idle := GREATEST(0, v_duration - v_active - v_break);
    ELSE
      v_idle := v_duration;
      v_active := 0;
    END IF;

    UPDATE stage_logs
    SET exited_at = v_now,
        work_completed_at = COALESCE(work_completed_at, v_now),
        duration_seconds = v_duration,
        active_seconds = v_active,
        idle_seconds = v_idle,
        break_seconds = v_break
    WHERE id = v_active_log_id;
  END IF;

  -- Increment pass number for target bay
  SELECT COUNT(*) + 1 INTO v_pass_count 
  FROM stage_logs 
  WHERE vehicle_id = p_vehicle_id AND to_zone = p_to_zone;

  -- Open new stage log inheriting branch_id
  INSERT INTO stage_logs (
    vehicle_id, from_zone, to_zone, visit_number,
    entered_at, moved_by, branch_id
  ) VALUES (
    p_vehicle_id, v_from_zone, p_to_zone, v_pass_count,
    v_now, p_moved_by, COALESCE(v_branch_id, 'peliyagoda_sec5')
  );

  -- Update vehicle current station
  UPDATE vehicles
  SET current_zone = p_to_zone,
      effective_completed_at = CASE WHEN p_to_zone = 'inspection' AND effective_completed_at IS NULL THEN v_now ELSE effective_completed_at END
  WHERE id = p_vehicle_id;

  RETURN jsonb_build_object('success', true, 'to_zone', p_to_zone, 'pass', v_pass_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Comprehensive Server-Side Service Report Data Generator
-- Computes KPIs, Bay averages, and pre-calculated vehicle rows inside PostgreSQL.
CREATE OR REPLACE FUNCTION get_service_report_data(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_status TEXT DEFAULT 'all',
  p_branch_id VARCHAR(50) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_summary JSONB;
  v_workshop_bay JSONB;
  v_alignment_bay JSONB;
  v_hoist_bay JSONB;
  v_records JSONB;
BEGIN
  -- 1. Base Filtered Vehicles
  CREATE TEMP TABLE temp_filtered_vehicles ON COMMIT DROP AS
  SELECT 
    v.id,
    v.vehicle_no,
    v.status,
    v.current_zone,
    v.is_finished,
    v.is_booking,
    v.has_additional_repairs,
    v.technician_name,
    v.assigned_tech,
    v.remarks,
    v.intake_at,
    v.created_at,
    COALESCE(v.effective_completed_at, v.completed_at) AS effective_completed_at,
    v.gross_tat_seconds,
    v.net_tat_seconds,
    v.total_break_seconds
  FROM vehicles v
  WHERE (p_start_date IS NULL OR v.intake_at >= p_start_date)
    AND (p_end_date IS NULL OR v.intake_at <= p_end_date)
    AND (p_branch_id IS NULL OR v.branch_id = p_branch_id)
    AND (
      p_status = 'all'
      OR (p_status = 'completed' AND (v.is_finished = TRUE OR v.current_zone = 'inspection'))
      OR (p_status = 'in_progress' AND v.is_finished = FALSE AND v.current_zone != 'inspection')
    );

  -- 2. Summary Counts
  SELECT jsonb_build_object(
    'totalVehicles', COUNT(*)::INT,
    'completedCount', COUNT(*) FILTER (WHERE is_finished = TRUE OR current_zone = 'inspection')::INT,
    'inProgressCount', COUNT(*) FILTER (WHERE is_finished = FALSE AND current_zone != 'inspection')::INT,
    'bookingCount', COUNT(*) FILTER (WHERE is_booking = TRUE)::INT,
    'additionalRepairsCount', COUNT(*) FILTER (WHERE has_additional_repairs = TRUE)::INT,
    'totalBreakSeconds', COALESCE(SUM(total_break_seconds), 0)::INT
  ) INTO v_summary
  FROM temp_filtered_vehicles;

  -- 3. Bay Velocities (Benchmark excludes vehicles with additional repairs)
  WITH bay_stats AS (
    SELECT
      sl.to_zone,
      COUNT(DISTINCT sl.vehicle_id)::INT AS vehicle_count,
      COALESCE(SUM(sl.active_seconds), 0)::INT AS total_active_sec,
      COALESCE(SUM(sl.idle_seconds), 0)::INT AS total_idle_sec,
      COALESCE(SUM(sl.duration_seconds), 0)::INT AS total_stage_sec
    FROM stage_logs sl
    INNER JOIN temp_filtered_vehicles fv ON fv.id = sl.vehicle_id
    WHERE sl.exited_at IS NOT NULL
      AND fv.has_additional_repairs = FALSE
      AND sl.to_zone IN ('workshop', 'alignment', 'hoist')
    GROUP BY sl.to_zone
  )
  SELECT
    COALESCE((
      SELECT jsonb_build_object(
        'zone', 'workshop',
        'name', 'General Service',
        'vehicleCount', vehicle_count,
        'totalActiveSec', total_active_sec,
        'avgActiveSec', CASE WHEN vehicle_count > 0 THEN total_active_sec / vehicle_count ELSE 0 END,
        'totalIdleSec', total_idle_sec,
        'avgIdleSec', CASE WHEN vehicle_count > 0 THEN total_idle_sec / vehicle_count ELSE 0 END,
        'totalStageSec', total_stage_sec,
        'avgStageSec', CASE WHEN vehicle_count > 0 THEN total_stage_sec / vehicle_count ELSE 0 END
      ) FROM bay_stats WHERE to_zone = 'workshop'
    ), jsonb_build_object('zone', 'workshop', 'name', 'General Service', 'vehicleCount', 0, 'totalActiveSec', 0, 'avgActiveSec', 0, 'totalIdleSec', 0, 'avgIdleSec', 0, 'totalStageSec', 0, 'avgStageSec', 0)),
    COALESCE((
      SELECT jsonb_build_object(
        'zone', 'alignment',
        'name', 'Wheel Alignment',
        'vehicleCount', vehicle_count,
        'totalActiveSec', total_active_sec,
        'avgActiveSec', CASE WHEN vehicle_count > 0 THEN total_active_sec / vehicle_count ELSE 0 END,
        'totalIdleSec', total_idle_sec,
        'avgIdleSec', CASE WHEN vehicle_count > 0 THEN total_idle_sec / vehicle_count ELSE 0 END,
        'totalStageSec', total_stage_sec,
        'avgStageSec', CASE WHEN vehicle_count > 0 THEN total_stage_sec / vehicle_count ELSE 0 END
      ) FROM bay_stats WHERE to_zone = 'alignment'
    ), jsonb_build_object('zone', 'alignment', 'name', 'Wheel Alignment', 'vehicleCount', 0, 'totalActiveSec', 0, 'avgActiveSec', 0, 'totalIdleSec', 0, 'avgIdleSec', 0, 'totalStageSec', 0, 'avgStageSec', 0)),
    COALESCE((
      SELECT jsonb_build_object(
        'zone', 'hoist',
        'name', 'Hoist Service',
        'vehicleCount', vehicle_count,
        'totalActiveSec', total_active_sec,
        'avgActiveSec', CASE WHEN vehicle_count > 0 THEN total_active_sec / vehicle_count ELSE 0 END,
        'totalIdleSec', total_idle_sec,
        'avgIdleSec', CASE WHEN vehicle_count > 0 THEN total_idle_sec / vehicle_count ELSE 0 END,
        'totalStageSec', total_stage_sec,
        'avgStageSec', CASE WHEN vehicle_count > 0 THEN total_stage_sec / vehicle_count ELSE 0 END
      ) FROM bay_stats WHERE to_zone = 'hoist'
    ), jsonb_build_object('zone', 'hoist', 'name', 'Hoist Service', 'vehicleCount', 0, 'totalActiveSec', 0, 'avgActiveSec', 0, 'totalIdleSec', 0, 'avgIdleSec', 0, 'totalStageSec', 0, 'avgStageSec', 0))
  INTO v_workshop_bay, v_alignment_bay, v_hoist_bay;

  -- 4. Pre-Calculated Vehicle Records
  WITH vehicle_bay_aggregates AS (
    SELECT
      vehicle_id,
      COALESCE(SUM(CASE WHEN to_zone = 'workshop' THEN idle_seconds END), 0)::INT AS ws_idle,
      COALESCE(SUM(CASE WHEN to_zone = 'workshop' THEN active_seconds END), 0)::INT AS ws_active,
      COALESCE(SUM(CASE WHEN to_zone = 'workshop' THEN break_seconds END), 0)::INT AS ws_break,
      COALESCE(SUM(CASE WHEN to_zone = 'alignment' THEN idle_seconds END), 0)::INT AS al_idle,
      COALESCE(SUM(CASE WHEN to_zone = 'alignment' THEN active_seconds END), 0)::INT AS al_active,
      COALESCE(SUM(CASE WHEN to_zone = 'alignment' THEN break_seconds END), 0)::INT AS al_break,
      COALESCE(SUM(CASE WHEN to_zone = 'hoist' THEN idle_seconds END), 0)::INT AS hs_idle,
      COALESCE(SUM(CASE WHEN to_zone = 'hoist' THEN active_seconds END), 0)::INT AS hs_active,
      COALESCE(SUM(CASE WHEN to_zone = 'hoist' THEN break_seconds END), 0)::INT AS hs_break,
      COALESCE(SUM(idle_seconds), 0)::INT AS total_idle_sec,
      COALESCE(SUM(active_seconds), 0)::INT AS total_active_sec,
      COALESCE(SUM(break_seconds), 0)::INT AS total_stage_breaks_sec
    FROM stage_logs
    WHERE vehicle_id IN (SELECT id FROM temp_filtered_vehicles)
    GROUP BY vehicle_id
  ),
  task_summaries AS (
    SELECT
      vehicle_id,
      string_agg(
        task_name || ' (by ' || COALESCE(completed_by, 'Tech') || ')', 
        '; ' ORDER BY completed_at
      ) AS completed_tasks_str
    FROM vehicle_tasks
    WHERE vehicle_id IN (SELECT id FROM temp_filtered_vehicles)
      AND is_completed = TRUE
    GROUP BY vehicle_id
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', fv.id,
      'vehicle_no', fv.vehicle_no,
      'status', fv.status,
      'current_zone', fv.current_zone,
      'is_finished', fv.is_finished,
      'is_effective_done', (fv.is_finished = TRUE OR fv.current_zone = 'inspection'),
      'is_booking', fv.is_booking,
      'has_additional_repairs', fv.has_additional_repairs,
      'technician_name', fv.technician_name,
      'assigned_tech', fv.assigned_tech,
      'remarks', fv.remarks,
      'intake_at', fv.intake_at,
      'created_at', fv.created_at,
      'effective_completed_at', fv.effective_completed_at,
      'gross_tat_seconds', COALESCE(
        fv.gross_tat_seconds,
        GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(fv.effective_completed_at, NOW()) - COALESCE(fv.intake_at, fv.created_at)))::INT)
      ),
      'net_tat_seconds', COALESCE(fv.net_tat_seconds, 0),
      'total_break_seconds', COALESCE(vba.total_stage_breaks_sec, fv.total_break_seconds, 0),
      'total_idle_sec', COALESCE(vba.total_idle_sec, 0),
      'total_active_sec', COALESCE(vba.total_active_sec, 0),
      'workshop_idle', COALESCE(vba.ws_idle, 0),
      'workshop_active', COALESCE(vba.ws_active, 0),
      'workshop_break', COALESCE(vba.ws_break, 0),
      'alignment_idle', COALESCE(vba.al_idle, 0),
      'alignment_active', COALESCE(vba.al_active, 0),
      'alignment_break', COALESCE(vba.al_break, 0),
      'hoist_idle', COALESCE(vba.hs_idle, 0),
      'hoist_active', COALESCE(vba.hs_active, 0),
      'hoist_break', COALESCE(vba.hs_break, 0),
      'completed_tasks_str', COALESCE(ts.completed_tasks_str, 'None')
    ) ORDER BY fv.intake_at DESC
  ) INTO v_records
  FROM temp_filtered_vehicles fv
  LEFT JOIN vehicle_bay_aggregates vba ON vba.vehicle_id = fv.id
  LEFT JOIN task_summaries ts ON ts.vehicle_id = fv.id;

  RETURN jsonb_build_object(
    'summary', v_summary,
    'workshopBay', v_workshop_bay,
    'alignmentBay', v_alignment_bay,
    'hoistBay', v_hoist_bay,
    'records', COALESCE(v_records, '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
