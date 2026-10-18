-- ==============================================================================
-- UNITED MOTORS VEHICLE TRACKING - MIGRATION V14
-- ADD VEHICLE TYPE, ASSIGNED ADVISOR & REPORT TELEMETRY EXPANSION
-- ==============================================================================

-- 1. ADD COLUMNS TO public.vehicles
ALTER TABLE public.vehicles 
  ADD COLUMN IF NOT EXISTS assigned_advisor VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(20) DEFAULT NULL;

-- 2. UPDATE ATOMIC INTAKE RPC
CREATE OR REPLACE FUNCTION public.intake_vehicle(
  p_vehicle_no character varying,
  p_target_zone character varying DEFAULT 'workshop'::character varying,
  p_technician_name character varying DEFAULT NULL::character varying,
  p_remarks text DEFAULT ''::text,
  p_is_booking boolean DEFAULT false,
  p_has_additional_repairs boolean DEFAULT false,
  p_is_urgent boolean DEFAULT false,
  p_urgent_note text DEFAULT NULL::text,
  p_tasks jsonb DEFAULT '[]'::jsonb,
  p_branch_id character varying DEFAULT 'orugodawatta_sec5'::character varying,
  p_assigned_advisor character varying DEFAULT NULL::character varying,
  p_vehicle_type character varying DEFAULT NULL::character varying
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_vehicle_id UUID;
  v_log_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_task RECORD;
BEGIN
  -- Insert vehicle
  INSERT INTO public.vehicles (
    vehicle_no, current_zone, technician_name, assigned_tech,
    remarks, is_booking, has_additional_repairs, is_urgent, urgent_note,
    intake_at, status, is_finished, branch_id,
    assigned_advisor, vehicle_type
  ) VALUES (
    UPPER(TRIM(p_vehicle_no)), p_target_zone::bay_zone, p_technician_name,
    COALESCE(p_technician_name, 'Unassigned'), p_remarks,
    p_is_booking, p_has_additional_repairs, p_is_urgent, p_urgent_note,
    v_now, 'active', FALSE, p_branch_id,
    p_assigned_advisor, p_vehicle_type
  ) RETURNING id INTO v_vehicle_id;

  -- Insert initial stage log
  INSERT INTO public.stage_logs (
    vehicle_id, to_zone, visit_number, entered_at,
    work_started_at, duration_seconds, idle_seconds, active_seconds,
    moved_by, technician_name, branch_id
  ) VALUES (
    v_vehicle_id, p_target_zone::bay_zone, 1, v_now,
    NULL, 0, 0, 0,
    'Job Supervisor', p_technician_name, p_branch_id
  ) RETURNING id INTO v_log_id;

  -- Insert tasks if provided
  IF jsonb_array_length(p_tasks) > 0 THEN
    FOR v_task IN SELECT * FROM jsonb_to_recordset(p_tasks) AS t(task_name TEXT, task_type TEXT, is_required BOOLEAN)
    LOOP
      INSERT INTO public.vehicle_tasks (
        vehicle_id, task_name, task_type, is_required, is_completed
      ) VALUES (
        v_vehicle_id, v_task.task_name, v_task.task_type::task_type,
        COALESCE(v_task.is_required, TRUE), FALSE
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true, 'vehicle_id', v_vehicle_id, 'log_id', v_log_id);
END;
$function$;

-- 3. UPDATE COMPREHENSIVE SERVICE REPORT RPC TO INCLUDE TYPE & ADVISOR
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
    v.total_break_seconds,
    v.assigned_advisor,
    v.vehicle_type
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
    jsonb_build_object(
      'vehicleCount', COALESCE(MAX(CASE WHEN to_zone = 'workshop' THEN vehicle_count END), 0),
      'avgStageSec', COALESCE(ROUND(MAX(CASE WHEN to_zone = 'workshop' THEN total_stage_sec::NUMERIC / NULLIF(vehicle_count, 0) END)), 0)::INT,
      'avgActiveSec', COALESCE(ROUND(MAX(CASE WHEN to_zone = 'workshop' THEN total_active_sec::NUMERIC / NULLIF(vehicle_count, 0) END)), 0)::INT,
      'avgIdleSec', COALESCE(ROUND(MAX(CASE WHEN to_zone = 'workshop' THEN total_idle_sec::NUMERIC / NULLIF(vehicle_count, 0) END)), 0)::INT
    ),
    jsonb_build_object(
      'vehicleCount', COALESCE(MAX(CASE WHEN to_zone = 'alignment' THEN vehicle_count END), 0),
      'avgStageSec', COALESCE(ROUND(MAX(CASE WHEN to_zone = 'alignment' THEN total_stage_sec::NUMERIC / NULLIF(vehicle_count, 0) END)), 0)::INT,
      'avgActiveSec', COALESCE(ROUND(MAX(CASE WHEN to_zone = 'alignment' THEN total_active_sec::NUMERIC / NULLIF(vehicle_count, 0) END)), 0)::INT,
      'avgIdleSec', COALESCE(ROUND(MAX(CASE WHEN to_zone = 'alignment' THEN total_idle_sec::NUMERIC / NULLIF(vehicle_count, 0) END)), 0)::INT
    ),
    jsonb_build_object(
      'vehicleCount', COALESCE(MAX(CASE WHEN to_zone = 'hoist' THEN vehicle_count END), 0),
      'avgStageSec', COALESCE(ROUND(MAX(CASE WHEN to_zone = 'hoist' THEN total_stage_sec::NUMERIC / NULLIF(vehicle_count, 0) END)), 0)::INT,
      'avgActiveSec', COALESCE(ROUND(MAX(CASE WHEN to_zone = 'hoist' THEN total_active_sec::NUMERIC / NULLIF(vehicle_count, 0) END)), 0)::INT,
      'avgIdleSec', COALESCE(ROUND(MAX(CASE WHEN to_zone = 'hoist' THEN total_idle_sec::NUMERIC / NULLIF(vehicle_count, 0) END)), 0)::INT
    )
  INTO v_workshop_bay, v_alignment_bay, v_hoist_bay
  FROM bay_stats;

  -- 4. Vehicle Stage & Task Breakdown Records
  WITH vehicle_bay_aggregates AS (
    SELECT 
      sl.vehicle_id,
      MIN(CASE WHEN sl.to_zone = 'workshop' THEN sl.entered_at END) AS ws_first_in,
      COALESCE(SUM(CASE WHEN sl.to_zone = 'workshop' THEN sl.idle_seconds END), 0)::INT AS ws_idle,
      COALESCE(SUM(CASE WHEN sl.to_zone = 'workshop' THEN sl.active_seconds END), 0)::INT AS ws_active,
      COALESCE(SUM(CASE WHEN sl.to_zone = 'workshop' THEN sl.break_seconds END), 0)::INT AS ws_break,
      MIN(CASE WHEN sl.to_zone = 'alignment' THEN sl.entered_at END) AS al_first_in,
      COALESCE(SUM(CASE WHEN sl.to_zone = 'alignment' THEN sl.idle_seconds END), 0)::INT AS al_idle,
      COALESCE(SUM(CASE WHEN sl.to_zone = 'alignment' THEN sl.active_seconds END), 0)::INT AS al_active,
      COALESCE(SUM(CASE WHEN sl.to_zone = 'alignment' THEN sl.break_seconds END), 0)::INT AS al_break,
      MIN(CASE WHEN sl.to_zone = 'hoist' THEN sl.entered_at END) AS hs_first_in,
      COALESCE(SUM(CASE WHEN sl.to_zone = 'hoist' THEN sl.idle_seconds END), 0)::INT AS hs_idle,
      COALESCE(SUM(CASE WHEN sl.to_zone = 'hoist' THEN sl.active_seconds END), 0)::INT AS hs_active,
      COALESCE(SUM(CASE WHEN sl.to_zone = 'hoist' THEN sl.break_seconds END), 0)::INT AS hs_break,
      COALESCE(SUM(sl.idle_seconds), 0)::INT AS total_idle_sec,
      COALESCE(SUM(sl.active_seconds), 0)::INT AS total_active_sec,
      COALESCE(SUM(sl.break_seconds), 0)::INT AS total_stage_breaks_sec
    FROM public.stage_logs sl
    WHERE sl.vehicle_id IN (SELECT id FROM temp_filtered_vehicles)
    GROUP BY sl.vehicle_id
  ),
  task_summaries AS (
    SELECT
      vehicle_id,
      COUNT(*)::INT AS tasks_total_count,
      COUNT(*) FILTER (WHERE is_completed = TRUE)::INT AS tasks_completed_count,
      COALESCE(
        string_agg(
          CASE 
            WHEN task_type = 'general_service' THEN 'General'
            WHEN task_type = 'wheel_alignment' THEN 'Alignment'
            WHEN task_type = 'hoist_service' THEN 'Hoist'
            ELSE task_name
          END,
          ', '
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
      'assigned_advisor', fv.assigned_advisor,
      'vehicle_type', fv.vehicle_type,
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
