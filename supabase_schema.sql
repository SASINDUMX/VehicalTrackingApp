-- ==============================================================================
-- UNITED MOTORS VEHICLE TRACKING APP - FRESH PRODUCTION DATABASE SCHEMA
-- ==============================================================================
-- Description:
-- Complete, self-contained SQL deployment script for a pristine Supabase setup.
-- Includes:
-- 1. PostgreSQL Extensions (uuid-ossp, pg_cron)
-- 2. Custom Enum Types
-- 3. Normalized Operational Tables with ON DELETE CASCADE constraints
-- 4. High-Performance Filter & Sort Indexes (covering live floor, reports, & realtime)
-- 5. Realtime Publication Setup (REPLICA IDENTITY FULL)
-- 6. Row-Level Security (RLS) Policies
-- 7. Atomic Server-Side RPC Functions (Intake, Start Work, Transfer, Handover, KPIs)
-- 8. Autonomous pg_cron Background Maintenance Schedules (Midnight Reset, 90-day Purge)
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. CLEANUP DATA TABLES (FOR FRESH START)
DROP TABLE IF EXISTS stage_logs CASCADE;
DROP TABLE IF EXISTS vehicle_tasks CASCADE;
DROP TABLE IF EXISTS vehicles CASCADE;
-- Note: user_profiles is preserved if already existing to retain login accounts

-- 3. ENUM TYPES
DO $$ BEGIN
  CREATE TYPE bay_zone AS ENUM ('workshop', 'hoist', 'alignment', 'inspection', 'completed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'service_executive',
    'agm',
    'job_controller',
    'workshop_manager',
    'foreman',
    'advisor'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Ensure existing user_role ENUMs on upgraded databases have all 6 official roles
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'service_executive';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'agm';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'job_controller';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'workshop_manager';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'foreman';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'advisor';

DO $$ BEGIN
  CREATE TYPE task_type AS ENUM ('general_service', 'hoist_service', 'wheel_alignment');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 4. OPERATIONAL TABLES

-- 4.1 Vehicles Table
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_no VARCHAR(50) NOT NULL,
  current_zone bay_zone NOT NULL DEFAULT 'workshop',
  assigned_tech VARCHAR(100) DEFAULT 'Unassigned',
  remarks TEXT,
  intake_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  effective_completed_at TIMESTAMPTZ,
  is_finished BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'incomplete')),
  is_urgent BOOLEAN NOT NULL DEFAULT FALSE,
  urgent_note TEXT,
  branch_id VARCHAR(50) NOT NULL DEFAULT 'main_workshop',
  gross_tat_seconds INT DEFAULT 0,
  net_tat_seconds INT DEFAULT 0,
  total_break_seconds INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.2 Vehicle Tasks Table
CREATE TABLE vehicle_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  task_name VARCHAR(100) NOT NULL,
  task_type task_type NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  completed_by VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.3 Stage Logs Table (Idle & Active Stage Telemetry)
CREATE TABLE stage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  from_zone bay_zone,
  to_zone bay_zone NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  work_started_at TIMESTAMPTZ,
  exited_at TIMESTAMPTZ,
  duration_seconds INT DEFAULT 0,
  idle_seconds INT NOT NULL DEFAULT 0,
  branch_id VARCHAR(50) NOT NULL DEFAULT 'main_workshop',
  moved_by VARCHAR(100)
);

