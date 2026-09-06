-- ==============================================================================
-- UNITED MOTORS VEHICLE TRACKING APP - PRISTINE PRODUCTION DATABASE SCHEMA
-- ==============================================================================
-- Single self-contained SQL deployment script for a 100% clean Supabase setup.
-- Includes:
-- 1. PostgreSQL Extensions (uuid-ossp, pgcrypto, pg_cron)
-- 2. Custom Enum Types (bay_zone, user_role, task_type)
-- 3. Normalized Operational Tables with CASCADE constraints & Pause Support
-- 4. High-Performance Filter & Sort Indexes (Live Floor, Reports, Realtime CDC)
-- 5. Realtime Publication Setup (REPLICA IDENTITY FULL)
-- 6. Row-Level Security (RLS) Policies
-- 7. Atomic Server-Side RPC Functions (Intake, Work, Transfer, Handover, KPIs)
-- 8. Autonomous pg_cron Background Maintenance Schedules
-- 9. Complete 15 Pre-configured Organizational User Accounts
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ------------------------------------------------------------------------------
-- 2. CLEANUP PREVIOUS TABLES (FRESH START)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS stage_logs CASCADE;
DROP TABLE IF EXISTS vehicle_tasks CASCADE;
DROP TABLE IF EXISTS vehicles CASCADE;
-- user_profiles is preserved if existing to retain custom auth accounts, or created fresh below

-- ------------------------------------------------------------------------------
-- 3. ENUM TYPES
-- ------------------------------------------------------------------------------
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

-- Guarantee all 6 official roles exist on existing ENUMs
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'service_executive';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'agm';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'job_controller';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'workshop_manager';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'foreman';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'advisor';

DO $$ BEGIN
  CREATE TYPE task_type AS ENUM ('general_service', 'hoist_service', 'wheel_alignment');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ------------------------------------------------------------------------------
-- 4. OPERATIONAL TABLES
-- ------------------------------------------------------------------------------

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
  is_paused BOOLEAN NOT NULL DEFAULT FALSE,
  paused_at TIMESTAMPTZ,
  paused_seconds INT DEFAULT 0,
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

-- 4.3 Stage Logs Table (Audit-Grade Stage Telemetry)
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
  break_seconds INT NOT NULL DEFAULT 0,
  branch_id VARCHAR(50) NOT NULL DEFAULT 'main_workshop',
  moved_by VARCHAR(100),
  is_paused BOOLEAN NOT NULL DEFAULT FALSE,
  paused_at TIMESTAMPTZ,
  paused_seconds INT DEFAULT 0
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

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS section VARCHAR(50);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(20) NOT NULL DEFAULT 'system';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS branch_id VARCHAR(50) NOT NULL DEFAULT 'main_workshop';

-- ------------------------------------------------------------------------------
-- 5. REPLICA IDENTITY FULL (Realtime WebSocket Broadcast Optimization)
-- ------------------------------------------------------------------------------
ALTER TABLE vehicles REPLICA IDENTITY FULL;
ALTER TABLE vehicle_tasks REPLICA IDENTITY FULL;
ALTER TABLE stage_logs REPLICA IDENTITY FULL;
ALTER TABLE user_profiles REPLICA IDENTITY FULL;

-- ------------------------------------------------------------------------------
-- 6. ENABLE REALTIME SUBSCRIPTIONS
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 8. HIGH-PERFORMANCE SPECIALIZED INDEXES
-- ------------------------------------------------------------------------------
-- Database-level uniqueness for active vehicles (prevents double intake)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_unique_active_plate 
  ON vehicles (UPPER(TRIM(vehicle_no))) 
  WHERE is_finished = FALSE;

-- Fast spatial floor retrieval
CREATE INDEX IF NOT EXISTS idx_vehicles_active_floor 
  ON vehicles(current_zone, is_urgent DESC, created_at ASC) 
  WHERE is_finished = FALSE;

