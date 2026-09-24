-- ==============================================================================
-- BREAK TIME CALCULATION & SERVICE REPORT RPC FIX
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/eeoyfrhmgarocecphcky/sql
-- ==============================================================================

-- 1. Shift Break Overlap Deduction Function (Asia/Colombo UTC+05:30)
-- Accurately calculates overlapping seconds for Sri Lanka workshop break windows:
--   - Morning Tea: 09:45 - 10:00 (15 min / 900s)
--   - Lunch Break: 12:30 - 13:00 (30 min / 1800s)
--   - Evening Tea: 14:45 - 15:00 (15 min / 900s)
CREATE OR REPLACE FUNCTION public.calculate_break_overlap_seconds(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS INT AS $$
DECLARE
  v_total INT := 0;
  v_day_start DATE;
  v_day_end DATE;
  v_curr_day DATE;
  v_break_start TIMESTAMPTZ;
  v_break_end TIMESTAMPTZ;
  v_overlap_start TIMESTAMPTZ;
  v_overlap_end TIMESTAMPTZ;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN RETURN 0; END IF;
  v_day_start := (p_start AT TIME ZONE 'Asia/Colombo')::DATE;
  v_day_end := (p_end AT TIME ZONE 'Asia/Colombo')::DATE;
  v_curr_day := v_day_start;

  WHILE v_curr_day <= v_day_end LOOP
    -- Morning Tea: 09:45 - 10:00
    v_break_start := (v_curr_day || ' 09:45:00')::TIMESTAMP AT TIME ZONE 'Asia/Colombo';
    v_break_end := (v_curr_day || ' 10:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Colombo';
    v_overlap_start := GREATEST(p_start, v_break_start);
    v_overlap_end := LEAST(p_end, v_break_end);
    IF v_overlap_end > v_overlap_start THEN
      v_total := v_total + EXTRACT(EPOCH FROM (v_overlap_end - v_overlap_start))::INT;
    END IF;

    -- Lunch Break: 12:30 - 13:00
    v_break_start := (v_curr_day || ' 12:30:00')::TIMESTAMP AT TIME ZONE 'Asia/Colombo';
    v_break_end := (v_curr_day || ' 13:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Colombo';
    v_overlap_start := GREATEST(p_start, v_break_start);
    v_overlap_end := LEAST(p_end, v_break_end);
    IF v_overlap_end > v_overlap_start THEN
      v_total := v_total + EXTRACT(EPOCH FROM (v_overlap_end - v_overlap_start))::INT;
    END IF;

    -- Evening Tea: 14:45 - 15:00
    v_break_start := (v_curr_day || ' 14:45:00')::TIMESTAMP AT TIME ZONE 'Asia/Colombo';
    v_break_end := (v_curr_day || ' 15:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Colombo';
    v_overlap_start := GREATEST(p_start, v_break_start);
    v_overlap_end := LEAST(p_end, v_break_end);
    IF v_overlap_end > v_overlap_start THEN
      v_total := v_total + EXTRACT(EPOCH FROM (v_overlap_end - v_overlap_start))::INT;
    END IF;

    v_curr_day := v_curr_day + INTERVAL '1 day';
  END LOOP;
  RETURN v_total;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Transfer Vehicle Zone RPC (With Break Calculation)
CREATE OR REPLACE FUNCTION public.transfer_vehicle_zone(
  p_vehicle_id UUID,
  p_to_zone VARCHAR(50),
  p_moved_by VARCHAR(255) DEFAULT 'Staff'
)
RETURNS JSONB AS $$
DECLARE
  v_old_zone VARCHAR(50);
  v_old_log_id UUID;
  v_old_entered TIMESTAMPTZ;
  v_old_started TIMESTAMPTZ;
  v_old_completed TIMESTAMPTZ;
  v_duration INT;
  v_idle INT;
  v_active INT;
  v_break INT;
  v_next_visit INT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT current_zone INTO v_old_zone
  FROM public.vehicles
  WHERE id = p_vehicle_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vehicle not found');
  END IF;

  -- Close active stage log
  SELECT id, entered_at, work_started_at, work_completed_at
  INTO v_old_log_id, v_old_entered, v_old_started, v_old_completed
  FROM public.stage_logs
  WHERE vehicle_id = p_vehicle_id AND exited_at IS NULL
  ORDER BY entered_at DESC
  LIMIT 1;

  IF v_old_log_id IS NOT NULL THEN
    v_duration := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_old_entered))::INT);
    v_break := public.calculate_break_overlap_seconds(v_old_entered, v_now);
    IF v_old_started IS NOT NULL THEN
      IF v_old_completed IS NOT NULL THEN
        v_active := GREATEST(0, EXTRACT(EPOCH FROM (v_old_completed - v_old_started))::INT);
        v_idle := GREATEST(0, v_duration - v_active);
      ELSE
        v_idle := GREATEST(0, EXTRACT(EPOCH FROM (v_old_started - v_old_entered))::INT);
        v_active := GREATEST(0, v_duration - v_idle);
      END IF;
    ELSE
      v_idle := v_duration;
      v_active := 0;
    END IF;

    UPDATE public.stage_logs
    SET exited_at = v_now,
        work_completed_at = COALESCE(work_completed_at, v_now),
        duration_seconds = v_duration,
        idle_seconds = v_idle,
        active_seconds = v_active,
        break_seconds = v_break,
        is_dispatched = TRUE
    WHERE id = v_old_log_id;
  END IF;

  -- Count past visits to target zone
  SELECT COALESCE(MAX(visit_number), 0) + 1
  INTO v_next_visit
  FROM public.stage_logs
  WHERE vehicle_id = p_vehicle_id AND to_zone = p_to_zone::bay_zone;

  -- Insert new stage log
  INSERT INTO public.stage_logs (
    vehicle_id, from_zone, to_zone, visit_number,
    entered_at, duration_seconds, idle_seconds, active_seconds,
    moved_by, is_dispatched
  ) VALUES (
    p_vehicle_id, v_old_zone::bay_zone, p_to_zone::bay_zone, v_next_visit,
    v_now, 0, 0, 0,
    COALESCE(p_moved_by, 'Staff'), FALSE
  );

  -- Update vehicle record with inspection invalidation logic
  IF p_to_zone = 'inspection' THEN
    UPDATE public.vehicles
    SET current_zone = p_to_zone::bay_zone,
        effective_completed_at = v_now,
        is_paused = FALSE,
        paused_at = NULL,
        status = 'active',
        updated_at = v_now
    WHERE id = p_vehicle_id;
  ELSE
    UPDATE public.vehicles
    SET current_zone = p_to_zone::bay_zone,
        effective_completed_at = NULL,
        is_finished = FALSE,
        is_paused = FALSE,
        paused_at = NULL,
        status = 'active',
        updated_at = v_now
    WHERE id = p_vehicle_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'new_zone', p_to_zone, 'visit_number', v_next_visit);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Finish Vehicle Job (Advisor Handover with Break Calculation)
