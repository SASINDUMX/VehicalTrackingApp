-- ==============================================================================
-- United Motors Vehicle Tracking - Migration v3: Performance & RPC Architecture
-- ==============================================================================

-- 1. ENHANCE VEHICLES TABLE WITH INDEXED FIELDS
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS effective_completed_at TIMESTAMPTZ;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS gross_tat_seconds INT DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS net_tat_seconds INT DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS total_break_seconds INT DEFAULT 0;

-- 2. HIGH-PERFORMANCE INDEXES
-- Immutable expression index on intake date in Asia/Colombo for instant date-partitioned filtering
CREATE INDEX IF NOT EXISTS idx_vehicles_intake_date ON vehicles((DATE(intake_at AT TIME ZONE 'Asia/Colombo')));
CREATE INDEX IF NOT EXISTS idx_vehicles_active_zone ON vehicles(current_zone) WHERE is_finished = FALSE;
CREATE INDEX IF NOT EXISTS idx_vehicles_branch_finished ON vehicles(branch_id, is_finished);
CREATE INDEX IF NOT EXISTS idx_stage_logs_active ON stage_logs(vehicle_id) WHERE exited_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stage_logs_zone_entered ON stage_logs(to_zone, entered_at);
CREATE INDEX IF NOT EXISTS idx_stage_logs_zone_work ON stage_logs(to_zone, work_started_at);
CREATE INDEX IF NOT EXISTS idx_stage_logs_vehicle_entered ON stage_logs(vehicle_id, entered_at);

-- 3. ATOMIC RPC: RECONCILE DAILY VEHICLES (OVERNIGHT MIDNIGHT RESET)
CREATE OR REPLACE FUNCTION reconcile_daily_vehicles(
  p_branch_id TEXT DEFAULT 'main_workshop'
)
RETURNS JSONB AS $$
DECLARE
  v_completed_count INT := 0;
  v_deleted_count INT := 0;
  v_start_of_today TIMESTAMPTZ;
