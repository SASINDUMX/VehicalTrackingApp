-- ==============================================================================
-- UNITED MOTORS VEHICLE TRACKING APP - FULL SUPABASE DATABASE SCHEMA
-- Execute this complete script directly in your Supabase SQL Editor (https://supabase.com)
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. DROP EXISTING TABLES IF RE-RUNNING
DROP TABLE IF EXISTS stage_logs CASCADE;
DROP TABLE IF EXISTS vehicle_tasks CASCADE;
DROP TABLE IF EXISTS vehicles CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;

-- 2. CREATE ENUM TYPES
DROP TYPE IF EXISTS bay_zone CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS task_type CASCADE;

CREATE TYPE bay_zone AS ENUM ('workshop', 'hoist', 'alignment', 'inspection', 'completed');
CREATE TYPE user_role AS ENUM ('supervisor', 'tech_workshop', 'tech_hoist', 'tech_alignment', 'advisor');
CREATE TYPE task_type AS ENUM ('general_service', 'hoist_service', 'wheel_alignment');

-- 3. CREATE VEHICLES TABLE
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_no VARCHAR(50) NOT NULL,
  current_zone bay_zone NOT NULL DEFAULT 'workshop',
  assigned_tech VARCHAR(100) DEFAULT 'Unassigned',
  remarks TEXT,
  intake_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  is_finished BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. CREATE VEHICLE TASKS CHECKLIST TABLE
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

-- 5. CREATE STAGE DURATION & LOCATION AUDIT LOGS TABLE
CREATE TABLE stage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  from_zone bay_zone,
  to_zone bay_zone NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exited_at TIMESTAMPTZ,
  duration_seconds INT DEFAULT 0,
  moved_by VARCHAR(100)
);

-- 6. CREATE USER PROFILES TABLE (linked to Supabase Auth)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name VARCHAR(100) NOT NULL,
  role user_role NOT NULL DEFAULT 'tech_workshop',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. ENABLE REALTIME SUBSCRIPTIONS
ALTER PUBLICATION supabase_realtime ADD TABLE vehicles;
ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE stage_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE user_profiles;

-- 8. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public full access to vehicles" ON vehicles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access to vehicle_tasks" ON vehicle_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access to stage_logs" ON stage_logs FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Users can read all profiles" ON user_profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Allow profile insertion on sign up" ON user_profiles FOR INSERT WITH CHECK (true);

-- 9. INITIAL SAMPLE DATA
WITH new_vehicle AS (
  INSERT INTO vehicles (vehicle_no, current_zone, assigned_tech, remarks, intake_at)
  VALUES ('WP-CAB-9842', 'workshop', 'Tech 1 (Workshop)', 'Customer reported brake squeak and standard 10k service', NOW() - INTERVAL '45 minutes')
  RETURNING id
)
INSERT INTO vehicle_tasks (vehicle_id, task_name, task_type, is_required, is_completed)
SELECT 
  id, 
  t.name, 
  t.type::task_type, 
  true, 
  false
FROM new_vehicle, (VALUES 
  ('General Service', 'general_service'),
  ('Hoist Service', 'hoist_service'),
  ('Wheel Alignment', 'wheel_alignment')
) AS t(name, type);