CREATE OR REPLACE FUNCTION public.finish_vehicle_job(
  p_vehicle_id UUID,
  p_advisor_name VARCHAR(255) DEFAULT 'Service Advisor'
)
RETURNS JSONB AS $$
DECLARE
  v_old_log_id UUID;
  v_old_entered TIMESTAMPTZ;
  v_intake_at TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
  v_duration INT;
  v_break INT;
  v_total_break INT;
BEGIN
  SELECT id, entered_at INTO v_old_log_id, v_old_entered
  FROM public.stage_logs
  WHERE vehicle_id = p_vehicle_id AND exited_at IS NULL
  ORDER BY entered_at DESC
  LIMIT 1;

  IF v_old_log_id IS NOT NULL THEN
    v_duration := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_old_entered))::INT);
    v_break := public.calculate_break_overlap_seconds(v_old_entered, v_now);
    UPDATE public.stage_logs
    SET exited_at = v_now,
        duration_seconds = v_duration,
        idle_seconds = v_duration,
        break_seconds = v_break,
        is_dispatched = TRUE
    WHERE id = v_old_log_id;
  END IF;

  SELECT COALESCE(intake_at, created_at) INTO v_intake_at
  FROM public.vehicles
  WHERE id = p_vehicle_id;

  v_total_break := public.calculate_break_overlap_seconds(COALESCE(v_intake_at, v_now), v_now);

  UPDATE public.vehicles
  SET current_zone = 'completed',
      is_finished = TRUE,
      completed_at = v_now,
      effective_completed_at = COALESCE(effective_completed_at, v_now),
      total_break_seconds = v_total_break,
      status = 'finished',
      is_paused = FALSE,
      paused_at = NULL,
      updated_at = v_now
  WHERE id = p_vehicle_id;

  RETURN jsonb_build_object('success', true, 'completed_at', v_now);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Workshop Performance KPIs RPC