CREATE INDEX IF NOT EXISTS idx_vehicles_live_48h 
  ON vehicles(is_finished, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicles_branch_finished 
  ON vehicles(branch_id, is_finished);

CREATE INDEX IF NOT EXISTS idx_vehicles_intake_at 
  ON vehicles(intake_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicles_effective_completed 
  ON vehicles(effective_completed_at) 
  WHERE effective_completed_at IS NOT NULL;

-- Child foreign keys and relational join indexes
CREATE INDEX IF NOT EXISTS idx_vehicle_tasks_vehicle_id 
  ON vehicle_tasks(vehicle_id);

CREATE INDEX IF NOT EXISTS idx_vehicle_tasks_required 
  ON vehicle_tasks(vehicle_id, is_required);

CREATE INDEX IF NOT EXISTS idx_stage_logs_vehicle_id 
  ON stage_logs(vehicle_id);

CREATE INDEX IF NOT EXISTS idx_stage_logs_active 
  ON stage_logs(vehicle_id) 
  WHERE exited_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stage_logs_kpi_query 
  ON stage_logs(to_zone, exited_at) 
  WHERE exited_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stage_logs_vehicle_entered 
  ON stage_logs(vehicle_id, entered_at ASC);

-- ------------------------------------------------------------------------------
-- 9. ATOMIC STORED PROCEDURES (RPCs)
-- ------------------------------------------------------------------------------

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


-- 9.2B DEDUCT WORKSHOP BREAK OVERLAP (SRI LANKA WORKSHOP STANDARD)
-- Morning Tea: 09:45 - 10:00 (15m)
-- Lunch Break: 12:30 - 13:00 (30m)
-- Evening Tea: 14:45 - 15:00 (15m)
CREATE OR REPLACE FUNCTION calculate_break_overlap_seconds(
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ
)
RETURNS INT AS $$
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
$$ LANGUAGE plpgsql IMMUTABLE;


-- 9.3 TRANSFER VEHICLE ZONE (BAY TO BAY DISPATCH)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 9.4 FINISH VEHICLE JOB SHEET (ADVISOR HANDOVER)
CREATE OR REPLACE FUNCTION finish_vehicle_job(
  p_vehicle_id UUID,
  p_advisor_name TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
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
  SET current_zone = 'completed',
      is_finished = TRUE,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 9.5 TOGGLE TASK COMPLETION
CREATE OR REPLACE FUNCTION toggle_task_completion(
  p_task_id UUID,
  p_is_completed BOOLEAN
)
RETURNS JSONB AS $$
DECLARE
  v_new_state BOOLEAN;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  UPDATE vehicle_tasks
  SET is_completed = p_is_completed,
      completed_at = CASE WHEN p_is_completed THEN v_now ELSE NULL END
  WHERE id = p_task_id
  RETURNING is_completed INTO v_new_state;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'is_completed', v_new_state,
    'completed_at', CASE WHEN v_new_state THEN v_now ELSE NULL END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 9.6 HIGH-SPEED SERVER-SIDE KPI AGGREGATION (AUDIT-GRADE STRICT STANDARD)
CREATE OR REPLACE FUNCTION get_service_report_kpis(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_branch_id TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'all'
)
RETURNS JSONB AS $$
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


-- ------------------------------------------------------------------------------
-- 10. AUTONOMOUS BACKGROUND MAINTENANCE (pg_cron)
-- ------------------------------------------------------------------------------
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


-- ------------------------------------------------------------------------------
-- 11. COMPLETE ORGANIZATIONAL USER SEED (15 ACCOUNTS)
-- ------------------------------------------------------------------------------
-- Creates or updates all 15 operational login accounts in auth.users and user_profiles
DO $seed$
DECLARE
  account RECORD;
  v_user_id UUID;
  accounts_data JSONB := '[
    {"email": "executive@unitedmotors.com", "password": "Exec@123", "role": "service_executive", "section": null, "name": "Service Executive"},
    {"email": "agm@unitedmotors.com", "password": "Agm@123", "role": "agm", "section": null, "name": "Assistant General Manager"},
    {"email": "controller@unitedmotors.com", "password": "Controller@123", "role": "job_controller", "section": null, "name": "Job Controller"},
    {"email": "manager@unitedmotors.com", "password": "Manager@123", "role": "workshop_manager", "section": null, "name": "Workshop Manager"},
    {"email": "foreman.car@unitedmotors.com", "password": "Foreman@123", "role": "foreman", "section": "car", "name": "Foreman (CAR)"},
    {"email": "foreman.suv@unitedmotors.com", "password": "Foreman@123", "role": "foreman", "section": "suv", "name": "Foreman (SUV)"},
    {"email": "foreman.lcv@unitedmotors.com", "password": "Foreman@123", "role": "foreman", "section": "lcv", "name": "Foreman (LCV)"},
    {"email": "foreman.hoist@unitedmotors.com", "password": "Foreman@123", "role": "foreman", "section": "hoist", "name": "Foreman (Hoist)"},
    {"email": "foreman.alignment@unitedmotors.com", "password": "Foreman@123", "role": "foreman", "section": "alignment", "name": "Foreman (Alignment)"},
    {"email": "advisor.car1@unitedmotors.com", "password": "Advisor@123", "role": "advisor", "section": "car", "name": "Advisor Car 1"},
    {"email": "advisor.car2@unitedmotors.com", "password": "Advisor@123", "role": "advisor", "section": "car", "name": "Advisor Car 2"},
    {"email": "advisor.suv1@unitedmotors.com", "password": "Advisor@123", "role": "advisor", "section": "suv", "name": "Advisor SUV 1"},
    {"email": "advisor.suv2@unitedmotors.com", "password": "Advisor@123", "role": "advisor", "section": "suv", "name": "Advisor SUV 2"},
    {"email": "advisor.lcv1@unitedmotors.com", "password": "Advisor@123", "role": "advisor", "section": "lcv", "name": "Advisor LCV 1"},
    {"email": "advisor.lcv2@unitedmotors.com", "password": "Advisor@123", "role": "advisor", "section": "lcv", "name": "Advisor LCV 2"}
  ]'::jsonb;
BEGIN
  FOR account IN SELECT * FROM jsonb_to_recordset(accounts_data) AS x(email TEXT, password TEXT, role TEXT, section TEXT, name TEXT)
  LOOP
    SELECT id INTO v_user_id FROM auth.users WHERE email = account.email;

    IF v_user_id IS NULL THEN
      v_user_id := gen_random_uuid();
      INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
      ) VALUES (
        v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        account.email, crypt(account.password, gen_salt('bf')),
        NOW(), '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('display_name', account.name, 'role', account.role, 'section', account.section),
        NOW(), NOW()
      );
    ELSE
      UPDATE auth.users
      SET encrypted_password = crypt(account.password, gen_salt('bf')),
          email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
          raw_user_meta_data = jsonb_build_object('display_name', account.name, 'role', account.role, 'section', account.section),
          updated_at = NOW()
      WHERE id = v_user_id;
    END IF;

    INSERT INTO public.user_profiles (
      id, display_name, role, section, branch_id, theme_preference
    ) VALUES (
      v_user_id, account.name, account.role::user_role, account.section, 'main_workshop', 'system'
    )
    ON CONFLICT (id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        role = EXCLUDED.role,
        section = EXCLUDED.section,
        branch_id = EXCLUDED.branch_id;
  END LOOP;
END;
$seed$;

-- ==============================================================================
-- END OF SCRIPT: DATABASE IS 100% PRODUCTION READY
-- ==============================================================================
