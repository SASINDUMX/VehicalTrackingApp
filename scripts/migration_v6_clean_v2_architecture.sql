-- ==============================================================================
-- UNITED MOTORS VEHICLE TRACKING - MIGRATION V6: MULTI-TENANT V2.0 ARCHITECTURE
-- ==============================================================================
-- Run this script in the Supabase SQL Editor.
-- 100% Safe, Additive, and Idempotent. Preserves existing vehicle records.
-- ==============================================================================

-- 1. ENUM CHECK: bay_zone must contain: workshop, hoist, alignment, inspection, completed
-- (washing was removed from the workflow — vehicles intake directly into a service bay)

-- 2. MASTER DIRECTORY: workplaces
CREATE TABLE IF NOT EXISTS workplaces (
  id VARCHAR(50) PRIMARY KEY,             -- e.g. 'main_workshop', 'kandy_branch'
  name VARCHAR(100) NOT NULL,             -- e.g. 'United Motors - Colombo Main Workshop'
  code VARCHAR(10) UNIQUE NOT NULL,       -- e.g. 'CMB', 'KDY'
  city VARCHAR(50) NOT NULL DEFAULT 'Colombo',
  timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Colombo',
  shift_hours JSONB NOT NULL DEFAULT '{
    "morning_tea": {"start": "09:45", "end": "10:00"},
    "lunch": {"start": "12:30", "end": "13:00"},
    "evening_tea": {"start": "14:45", "end": "15:00"}
  }'::JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial workplaces (Peliyagoda Section 5 [Default], Peliyagoda Section 2, Ratmalana)
INSERT INTO workplaces (id, name, code, city)
VALUES 
  ('peliyagoda_sec5', 'United Motors - Peliyagoda (Section 5)', 'SEC 5', 'Peliyagoda'),
  ('peliyagoda_sec2', 'United Motors - Peliyagoda (Section 2)', 'SEC 2', 'Peliyagoda'),
  ('ratmalana', 'United Motors - Ratmalana', 'RTM', 'Ratmalana')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  city = EXCLUDED.city;

-- 3. OPERATIONAL TABLE UPDATES: vehicles
ALTER TABLE vehicles 
  ADD COLUMN IF NOT EXISTS branch_id VARCHAR(50) NOT NULL DEFAULT 'peliyagoda_sec5' REFERENCES workplaces(id),
  ADD COLUMN IF NOT EXISTS technician_name VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_booking BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_additional_repairs BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pause_reason VARCHAR(100) DEFAULT 'major_repair',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Update status check constraint to include 'on_hold'
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_status_check;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_status_check 
  CHECK (status IN ('active', 'finished', 'incomplete', 'on_hold'));

-- 4. OPERATIONAL TABLE UPDATES: stage_logs
ALTER TABLE stage_logs 
  ADD COLUMN IF NOT EXISTS branch_id VARCHAR(50) NOT NULL DEFAULT 'peliyagoda_sec5' REFERENCES workplaces(id),
  ADD COLUMN IF NOT EXISTS work_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS active_seconds INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visit_number INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS technician_name VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stage_remarks TEXT DEFAULT NULL;

-- 5. USER PROFILES: multi-branch capability
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS branch_id VARCHAR(50) NOT NULL DEFAULT 'peliyagoda_sec5' REFERENCES workplaces(id);