CREATE OR REPLACE FUNCTION public.get_workshop_performance_kpis(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_branch_id VARCHAR(50) DEFAULT NULL,
  p_status TEXT DEFAULT 'all'
)
RETURNS JSONB AS $$
DECLARE
  v_total_vehicles INT := 0;
  v_completed_count INT := 0;
  v_in_progress_count INT := 0;
  v_booking_count INT := 0;
  v_additional_repairs_count INT := 0;
  v_total_break_sec INT := 0;
  v_workshop_json JSONB;
  v_alignment_json JSONB;
  v_hoist_json JSONB;
BEGIN
  -- Total, completed, in-progress counts
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE is_finished = TRUE OR current_zone = 'inspection' OR effective_completed_at IS NOT NULL),
    COUNT(*) FILTER (WHERE is_finished = FALSE AND current_zone != 'inspection' AND effective_completed_at IS NULL),
    COUNT(*) FILTER (WHERE is_booking = TRUE),
    COUNT(*) FILTER (WHERE has_additional_repairs = TRUE),
    COALESCE(SUM(
      CASE 
        WHEN total_break_seconds > 0 THEN total_break_seconds
        ELSE public.calculate_break_overlap_seconds(COALESCE(intake_at, created_at), COALESCE(effective_completed_at, completed_at, NOW()))
      END
    ), 0)
  INTO 
    v_total_vehicles, v_completed_count, v_in_progress_count,
    v_booking_count, v_additional_repairs_count, v_total_break_sec
  FROM public.vehicles
  WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND (p_start_date IS NULL OR intake_at >= p_start_date)
    AND (p_end_date IS NULL OR intake_at <= p_end_date)
    AND (
      p_status = 'all'
      OR (p_status = 'completed' AND (is_finished = TRUE OR current_zone = 'inspection' OR effective_completed_at IS NOT NULL))
      OR (p_status = 'in_progress' AND is_finished = FALSE AND current_zone != 'inspection' AND effective_completed_at IS NULL)
    );

  -- Helper for bay metrics
  SELECT jsonb_build_object(
    'zone', 'workshop',
    'name', 'General Service',
    'vehicleCount', COUNT(DISTINCT l.vehicle_id),
    'totalActiveSec', COALESCE(SUM(l.active_seconds), 0),
    'avgActiveSec', CASE WHEN COUNT(DISTINCT l.vehicle_id) > 0 THEN ROUND(COALESCE(SUM(l.active_seconds), 0) / COUNT(DISTINCT l.vehicle_id)) ELSE 0 END,
    'totalIdleSec', COALESCE(SUM(l.idle_seconds), 0),
    'avgIdleSec', CASE WHEN COUNT(DISTINCT l.vehicle_id) > 0 THEN ROUND(COALESCE(SUM(l.idle_seconds), 0) / COUNT(DISTINCT l.vehicle_id)) ELSE 0 END,
    'totalStageSec', COALESCE(SUM(l.duration_seconds), 0),
    'avgStageSec', CASE WHEN COUNT(DISTINCT l.vehicle_id) > 0 THEN ROUND(COALESCE(SUM(l.duration_seconds), 0) / COUNT(DISTINCT l.vehicle_id)) ELSE 0 END
  ) INTO v_workshop_json
  FROM public.stage_logs l
  JOIN public.vehicles v ON v.id = l.vehicle_id
  WHERE l.to_zone = 'workshop'
    AND l.is_dispatched = TRUE
    AND (p_branch_id IS NULL OR v.branch_id = p_branch_id)
    AND (p_start_date IS NULL OR v.intake_at >= p_start_date)
    AND (p_end_date IS NULL OR v.intake_at <= p_end_date);

  SELECT jsonb_build_object(
    'zone', 'alignment',
    'name', 'Wheel Alignment',
    'vehicleCount', COUNT(DISTINCT l.vehicle_id),
    'totalActiveSec', COALESCE(SUM(l.active_seconds), 0),
    'avgActiveSec', CASE WHEN COUNT(DISTINCT l.vehicle_id) > 0 THEN ROUND(COALESCE(SUM(l.active_seconds), 0) / COUNT(DISTINCT l.vehicle_id)) ELSE 0 END,
    'totalIdleSec', COALESCE(SUM(l.idle_seconds), 0),
    'avgIdleSec', CASE WHEN COUNT(DISTINCT l.vehicle_id) > 0 THEN ROUND(COALESCE(SUM(l.idle_seconds), 0) / COUNT(DISTINCT l.vehicle_id)) ELSE 0 END,
    'totalStageSec', COALESCE(SUM(l.duration_seconds), 0),
    'avgStageSec', CASE WHEN COUNT(DISTINCT l.vehicle_id) > 0 THEN ROUND(COALESCE(SUM(l.duration_seconds), 0) / COUNT(DISTINCT l.vehicle_id)) ELSE 0 END
  ) INTO v_alignment_json
  FROM public.stage_logs l
  JOIN public.vehicles v ON v.id = l.vehicle_id
  WHERE l.to_zone = 'alignment'
    AND l.is_dispatched = TRUE
    AND (p_branch_id IS NULL OR v.branch_id = p_branch_id)
    AND (p_start_date IS NULL OR v.intake_at >= p_start_date)
    AND (p_end_date IS NULL OR v.intake_at <= p_end_date);

  SELECT jsonb_build_object(
    'zone', 'hoist',
    'name', 'Hoist Service',
    'vehicleCount', COUNT(DISTINCT l.vehicle_id),
    'totalActiveSec', COALESCE(SUM(l.active_seconds), 0),
    'avgActiveSec', CASE WHEN COUNT(DISTINCT l.vehicle_id) > 0 THEN ROUND(COALESCE(SUM(l.active_seconds), 0) / COUNT(DISTINCT l.vehicle_id)) ELSE 0 END,
    'totalIdleSec', COALESCE(SUM(l.idle_seconds), 0),
    'avgIdleSec', CASE WHEN COUNT(DISTINCT l.vehicle_id) > 0 THEN ROUND(COALESCE(SUM(l.idle_seconds), 0) / COUNT(DISTINCT l.vehicle_id)) ELSE 0 END,
    'totalStageSec', COALESCE(SUM(l.duration_seconds), 0),
    'avgStageSec', CASE WHEN COUNT(DISTINCT l.vehicle_id) > 0 THEN ROUND(COALESCE(SUM(l.duration_seconds), 0) / COUNT(DISTINCT l.vehicle_id)) ELSE 0 END
  ) INTO v_hoist_json
  FROM public.stage_logs l
  JOIN public.vehicles v ON v.id = l.vehicle_id
  WHERE l.to_zone = 'hoist'
    AND l.is_dispatched = TRUE
    AND (p_branch_id IS NULL OR v.branch_id = p_branch_id)
    AND (p_start_date IS NULL OR v.intake_at >= p_start_date)
    AND (p_end_date IS NULL OR v.intake_at <= p_end_date);

  RETURN jsonb_build_object(
    'totalVehicles', v_total_vehicles,
    'completedCount', v_completed_count,
    'inProgressCount', v_in_progress_count,
    'bookingCount', v_booking_count,
    'additionalRepairsCount', v_additional_repairs_count,
    'totalBreakSeconds', v_total_break_sec,
    'workshopBay', v_workshop_json,
    'alignmentBay', v_alignment_json,
    'hoistBay', v_hoist_json
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Comprehensive Paginated Service Report Data RPC
CREATE OR REPLACE FUNCTION public.get_service_report_data(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_branch_id VARCHAR(50) DEFAULT NULL,
  p_status TEXT DEFAULT 'all'
)
RETURNS JSONB AS $$
DECLARE
  v_summary JSONB;
  v_workshop_bay JSONB;
  v_alignment_bay JSONB;
  v_hoist_bay JSONB;
  v_records JSONB;
BEGIN
  -- 1. Create temporary filtered vehicles table
  CREATE TEMP TABLE temp_filtered_vehicles ON COMMIT DROP AS
  SELECT 
    v.id,
    v.vehicle_no,
    v.status,
    v.current_zone,
    v.is_finished,
    v.is_paused,
    v.paused_at,
    v.pause_reason,
    v.is_booking,
    v.has_additional_repairs,
    v.is_urgent,
    v.urgent_note,
    v.technician_name,
    v.assigned_tech,
    v.remarks,
    v.intake_at,
    v.created_at,
    COALESCE(v.effective_completed_at, v.completed_at) AS effective_completed_at,
    v.gross_tat_seconds,
    v.net_tat_seconds,
    v.total_break_seconds
  FROM public.vehicles v
  WHERE (p_branch_id IS NULL OR v.branch_id = p_branch_id)
    AND (p_start_date IS NULL OR v.intake_at >= p_start_date)
    AND (p_end_date IS NULL OR v.intake_at <= p_end_date)
    AND (
      p_status = 'all'
      OR (p_status = 'completed' AND (v.is_finished = TRUE OR v.current_zone = 'inspection' OR v.effective_completed_at IS NOT NULL))
      OR (p_status = 'in_progress' AND v.is_finished = FALSE AND v.current_zone != 'inspection' AND v.effective_completed_at IS NULL)
    );

  -- 2. Summary Counts and Breakdown (with dynamic break calculation)
  SELECT jsonb_build_object(
    'totalVehicles', COUNT(*)::INT,
    'completedCount', COUNT(*) FILTER (WHERE is_finished = TRUE OR current_zone = 'inspection' OR effective_completed_at IS NOT NULL)::INT,
    'inProgressCount', COUNT(*) FILTER (WHERE is_finished = FALSE AND current_zone != 'inspection' AND effective_completed_at IS NULL)::INT,
    'bookingCount', COUNT(*) FILTER (WHERE is_booking = TRUE)::INT,
    'additionalRepairsCount', COUNT(*) FILTER (WHERE has_additional_repairs = TRUE)::INT,
    'onHoldCount', COUNT(*) FILTER (WHERE is_paused = TRUE OR status = 'on_hold')::INT,
    'totalBreakSeconds', COALESCE(SUM(
      CASE 
        WHEN total_break_seconds > 0 THEN total_break_seconds
        ELSE public.calculate_break_overlap_seconds(COALESCE(intake_at, created_at), COALESCE(effective_completed_at, NOW()))
      END
    ), 0)::INT
  ) INTO v_summary
  FROM temp_filtered_vehicles;

  -- 3. Bay Velocities (Benchmark averages exclude vehicles with additional repairs or on hold)
  WITH bay_stats AS (
    SELECT
      sl.to_zone,
      COUNT(DISTINCT sl.vehicle_id)::INT AS vehicle_count,
      COALESCE(SUM(sl.active_seconds), 0)::INT AS total_active_sec,
      COALESCE(SUM(sl.idle_seconds), 0)::INT AS total_idle_sec,
      COALESCE(SUM(sl.duration_seconds), 0)::INT AS total_stage_sec
    FROM public.stage_logs sl
    INNER JOIN temp_filtered_vehicles fv ON fv.id = sl.vehicle_id
    WHERE sl.exited_at IS NOT NULL
      AND fv.has_additional_repairs = FALSE
      AND fv.is_paused = FALSE
      AND fv.status != 'on_hold'
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
        'avgActiveSec', CASE WHEN vehicle_count > 0 THEN ROUND(total_active_sec::NUMERIC / vehicle_count) ELSE 0 END,
        'totalIdleSec', total_idle_sec,
        'avgIdleSec', CASE WHEN vehicle_count > 0 THEN ROUND(total_idle_sec::NUMERIC / vehicle_count) ELSE 0 END,
        'totalStageSec', total_stage_sec,
        'avgStageSec', CASE WHEN vehicle_count > 0 THEN ROUND(total_stage_sec::NUMERIC / vehicle_count) ELSE 0 END
      ) FROM bay_stats WHERE to_zone = 'workshop'
    ), jsonb_build_object('zone', 'workshop', 'name', 'General Service', 'vehicleCount', 0, 'totalActiveSec', 0, 'avgActiveSec', 0, 'totalIdleSec', 0, 'avgIdleSec', 0, 'totalStageSec', 0, 'avgStageSec', 0)),
    COALESCE((
      SELECT jsonb_build_object(
        'zone', 'alignment',
        'name', 'Wheel Alignment',
        'vehicleCount', vehicle_count,
        'totalActiveSec', total_active_sec,
        'avgActiveSec', CASE WHEN vehicle_count > 0 THEN ROUND(total_active_sec::NUMERIC / vehicle_count) ELSE 0 END,
        'totalIdleSec', total_idle_sec,
        'avgIdleSec', CASE WHEN vehicle_count > 0 THEN ROUND(total_idle_sec::NUMERIC / vehicle_count) ELSE 0 END,
        'totalStageSec', total_stage_sec,
        'avgStageSec', CASE WHEN vehicle_count > 0 THEN ROUND(total_stage_sec::NUMERIC / vehicle_count) ELSE 0 END
      ) FROM bay_stats WHERE to_zone = 'alignment'
    ), jsonb_build_object('zone', 'alignment', 'name', 'Wheel Alignment', 'vehicleCount', 0, 'totalActiveSec', 0, 'avgActiveSec', 0, 'totalIdleSec', 0, 'avgIdleSec', 0, 'totalStageSec', 0, 'avgStageSec', 0)),
    COALESCE((
      SELECT jsonb_build_object(
        'zone', 'hoist',
        'name', 'Hoist Service',
        'vehicleCount', vehicle_count,
        'totalActiveSec', total_active_sec,
        'avgActiveSec', CASE WHEN vehicle_count > 0 THEN ROUND(total_active_sec::NUMERIC / vehicle_count) ELSE 0 END,
        'totalIdleSec', total_idle_sec,
        'avgIdleSec', CASE WHEN vehicle_count > 0 THEN ROUND(total_idle_sec::NUMERIC / vehicle_count) ELSE 0 END,
        'totalStageSec', total_stage_sec,
        'avgStageSec', CASE WHEN vehicle_count > 0 THEN ROUND(total_stage_sec::NUMERIC / vehicle_count) ELSE 0 END
      ) FROM bay_stats WHERE to_zone = 'hoist'
    ), jsonb_build_object('zone', 'hoist', 'name', 'Hoist Service', 'vehicleCount', 0, 'totalActiveSec', 0, 'avgActiveSec', 0, 'totalIdleSec', 0, 'avgIdleSec', 0, 'totalStageSec', 0, 'avgStageSec', 0))
  INTO v_workshop_bay, v_alignment_bay, v_hoist_bay;

  -- 4. Pre-Calculated Vehicle Records with Dynamic Bay Telemetry Aggregations
  WITH vehicle_bay_aggregates AS (
    SELECT
      vehicle_id,
      MIN(CASE WHEN to_zone = 'workshop' THEN entered_at END) AS ws_first_in,
      COALESCE(SUM(CASE WHEN to_zone = 'workshop' THEN 
        CASE 
          WHEN exited_at IS NOT NULL THEN idle_seconds
          WHEN work_started_at IS NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - entered_at))::INT)
          WHEN work_completed_at IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (work_started_at - entered_at))::INT) + GREATEST(0, EXTRACT(EPOCH FROM (NOW() - work_completed_at))::INT)
          ELSE GREATEST(0, EXTRACT(EPOCH FROM (work_started_at - entered_at))::INT)
        END 
      END), 0)::INT AS ws_idle,

      COALESCE(SUM(CASE WHEN to_zone = 'workshop' THEN 
        CASE 
          WHEN exited_at IS NOT NULL THEN active_seconds
          WHEN work_started_at IS NULL THEN 0
          WHEN work_completed_at IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (work_completed_at - work_started_at))::INT)
          ELSE GREATEST(0, EXTRACT(EPOCH FROM (NOW() - work_started_at))::INT)
        END 
      END), 0)::INT AS ws_active,

      COALESCE(SUM(CASE WHEN to_zone = 'workshop' THEN 
        CASE 
          WHEN break_seconds > 0 THEN break_seconds 
          ELSE public.calculate_break_overlap_seconds(entered_at, COALESCE(exited_at, NOW()))
        END 
      END), 0)::INT AS ws_break,

      MIN(CASE WHEN to_zone = 'alignment' THEN entered_at END) AS al_first_in,
      COALESCE(SUM(CASE WHEN to_zone = 'alignment' THEN 
        CASE 
          WHEN exited_at IS NOT NULL THEN idle_seconds
          WHEN work_started_at IS NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - entered_at))::INT)
          WHEN work_completed_at IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (work_started_at - entered_at))::INT) + GREATEST(0, EXTRACT(EPOCH FROM (NOW() - work_completed_at))::INT)
          ELSE GREATEST(0, EXTRACT(EPOCH FROM (work_started_at - entered_at))::INT)
        END 
      END), 0)::INT AS al_idle,

      COALESCE(SUM(CASE WHEN to_zone = 'alignment' THEN 
        CASE 
          WHEN exited_at IS NOT NULL THEN active_seconds
          WHEN work_started_at IS NULL THEN 0
          WHEN work_completed_at IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (work_completed_at - work_started_at))::INT)
          ELSE GREATEST(0, EXTRACT(EPOCH FROM (NOW() - work_started_at))::INT)
        END 
      END), 0)::INT AS al_active,

      COALESCE(SUM(CASE WHEN to_zone = 'alignment' THEN 
        CASE 
          WHEN break_seconds > 0 THEN break_seconds 
          ELSE public.calculate_break_overlap_seconds(entered_at, COALESCE(exited_at, NOW()))
        END 
      END), 0)::INT AS al_break,

      MIN(CASE WHEN to_zone = 'hoist' THEN entered_at END) AS hs_first_in,
      COALESCE(SUM(CASE WHEN to_zone = 'hoist' THEN 
        CASE 
          WHEN exited_at IS NOT NULL THEN idle_seconds
          WHEN work_started_at IS NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - entered_at))::INT)
          WHEN work_completed_at IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (work_started_at - entered_at))::INT) + GREATEST(0, EXTRACT(EPOCH FROM (NOW() - work_completed_at))::INT)
          ELSE GREATEST(0, EXTRACT(EPOCH FROM (work_started_at - entered_at))::INT)
        END 
      END), 0)::INT AS hs_idle,

      COALESCE(SUM(CASE WHEN to_zone = 'hoist' THEN 
        CASE 
          WHEN exited_at IS NOT NULL THEN active_seconds
          WHEN work_started_at IS NULL THEN 0
          WHEN work_completed_at IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (work_completed_at - work_started_at))::INT)
          ELSE GREATEST(0, EXTRACT(EPOCH FROM (NOW() - work_started_at))::INT)
        END 
      END), 0)::INT AS hs_active,

      COALESCE(SUM(CASE WHEN to_zone = 'hoist' THEN 
        CASE 
          WHEN break_seconds > 0 THEN break_seconds 
          ELSE public.calculate_break_overlap_seconds(entered_at, COALESCE(exited_at, NOW()))
        END 
      END), 0)::INT AS hs_break,

      COALESCE(SUM(
        CASE 
          WHEN exited_at IS NOT NULL THEN idle_seconds
          WHEN work_started_at IS NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - entered_at))::INT)
          WHEN work_completed_at IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (work_started_at - entered_at))::INT) + GREATEST(0, EXTRACT(EPOCH FROM (NOW() - work_completed_at))::INT)
          ELSE GREATEST(0, EXTRACT(EPOCH FROM (work_started_at - entered_at))::INT)
        END
      ), 0)::INT AS total_idle_sec,

      COALESCE(SUM(
        CASE 
          WHEN exited_at IS NOT NULL THEN active_seconds
          WHEN work_started_at IS NULL THEN 0
          WHEN work_completed_at IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (work_completed_at - work_started_at))::INT)
          ELSE GREATEST(0, EXTRACT(EPOCH FROM (NOW() - work_started_at))::INT)
        END
      ), 0)::INT AS total_active_sec,

      COALESCE(SUM(
        CASE 
          WHEN break_seconds > 0 THEN break_seconds 
          ELSE public.calculate_break_overlap_seconds(entered_at, COALESCE(exited_at, NOW()))
        END
      ), 0)::INT AS total_stage_breaks_sec
    FROM public.stage_logs
    WHERE vehicle_id IN (SELECT id FROM temp_filtered_vehicles)
      AND to_zone IN ('workshop', 'alignment', 'hoist')
    GROUP BY vehicle_id
  ),
  task_summaries AS (
    SELECT
      vehicle_id,
      COUNT(*) FILTER (WHERE is_completed = TRUE)::INT AS tasks_completed_count,
      COUNT(*)::INT AS tasks_total_count,
      COALESCE(
        string_agg(
          task_name || ' (by ' || COALESCE(completed_by, 'Tech') || ')', 
          '; ' ORDER BY completed_at
        ) FILTER (WHERE is_completed = TRUE),
        'None'
      ) AS completed_tasks_str
    FROM public.vehicle_tasks
    WHERE vehicle_id IN (SELECT id FROM temp_filtered_vehicles)
    GROUP BY vehicle_id
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', fv.id,
      'vehicle_no', fv.vehicle_no,
      'status', fv.status,
      'current_zone', fv.current_zone,
      'is_finished', fv.is_finished,
      'is_effective_done', (fv.is_finished = TRUE OR fv.current_zone = 'inspection' OR fv.effective_completed_at IS NOT NULL),
      'is_paused', COALESCE(fv.is_paused, FALSE),
      'pause_reason', fv.pause_reason,
      'is_on_hold', (COALESCE(fv.is_paused, FALSE) = TRUE OR fv.status = 'on_hold'),
      'is_booking', fv.is_booking,
      'has_additional_repairs', fv.has_additional_repairs,
      'is_urgent', COALESCE(fv.is_urgent, FALSE),
      'urgent_note', fv.urgent_note,
      'technician_name', fv.technician_name,
      'assigned_tech', fv.assigned_tech,
      'remarks', fv.remarks,
      'intake_at', fv.intake_at,
      'created_at', fv.created_at,
      'effective_completed_at', fv.effective_completed_at,
      'gross_tat_seconds', COALESCE(
        NULLIF(fv.gross_tat_seconds, 0),
        GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(fv.effective_completed_at, NOW()) - COALESCE(fv.intake_at, fv.created_at)))::INT)
      ),
      'net_tat_seconds', COALESCE(fv.net_tat_seconds, 0),
      'total_break_seconds', COALESCE(
        NULLIF(vba.total_stage_breaks_sec, 0),
        CASE 
          WHEN fv.total_break_seconds > 0 THEN fv.total_break_seconds
          ELSE public.calculate_break_overlap_seconds(COALESCE(fv.intake_at, fv.created_at), COALESCE(fv.effective_completed_at, NOW()))
        END,
        0
      ),
      'total_idle_sec', COALESCE(vba.total_idle_sec, 0),
      'total_active_sec', COALESCE(vba.total_active_sec, 0),
      'workshop_first_in', vba.ws_first_in,
      'workshop_idle', COALESCE(vba.ws_idle, 0),
      'workshop_active', COALESCE(vba.ws_active, 0),
      'workshop_break', COALESCE(vba.ws_break, 0),
      'alignment_first_in', vba.al_first_in,
      'alignment_idle', COALESCE(vba.al_idle, 0),
      'alignment_active', COALESCE(vba.al_active, 0),
      'alignment_break', COALESCE(vba.al_break, 0),
      'hoist_first_in', vba.hs_first_in,
      'hoist_idle', COALESCE(vba.hs_idle, 0),
      'hoist_active', COALESCE(vba.hs_active, 0),
      'hoist_break', COALESCE(vba.hs_break, 0),
      'completed_tasks_str', COALESCE(ts.completed_tasks_str, 'None'),
      'tasks_completed_count', COALESCE(ts.tasks_completed_count, 0),
      'tasks_total_count', COALESCE(ts.tasks_total_count, 0)
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

-- 6. Historical Data Backfill
-- Compute and populate break_seconds for all past stage logs
UPDATE public.stage_logs
SET break_seconds = public.calculate_break_overlap_seconds(entered_at, exited_at)
WHERE exited_at IS NOT NULL
  AND (break_seconds IS NULL OR break_seconds = 0);

-- Compute and populate total_break_seconds for completed vehicles
UPDATE public.vehicles
SET total_break_seconds = public.calculate_break_overlap_seconds(COALESCE(intake_at, created_at), COALESCE(effective_completed_at, completed_at, NOW()))
WHERE is_finished = TRUE
  AND (total_break_seconds IS NULL OR total_break_seconds = 0);