-- 4.4 User Profiles Table (Linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name VARCHAR(100) NOT NULL,
  role user_role NOT NULL DEFAULT 'foreman',
  section VARCHAR(50),
  branch_id VARCHAR(50) NOT NULL DEFAULT 'main_workshop',
  theme_preference VARCHAR(20) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure user_profiles has columns if table existed
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS section VARCHAR(50);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(20) NOT NULL DEFAULT 'system';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS branch_id VARCHAR(50) NOT NULL DEFAULT 'main_workshop';

-- 5. REPLICA IDENTITY FULL (Ensures Realtime broadcasts complete record on updates/deletions)
ALTER TABLE vehicles REPLICA IDENTITY FULL;
ALTER TABLE vehicle_tasks REPLICA IDENTITY FULL;
ALTER TABLE stage_logs REPLICA IDENTITY FULL;
ALTER TABLE user_profiles REPLICA IDENTITY FULL;

-- 6. ENABLE REALTIME SUBSCRIPTIONS
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE vehicles;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_tasks;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE stage_logs;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE user_profiles;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 7. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public full access to vehicles" ON vehicles;
CREATE POLICY "Allow public full access to vehicles" ON vehicles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public full access to vehicle_tasks" ON vehicle_tasks;
CREATE POLICY "Allow public full access to vehicle_tasks" ON vehicle_tasks FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public full access to stage_logs" ON stage_logs;
CREATE POLICY "Allow public full access to stage_logs" ON stage_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can read all profiles" ON user_profiles;
CREATE POLICY "Users can read all profiles" ON user_profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Allow profile insertion on sign up" ON user_profiles;
CREATE POLICY "Allow profile insertion on sign up" ON user_profiles FOR INSERT WITH CHECK (true);

-- 8. HIGH-PERFORMANCE SPECIALIZED INDEXES
-- Enforce unique active license plates at the database engine level
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_unique_active_plate ON vehicles (UPPER(TRIM(vehicle_no))) WHERE is_finished = FALSE;

-- Active floor fast-lookup indexes
CREATE INDEX IF NOT EXISTS idx_vehicles_active_floor ON vehicles(current_zone, is_urgent DESC, created_at ASC) WHERE is_finished = FALSE;
CREATE INDEX IF NOT EXISTS idx_vehicles_live_48h ON vehicles(is_finished, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicles_branch_finished ON vehicles(branch_id, is_finished);
CREATE INDEX IF NOT EXISTS idx_vehicles_intake_at ON vehicles(intake_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicles_effective_completed ON vehicles(effective_completed_at) WHERE effective_completed_at IS NOT NULL;

-- Child foreign keys and relational join indexes
CREATE INDEX IF NOT EXISTS idx_vehicle_tasks_vehicle_id ON vehicle_tasks(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_tasks_required ON vehicle_tasks(vehicle_id, is_required);
CREATE INDEX IF NOT EXISTS idx_stage_logs_vehicle_id ON stage_logs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_stage_logs_active ON stage_logs(vehicle_id) WHERE exited_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stage_logs_kpi_query ON stage_logs(to_zone, exited_at) WHERE exited_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stage_logs_vehicle_entered ON stage_logs(vehicle_id, entered_at ASC);


-- ==============================================================================
-- 9. ATOMIC STORED PROCEDURES (RPCs)
-- ==============================================================================

-- Drop existing functions to allow signature/return type modifications cleanly
DROP FUNCTION IF EXISTS intake_vehicle(TEXT, bay_zone, TEXT, TEXT, BOOLEAN, TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS start_stage_work(UUID, TEXT);
DROP FUNCTION IF EXISTS transfer_vehicle_zone(UUID, bay_zone, TEXT);
DROP FUNCTION IF EXISTS finish_vehicle_job(UUID, TEXT);
DROP FUNCTION IF EXISTS toggle_task_completion(UUID, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS get_service_report_kpis(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT);
DROP FUNCTION IF EXISTS reconcile_daily_vehicles(TEXT);
DROP FUNCTION IF EXISTS purge_records_older_than_90_days();

-- 9.1 INTAKE NEW VEHICLE
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
  IF v_clean_no = '' THEN
    RAISE EXCEPTION 'Vehicle plate number cannot be empty';
  END IF;

  -- Insert vehicle
  INSERT INTO vehicles (
    vehicle_no, current_zone, assigned_tech, remarks,
    intake_at, status, is_urgent, urgent_note, branch_id, is_finished
  ) VALUES (
    v_clean_no, p_target_zone, COALESCE(NULLIF(p_assigned_tech, ''), 'Unassigned'),
    COALESCE(p_remarks, ''), v_now, 'active', p_is_urgent,
    CASE WHEN p_is_urgent THEN NULLIF(TRIM(p_urgent_note), '') ELSE NULL END,
    COALESCE(p_branch_id, 'main_workshop'), FALSE
  ) RETURNING id INTO v_new_vehicle_id;

  -- Insert initial stage log
  INSERT INTO stage_logs (
    vehicle_id, from_zone, to_zone, entered_at,
    work_started_at, idle_seconds, duration_seconds, moved_by, branch_id
  ) VALUES (
    v_new_vehicle_id, NULL, p_target_zone, v_now,
    NULL, 0, 0, 'Job Supervisor', COALESCE(p_branch_id, 'main_workshop')
  ) RETURNING id INTO v_new_log_id;

  -- Insert tasks matrix
  IF p_tasks IS NOT NULL AND jsonb_array_length(p_tasks) > 0 THEN
    FOR v_task IN SELECT * FROM jsonb_array_elements(p_tasks)
    LOOP
      INSERT INTO vehicle_tasks (
        vehicle_id, task_name, task_type, is_required, is_completed
      ) VALUES (
        v_new_vehicle_id,
        (v_task->>'task_name')::TEXT,
        (v_task->>'task_type')::task_type,
        COALESCE((v_task->>'is_required')::BOOLEAN, TRUE),
        FALSE
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'vehicle_id', v_new_vehicle_id,
    'log_id', v_new_log_id,
    'vehicle_no', v_clean_no,
    'created_at', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 9.2 START STAGE WORK (IDLE TO ACTIVE TRANSITION)
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

  IF p_tech_name IS NOT NULL AND p_tech_name != '' THEN
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


-- 9.3 TRANSFER VEHICLE ZONE (BAY TO BAY DISPATCH)
-- Canonical turnaround freeze: stamps effective_completed_at when entering 'inspection'
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
    'effective_completed_at', v_effective_completed
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 9.4 FINISH VEHICLE JOB SHEET (ADVISOR HANDOVER)
-- Preserves canonical effective_completed_at
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

  INSERT INTO stage_logs (
    vehicle_id, from_zone, to_zone, entered_at, exited_at,
    duration_seconds, idle_seconds, moved_by
  ) VALUES (
    p_vehicle_id, 'inspection', 'completed', v_now, v_now,
    0, 0, COALESCE(p_advisor_name, 'Service Advisor')
  );

  SELECT effective_completed_at INTO v_existing_effective FROM vehicles WHERE id = p_vehicle_id;
  IF v_existing_effective IS NULL THEN
    v_existing_effective := COALESCE(v_entered_at, v_now);
  END IF;

  UPDATE vehicles
  SET current_zone = 'completed',
      is_finished = TRUE,
      completed_at = v_now,
      effective_completed_at = v_existing_effective
  WHERE id = p_vehicle_id;

  RETURN jsonb_build_object(
    'success', true,
    'completed_at', v_now,
    'effective_completed_at', v_existing_effective
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 9.5 TOGGLE TASK COMPLETION
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


-- 9.6 HIGH-SPEED SERVER-SIDE KPI AGGREGATION
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
            (sl.to_zone = 'workshop' AND vt.task_type IN ('general_service', 'workshop'))
            OR (sl.to_zone = 'alignment' AND vt.task_type IN ('wheel_alignment', 'alignment'))
            OR (sl.to_zone = 'hoist' AND vt.task_type IN ('hoist_service', 'hoist'))
          )
      )
    GROUP BY sl.to_zone
  )
  SELECT total, completed, in_progress INTO v_total_vehicles, v_completed_count, v_in_progress_count FROM counts;

  SELECT vehicle_count, active_sec, idle_sec, stage_sec
  INTO v_ws_count, v_ws_active, v_ws_idle, v_ws_stage
  FROM bay_logs WHERE to_zone = 'workshop';

  SELECT vehicle_count, active_sec, idle_sec, stage_sec
  INTO v_al_count, v_al_active, v_al_idle, v_al_stage
  FROM bay_logs WHERE to_zone = 'alignment';

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


-- 9.7 OVERNIGHT RECONCILIATION
CREATE OR REPLACE FUNCTION reconcile_daily_vehicles(
  p_branch_id TEXT DEFAULT 'main_workshop'
)
RETURNS JSONB AS $$
DECLARE
  v_completed_count INT := 0;
  v_deleted_count INT := 0;
  v_start_of_today TIMESTAMPTZ;
BEGIN
  v_start_of_today := (NOW() AT TIME ZONE 'Asia/Colombo')::DATE::TIMESTAMPTZ AT TIME ZONE 'Asia/Colombo';

  -- Auto-complete leftover inspection vehicles from previous days
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
        completed_at = NOW()
    WHERE is_finished = FALSE
      AND current_zone = 'inspection'
      AND intake_at < v_start_of_today
    RETURNING id
  )
  SELECT COUNT(*) INTO v_completed_count FROM finished_vehicles;

  -- Delete leftover unworked vehicles in active working bays from previous days
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


-- 9.8 90-DAY RETENTION AUTO-PURGE
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


-- ==============================================================================
-- 10. AUTONOMOUS BACKGROUND MAINTENANCE (pg_cron)
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- 1. Midnight Daily Vehicle Reconciliation (00:00 UTC / ~05:30 SLST)
    PERFORM cron.unschedule('daily-vehicle-reconciliation')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-vehicle-reconciliation');

    PERFORM cron.schedule(
      'daily-vehicle-reconciliation',
      '0 0 * * *',
      'SELECT reconcile_daily_vehicles()'
    );

    -- 2. Weekly 90-Day Retention Auto-Purge (Every Sunday at 03:00 UTC)
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
    RAISE NOTICE 'pg_cron registration note: %', SQLERRM;
END;
$$;