-- 6. HIGH-PERFORMANCE MULTI-TENANT INDEXES
CREATE INDEX IF NOT EXISTS idx_vehicles_branch_status ON vehicles (branch_id, status) WHERE is_finished = FALSE;
CREATE INDEX IF NOT EXISTS idx_vehicles_branch_intake ON vehicles (branch_id, intake_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicles_booking ON vehicles(is_booking) WHERE is_finished = FALSE;
CREATE INDEX IF NOT EXISTS idx_vehicles_additional_repairs ON vehicles(has_additional_repairs);
CREATE INDEX IF NOT EXISTS idx_stage_logs_branch ON stage_logs (branch_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_stage_logs_visit ON stage_logs(vehicle_id, to_zone, visit_number);
CREATE INDEX IF NOT EXISTS idx_stage_logs_completed_at ON stage_logs(work_completed_at) WHERE work_completed_at IS NOT NULL;

-- Unique active vehicle plate scoped per branch (allows same plate in historical or other branches)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_unique_active_plate_per_branch 
  ON vehicles (branch_id, UPPER(TRIM(vehicle_no))) 
  WHERE is_finished = FALSE;

-- 7. ATOMIC MULTI-TENANT RPC UPDATES

-- 7.1 Shift Break Deduction Function
CREATE OR REPLACE FUNCTION calculate_break_overlap_seconds(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
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

-- 7.2 Vehicle Intake Function (With Branch Scoping)
CREATE OR REPLACE FUNCTION intake_vehicle(
  p_vehicle_no TEXT,
  p_target_zone bay_zone DEFAULT 'workshop',
  p_technician_name TEXT DEFAULT NULL,
  p_remarks TEXT DEFAULT '',
  p_is_booking BOOLEAN DEFAULT FALSE,
  p_has_additional_repairs BOOLEAN DEFAULT FALSE,
  p_is_urgent BOOLEAN DEFAULT FALSE,
  p_urgent_note TEXT DEFAULT NULL,
  p_tasks JSONB DEFAULT '[]'::JSONB,
  p_branch_id VARCHAR(50) DEFAULT 'peliyagoda_sec5'
)
RETURNS JSONB AS $$
DECLARE
  v_clean_no TEXT := UPPER(TRIM(p_vehicle_no));
  v_branch VARCHAR(50) := COALESCE(NULLIF(TRIM(p_branch_id), ''), 'peliyagoda_sec5');
  v_vid UUID;
  v_lid UUID;
  v_now TIMESTAMPTZ := NOW();
  v_task JSONB;
BEGIN
  IF v_clean_no = '' THEN RAISE EXCEPTION 'Vehicle plate cannot be empty'; END IF;

  INSERT INTO vehicles (
    vehicle_no, current_zone, technician_name, remarks,
    is_booking, has_additional_repairs, is_urgent, urgent_note,
    intake_at, status, branch_id, is_finished
  ) VALUES (
    v_clean_no, p_target_zone, p_technician_name, p_remarks,
    p_is_booking, p_has_additional_repairs, p_is_urgent,
    CASE WHEN p_is_urgent THEN NULLIF(TRIM(p_urgent_note), '') ELSE NULL END,
    v_now, 'active', v_branch, FALSE
  ) RETURNING id INTO v_vid;

  INSERT INTO stage_logs (
    vehicle_id, from_zone, to_zone, visit_number,
    entered_at, moved_by, branch_id, technician_name
  ) VALUES (
    v_vid, NULL, p_target_zone, 1,
    v_now, 'Intake Supervisor', v_branch, p_technician_name
  ) RETURNING id INTO v_lid;

  IF p_tasks IS NOT NULL AND jsonb_array_length(p_tasks) > 0 THEN
    FOR v_task IN SELECT * FROM jsonb_array_elements(p_tasks) LOOP
      INSERT INTO vehicle_tasks (vehicle_id, task_name, task_type, is_required, is_completed)
      VALUES (
        v_vid, 
        (v_task->>'task_name')::TEXT, 
        (v_task->>'task_type')::task_type, 
        COALESCE((v_task->>'is_required')::BOOLEAN, TRUE), 
        FALSE
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true, 'vehicle_id', v_vid, 'log_id', v_lid, 'branch_id', v_branch);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7.3 Transfer Vehicle Zone (Supports Hoist <-> Workshop Multi-Pass with Branch Propagation)
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
BEGIN
  SELECT current_zone, branch_id 
  INTO v_from_zone, v_branch_id 
  FROM vehicles 
  WHERE id = p_vehicle_id;

  IF v_from_zone IS NULL THEN
    RAISE EXCEPTION 'Vehicle % not found', p_vehicle_id;
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

-- 7.4 Finish Vehicle Job Sheet (Calculates & Freezes Final Metrics)
CREATE OR REPLACE FUNCTION finish_vehicle_job(
  p_vehicle_id UUID,
  p_advisor_name TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_intake_at TIMESTAMPTZ;
  v_effective_completed TIMESTAMPTZ;
  v_active_log_id UUID;
  v_gross_tat INT := 0;
  v_net_tat INT := 0;
  v_total_breaks INT := 0;
BEGIN
  -- Close open inspection stage log if open
  SELECT id INTO v_active_log_id 
  FROM stage_logs 
  WHERE vehicle_id = p_vehicle_id AND exited_at IS NULL 
  ORDER BY entered_at DESC LIMIT 1;

  IF v_active_log_id IS NOT NULL THEN
    UPDATE stage_logs SET exited_at = v_now WHERE id = v_active_log_id;
  END IF;

  SELECT intake_at, effective_completed_at 
  INTO v_intake_at, v_effective_completed 
  FROM vehicles 
  WHERE id = p_vehicle_id;

  -- Compute exact telemetry server-side
  v_gross_tat := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_intake_at))::INT);
  v_total_breaks := calculate_break_overlap_seconds(v_intake_at, v_now);
  SELECT COALESCE(SUM(active_seconds), 0) INTO v_net_tat FROM stage_logs WHERE vehicle_id = p_vehicle_id;

  -- Freeze metrics onto vehicle row
  UPDATE vehicles
  SET current_zone = 'completed',
      is_finished = TRUE,
      completed_at = v_now,
      effective_completed_at = COALESCE(v_effective_completed, v_now),
      status = 'finished',
      gross_tat_seconds = v_gross_tat,
      net_tat_seconds = v_net_tat,
      total_break_seconds = v_total_breaks
  WHERE id = p_vehicle_id;

  RETURN jsonb_build_object('success', true, 'gross_tat', v_gross_tat, 'net_tat', v_net_tat);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7.5 Midnight Reconciliation (Branch Scoped + Strictly Protects Paused / On-Hold Vehicles)
CREATE OR REPLACE FUNCTION reconcile_daily_vehicles(p_branch_id VARCHAR(50) DEFAULT 'peliyagoda_sec5')
RETURNS JSONB AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_start_of_today TIMESTAMPTZ := (v_now AT TIME ZONE 'Asia/Colombo')::DATE::TIMESTAMPTZ AT TIME ZONE 'Asia/Colombo';
  v_completed_count INT := 0;
  v_deleted_count INT := 0;
  v_rec RECORD;
BEGIN
  -- 1. Auto-complete leftover inspection vehicles from previous days with frozen metrics for this branch
  FOR v_rec IN 
    SELECT id FROM vehicles 
    WHERE is_finished = FALSE 
      AND current_zone = 'inspection' 
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND intake_at < v_start_of_today 
  LOOP
    PERFORM finish_vehicle_job(v_rec.id, 'Midnight Auto-Reconciliation');
    v_completed_count := v_completed_count + 1;
  END LOOP;

  -- 2. Delete stale un-worked test records (STRICTLY PROTECTS PAUSED / ON-HOLD VEHICLES)
  WITH deleted AS (
    DELETE FROM vehicles
    WHERE is_finished = FALSE
      AND current_zone != 'inspection'
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND is_paused = FALSE            -- 🛡️ NEVER TOUCH PAUSED CARS
      AND status != 'on_hold'          -- 🛡️ NEVER TOUCH MAJOR REPAIRS
      AND intake_at < v_start_of_today
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_count FROM deleted;

  RETURN jsonb_build_object('completed_count', v_completed_count, 'deleted_count', v_deleted_count, 'branch_id', p_branch_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7.6 Aggregated Service Report KPIs (Multi-Tenant + Excludes Additional Repairs from Benchmark)
CREATE OR REPLACE FUNCTION get_service_report_kpis(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_status TEXT DEFAULT 'all',
  p_branch_id VARCHAR(50) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH filtered_vehicles AS (
    SELECT 
      v.id,
      v.is_finished,
      v.current_zone,
      v.is_booking,
      v.has_additional_repairs,
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
      )
  ),
  counts AS (
    SELECT
      COUNT(*)::INT AS total,
      COUNT(*) FILTER (WHERE is_finished = TRUE OR current_zone = 'inspection')::INT AS completed,
      COUNT(*) FILTER (WHERE is_finished = FALSE AND current_zone != 'inspection')::INT AS in_progress,
      COUNT(*) FILTER (WHERE is_booking = TRUE)::INT AS bookings,
      COUNT(*) FILTER (WHERE has_additional_repairs = TRUE)::INT AS extra_repairs
    FROM filtered_vehicles
  ),
  bay_logs AS (
    SELECT
      sl.to_zone,
      COUNT(DISTINCT sl.vehicle_id)::INT AS vehicle_count,
      COALESCE(SUM(sl.active_seconds), 0)::INT AS active_sec,
      COALESCE(SUM(sl.idle_seconds), 0)::INT AS idle_sec,
      COALESCE(SUM(sl.duration_seconds), 0)::INT AS stage_sec
    FROM stage_logs sl
    INNER JOIN filtered_vehicles fv ON fv.id = sl.vehicle_id
    WHERE sl.exited_at IS NOT NULL
      AND fv.has_additional_repairs = FALSE  -- Strictly exclude additional repairs from benchmark average stay time
      AND sl.to_zone IN ('workshop', 'alignment', 'hoist')
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
    'bookingCount', COALESCE(c.bookings, 0),
    'additionalRepairsCount', COALESCE(c.extra_repairs, 0),
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
    'bookingCount', 0,
    'additionalRepairsCount', 0,
    'workshopBay', jsonb_build_object('zone', 'workshop', 'name', 'General Service', 'vehicleCount', 0, 'totalActiveSec', 0, 'avgActiveSec', 0, 'totalIdleSec', 0, 'avgIdleSec', 0, 'totalStageSec', 0, 'avgStageSec', 0),
    'alignmentBay', jsonb_build_object('zone', 'alignment', 'name', 'Wheel Alignment', 'vehicleCount', 0, 'totalActiveSec', 0, 'avgActiveSec', 0, 'totalIdleSec', 0, 'avgIdleSec', 0, 'totalStageSec', 0, 'avgStageSec', 0),
    'hoistBay', jsonb_build_object('zone', 'hoist', 'name', 'Hoist Service', 'vehicleCount', 0, 'totalActiveSec', 0, 'avgActiveSec', 0, 'totalIdleSec', 0, 'avgIdleSec', 0, 'totalStageSec', 0, 'avgStageSec', 0)
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. RESET ALL FOREMEN PASSWORDS
-- Standard secure password for foremen: 'UMForeman@2026'
UPDATE auth.users
SET encrypted_password = crypt('UMForeman@2026', gen_salt('bf')),
    updated_at = NOW()
WHERE email IN (
  'foreman.car@unitedmotors.com',
  'foreman.suv@unitedmotors.com',
  'foreman.lcv@unitedmotors.com',
  'foreman.hoist@unitedmotors.com',
  'foreman.alignment@unitedmotors.com'
);
