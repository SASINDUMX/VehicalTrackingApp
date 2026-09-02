-- ==============================================================================
-- UNITED MOTORS VEHICLE TRACKING APP - CLEAN PRODUCTION SCHEMA
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- This creates a fresh, pristine database with 0 vehicle clutter and 100% schema compatibility.
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. CLEANUP VEHICLE DATA TABLES (Starts 100% clean)
DROP TABLE IF EXISTS stage_logs CASCADE;
DROP TABLE IF EXISTS vehicle_tasks CASCADE;
DROP TABLE IF EXISTS vehicles CASCADE;

-- 2. CREATE ENUM TYPES IF NOT EXIST
DO $$ BEGIN
  CREATE TYPE bay_zone AS ENUM ('workshop', 'hoist', 'alignment', 'inspection', 'completed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('supervisor', 'tech_workshop', 'tech_hoist', 'tech_alignment', 'advisor');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE task_type AS ENUM ('general_service', 'hoist_service', 'wheel_alignment');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. VEHICLES TABLE
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_no VARCHAR(50) NOT NULL,
  current_zone bay_zone NOT NULL DEFAULT 'workshop',
  assigned_tech VARCHAR(100) DEFAULT 'Unassigned',
  remarks TEXT,
  intake_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  is_finished BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  is_urgent BOOLEAN NOT NULL DEFAULT FALSE,
  urgent_note TEXT,
  is_paused BOOLEAN NOT NULL DEFAULT FALSE,
  paused_at TIMESTAMPTZ,
  paused_seconds INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. VEHICLE TASKS TABLE (CASCADE DELETION GUARANTEED)
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

-- 5. STAGE LOGS TABLE (IDLE VS ACTIVE TIMERS & CASCADE DELETION)
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
  is_paused BOOLEAN NOT NULL DEFAULT FALSE,
  paused_at TIMESTAMPTZ,
  paused_seconds INT NOT NULL DEFAULT 0,
  moved_by VARCHAR(100)
);

-- 6. USER PROFILES TABLE (Linked to auth.users, preserves existing logins)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name VARCHAR(100) NOT NULL,
  role user_role NOT NULL DEFAULT 'tech_workshop',
  theme_preference VARCHAR(20) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure theme_preference exists if table already existed
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(20) NOT NULL DEFAULT 'system';

-- 7. REPLICA IDENTITY FULL (Ensures Realtime broadcast includes full deleted records)
ALTER TABLE vehicles REPLICA IDENTITY FULL;
ALTER TABLE vehicle_tasks REPLICA IDENTITY FULL;
ALTER TABLE stage_logs REPLICA IDENTITY FULL;

-- 8. ENABLE REALTIME SUBSCRIPTIONS
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

-- 9. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Vehicles Policies
DROP POLICY IF EXISTS "Allow public full access to vehicles" ON vehicles;
CREATE POLICY "Allow public full access to vehicles" ON vehicles FOR ALL USING (true) WITH CHECK (true);

-- Tasks Policies
DROP POLICY IF EXISTS "Allow public full access to vehicle_tasks" ON vehicle_tasks;
CREATE POLICY "Allow public full access to vehicle_tasks" ON vehicle_tasks FOR ALL USING (true) WITH CHECK (true);

-- Stage Logs Policies
DROP POLICY IF EXISTS "Allow public full access to stage_logs" ON stage_logs;
CREATE POLICY "Allow public full access to stage_logs" ON stage_logs FOR ALL USING (true) WITH CHECK (true);

-- User Profiles Policies
DROP POLICY IF EXISTS "Users can read all profiles" ON user_profiles;
CREATE POLICY "Users can read all profiles" ON user_profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Allow profile insertion on sign up" ON user_profiles;
CREATE POLICY "Allow profile insertion on sign up" ON user_profiles FOR INSERT WITH CHECK (true);

-- 10. HIGH-PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_created_at ON vehicles(created_at);
CREATE INDEX IF NOT EXISTS idx_vehicles_is_finished ON vehicles(is_finished);
CREATE INDEX IF NOT EXISTS idx_vehicle_tasks_vehicle_id ON vehicle_tasks(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_stage_logs_vehicle_id ON stage_logs(vehicle_id);

-- 11. 90-DAY RETENTION AUTO-CLEANUP FUNCTION
CREATE OR REPLACE FUNCTION purge_records_older_than_90_days()
RETURNS void AS $$
BEGIN
  DELETE FROM vehicles
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;