BEGIN
  -- Determine start of today in Asia/Colombo
  v_start_of_today := (NOW() AT TIME ZONE 'Asia/Colombo')::DATE::TIMESTAMPTZ AT TIME ZONE 'Asia/Colombo';

  -- 1. Auto-complete lingering inspection vehicles from previous days
  WITH closed_logs AS (
    UPDATE stage_logs sl
    SET exited_at = NOW(),
        duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - sl.entered_at))::INT),
        idle_seconds = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - sl.entered_at))::INT)
    FROM vehicles v
    WHERE sl.vehicle_id = v.id
      AND v.is_finished = FALSE
      AND v.current_zone = 'inspection'
      AND v.intake_at < v_start_of_today
      AND sl.exited_at IS NULL
    RETURNING sl.id
  ),
  finished_vehicles AS (
    UPDATE vehicles
    SET current_zone = 'completed',
        is_finished = TRUE,
        completed_at = NOW(),
        is_paused = FALSE,
        paused_at = NULL
    WHERE is_finished = FALSE
      AND current_zone = 'inspection'
      AND intake_at < v_start_of_today
    RETURNING id
  )
  SELECT COUNT(*) INTO v_completed_count FROM finished_vehicles;

  -- 2. Delete out-of-scope unfinished working-bay vehicles from previous days
  -- Foreign key ON DELETE CASCADE automatically removes their stage_logs and vehicle_tasks
  WITH deleted_vehicles AS (
    DELETE FROM vehicles
    WHERE is_finished = FALSE
      AND current_zone != 'inspection'
      AND intake_at < v_start_of_today
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_count FROM deleted_vehicles;

  RETURN jsonb_build_object(
    'success', true,
    'completed_count', v_completed_count,
    'deleted_count', v_deleted_count,
    'reconciled_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. ATOMIC RPC: INTAKE NEW VEHICLE (SINGLE TRANSACTION)
CREATE OR REPLACE FUNCTION intake_vehicle(
  p_vehicle_no TEXT,
  p_target_zone bay_zone,
  p_assigned_tech TEXT,
  p_remarks TEXT,
  p_is_urgent BOOLEAN DEFAULT FALSE,
  p_urgent_note TEXT DEFAULT NULL,
  p_tasks JSONB DEFAULT '[]'::JSONB,
  p_branch_id TEXT DEFAULT 'main_workshop'
)
RETURNS JSONB AS $$
DECLARE
  v_clean_no TEXT;
  v_new_vehicle_id UUID;
  v_new_log_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_task JSONB;
BEGIN
  v_clean_no := UPPER(TRIM(p_vehicle_no));

  -- Guard against duplicate active vehicle
  IF EXISTS (SELECT 1 FROM vehicles WHERE UPPER(TRIM(vehicle_no)) = v_clean_no AND is_finished = FALSE) THEN
    RAISE EXCEPTION 'Vehicle % is already active in the workshop', v_clean_no;
  END IF;

  -- 1. Insert vehicle
  INSERT INTO vehicles (
    vehicle_no, current_zone, assigned_tech, remarks,
    is_urgent, urgent_note, branch_id, intake_at, created_at,
    is_finished, status
  ) VALUES (
    v_clean_no, p_target_zone, COALESCE(p_assigned_tech, 'Unassigned'), COALESCE(p_remarks, ''),
    COALESCE(p_is_urgent, false), p_urgent_note, COALESCE(p_branch_id, 'main_workshop'), v_now, v_now,
    false, 'active'
  ) RETURNING id INTO v_new_vehicle_id;

  -- 2. Insert initial stage log
  INSERT INTO stage_logs (
    vehicle_id, to_zone, entered_at, branch_id, moved_by,
    work_started_at, idle_seconds, duration_seconds
  ) VALUES (
    v_new_vehicle_id, p_target_zone, v_now, COALESCE(p_branch_id, 'main_workshop'), 'Job Supervisor',
    NULL, 0, 0
  ) RETURNING id INTO v_new_log_id;

  -- 3. Bulk insert required tasks
  IF p_tasks IS NOT NULL AND jsonb_array_length(p_tasks) > 0 THEN
    FOR v_task IN SELECT * FROM jsonb_array_elements(p_tasks) LOOP
      INSERT INTO vehicle_tasks (
        vehicle_id,
        task_name,
        task_type,
        is_required,
        is_completed
      ) VALUES (
        v_new_vehicle_id,
        (v_task->>'task_name')::VARCHAR,
        (v_task->>'task_type')::task_type,
        COALESCE((v_task->>'is_required')::BOOLEAN, true),
        false
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'vehicle_id', v_new_vehicle_id,
    'log_id', v_new_log_id,
    'vehicle_no', v_clean_no,
    'intake_at', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. ATOMIC RPC: START STAGE WORK (IDLE TO ACTIVE TRANSITION)
CREATE OR REPLACE FUNCTION start_stage_work(
  p_vehicle_id UUID,
  p_tech_name TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_active_log_id UUID;
  v_entered_at TIMESTAMPTZ;
  v_idle_sec INT := 0;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Locate active stage log waiting for work to start
  SELECT id, entered_at INTO v_active_log_id, v_entered_at
  FROM stage_logs
  WHERE vehicle_id = p_vehicle_id AND exited_at IS NULL AND work_started_at IS NULL
  ORDER BY entered_at DESC
  LIMIT 1;

  IF v_active_log_id IS NOT NULL THEN
    v_idle_sec := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_entered_at))::INT);
    UPDATE stage_logs
    SET work_started_at = v_now,
        idle_seconds = v_idle_sec
    WHERE id = v_active_log_id;
  END IF;

  IF nullif(trim(p_tech_name), '') IS NOT NULL THEN
    UPDATE vehicles
    SET assigned_tech = p_tech_name
    WHERE id = p_vehicle_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'vehicle_id', p_vehicle_id,
    'log_id', v_active_log_id,
    'work_started_at', v_now,
    'idle_seconds', v_idle_sec
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. ATOMIC RPC: TRANSFER VEHICLE ZONE (BAY TO BAY DISPATCH)
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
      v_idle := COALESCE(v_existing_idle, GREATEST(0, EXTRACT(EPOCH FROM (v_work_started_at - v_entered_at))::INT));
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

  -- Update vehicle current zone and unpause
  UPDATE vehicles
  SET current_zone = p_to_zone,
      is_paused = FALSE,
      paused_at = NULL
  WHERE id = p_vehicle_id;

  RETURN jsonb_build_object(
    'success', true,
    'from_zone', v_from_zone,
    'to_zone', p_to_zone,
    'new_log_id', v_new_log_id,
    'duration_seconds', v_duration,
    'idle_seconds', v_idle
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7. ATOMIC RPC: FINISH VEHICLE JOB SHEET (ADVISOR HANDOVER)
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

  -- Mark vehicle as finished
  UPDATE vehicles
  SET current_zone = 'completed',
      is_finished = TRUE,
      completed_at = v_now,
      is_paused = FALSE,
      paused_at = NULL
  WHERE id = p_vehicle_id;

  RETURN jsonb_build_object(
    'success', true,
    'completed_at', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 8. ATOMIC RPC: TOGGLE TASK COMPLETION
CREATE OR REPLACE FUNCTION toggle_task_completion(
  p_task_id UUID,
  p_is_completed BOOLEAN DEFAULT NULL,
  p_completed_by TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_current_state BOOLEAN;
  v_new_state BOOLEAN;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT is_completed INTO v_current_state
  FROM vehicle_tasks WHERE id = p_task_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;

  IF p_is_completed IS NOT NULL THEN
    v_new_state := p_is_completed;
  ELSE
    v_new_state := NOT v_current_state;
  END IF;

  UPDATE vehicle_tasks
  SET is_completed = v_new_state,
      completed_at = CASE WHEN v_new_state THEN v_now ELSE NULL END,
      completed_by = CASE WHEN v_new_state THEN COALESCE(p_completed_by, 'Technician') ELSE NULL END
  WHERE id = p_task_id;

  RETURN jsonb_build_object(
    'success', true,
    'is_completed', v_new_state,
    'completed_at', CASE WHEN v_new_state THEN v_now ELSE NULL END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 9. ATOMIC RPC: GET SERVICE REPORT KPIS (HIGH-SPEED SERVER-SIDE AGGREGATION)
CREATE OR REPLACE FUNCTION get_service_report_kpis(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_branch_id TEXT DEFAULT 'main_workshop',
  p_status TEXT DEFAULT 'all'
)
RETURNS JSONB AS $$
DECLARE
  v_total_vehicles INT := 0;
  v_completed_count INT := 0;
  v_in_progress_count INT := 0;

  v_ws_count INT := 0;
  v_ws_active INT := 0;
  v_ws_idle INT := 0;
  v_ws_stage INT := 0;

  v_al_count INT := 0;
  v_al_active INT := 0;
  v_al_idle INT := 0;
  v_al_stage INT := 0;

  v_hs_count INT := 0;
  v_hs_active INT := 0;
  v_hs_idle INT := 0;
  v_hs_stage INT := 0;
BEGIN
  -- Filter matching vehicles
  WITH filtered_vehicles AS (
    SELECT v.id, v.is_finished, v.current_zone, v.intake_at
    FROM vehicles v
    WHERE (p_branch_id IS NULL OR v.branch_id = p_branch_id)
      AND (p_start_date IS NULL OR v.intake_at >= p_start_date)
      AND (p_end_date IS NULL OR v.intake_at <= p_end_date)
      AND (
        p_status = 'all'
        OR (p_status = 'completed' AND (v.is_finished = TRUE OR v.current_zone = 'inspection'))
        OR (p_status = 'in_progress' AND (v.is_finished = FALSE AND v.current_zone != 'inspection'))
      )
  ),
  counts AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE is_finished = TRUE OR current_zone = 'inspection') AS completed,
      COUNT(*) FILTER (WHERE is_finished = FALSE AND current_zone != 'inspection') AS in_progress
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
    GROUP BY sl.to_zone
  )
  SELECT total, completed, in_progress INTO v_total_vehicles, v_completed_count, v_in_progress_count FROM counts;

  -- Workshop Bay metrics
  SELECT vehicle_count, active_sec, idle_sec, stage_sec
  INTO v_ws_count, v_ws_active, v_ws_idle, v_ws_stage
  FROM bay_logs WHERE to_zone = 'workshop';

  -- Alignment Bay metrics
  SELECT vehicle_count, active_sec, idle_sec, stage_sec
  INTO v_al_count, v_al_active, v_al_idle, v_al_stage
  FROM bay_logs WHERE to_zone = 'alignment';

  -- Hoist Bay metrics
  SELECT vehicle_count, active_sec, idle_sec, stage_sec
  INTO v_hs_count, v_hs_active, v_hs_idle, v_hs_stage
  FROM bay_logs WHERE to_zone = 'hoist';

  RETURN jsonb_build_object(
    'totalVehicles', COALESCE(v_total_vehicles, 0),
    'completedCount', COALESCE(v_completed_count, 0),
    'inProgressCount', COALESCE(v_in_progress_count, 0),
    'workshopBay', jsonb_build_object(
      'zone', 'workshop',
      'name', 'General Service',
      'vehicleCount', COALESCE(v_ws_count, 0),
      'totalActiveSec', COALESCE(v_ws_active, 0),
      'avgActiveSec', CASE WHEN COALESCE(v_ws_count, 0) > 0 THEN v_ws_active / v_ws_count ELSE 0 END,
      'totalIdleSec', COALESCE(v_ws_idle, 0),
      'avgIdleSec', CASE WHEN COALESCE(v_ws_count, 0) > 0 THEN v_ws_idle / v_ws_count ELSE 0 END,
      'totalStageSec', COALESCE(v_ws_stage, 0),
      'avgStageSec', CASE WHEN COALESCE(v_ws_count, 0) > 0 THEN v_ws_stage / v_ws_count ELSE 0 END
    ),
    'alignmentBay', jsonb_build_object(
      'zone', 'alignment',
      'name', 'Wheel Alignment',
      'vehicleCount', COALESCE(v_al_count, 0),
      'totalActiveSec', COALESCE(v_al_active, 0),
      'avgActiveSec', CASE WHEN COALESCE(v_al_count, 0) > 0 THEN v_al_active / v_al_count ELSE 0 END,
      'totalIdleSec', COALESCE(v_al_idle, 0),
      'avgIdleSec', CASE WHEN COALESCE(v_al_count, 0) > 0 THEN v_al_idle / v_al_count ELSE 0 END,
      'totalStageSec', COALESCE(v_al_stage, 0),
      'avgStageSec', CASE WHEN COALESCE(v_al_count, 0) > 0 THEN v_al_stage / v_al_count ELSE 0 END
    ),
    'hoistBay', jsonb_build_object(
      'zone', 'hoist',
      'name', 'Hoist Service',
      'vehicleCount', COALESCE(v_hs_count, 0),
      'totalActiveSec', COALESCE(v_hs_active, 0),
      'avgActiveSec', CASE WHEN COALESCE(v_hs_count, 0) > 0 THEN v_hs_active / v_hs_count ELSE 0 END,
      'totalIdleSec', COALESCE(v_hs_idle, 0),
      'avgIdleSec', CASE WHEN COALESCE(v_hs_count, 0) > 0 THEN v_hs_idle / v_hs_count ELSE 0 END,
      'totalStageSec', COALESCE(v_hs_stage, 0),
      'avgStageSec', CASE WHEN COALESCE(v_hs_count, 0) > 0 THEN v_hs_stage / v_hs_count ELSE 0 END
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
