-- ==============================================================================
-- UNITED MOTORS VEHICLE TRACKING APP — PRISTINE PRODUCTION DATABASE SCHEMA
-- ==============================================================================
-- Consolidated Idempotent Deployment Script (v1 - v12 Unified Source of Truth)
--
-- Includes:
-- 1. PostgreSQL Extensions (uuid-ossp, pgcrypto, pg_cron)
-- 2. Custom Enum Types (bay_zone, user_role, task_type)
-- 3. Multi-Branch & Workplaces Infrastructure
-- 4. User Profiles & RBAC Capabilities
-- 5. Operational Tables (vehicles, stage_logs, vehicle_tasks) with CASCADE Delete
-- 6. Legal & Compliance Immutable Audit Trail (audit_logs)
-- 7. High-Performance Partial & Composite Indexes
-- 8. Realtime CDC Setup (REPLICA IDENTITY FULL)
-- 9. Row-Level Security (RLS) & Access Control Policies
-- 10. Audit Logging Triggers (Vehicle, Task, Stage, User modifications)
-- 11. Atomic Server-Side RPC Functions (Intake, Work, Transfer, Handover, KPIs, Reports)
-- 12. Autonomous pg_cron Background Maintenance Schedules
-- 13. Baseline Workplaces & Seed User Profiles
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ------------------------------------------------------------------------------
-- 2. ENUM TYPES
-- ------------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE bay_zone AS ENUM ('workshop', 'hoist', 'alignment', 'inspection', 'completed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'super_admin',
    'service_executive',
    'agm',
    'job_controller',
    'workshop_manager',
    'foreman',
    'advisor'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Guarantee all roles exist on existing ENUMs
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
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
-- 3. WORKPLACES & MULTI-BRANCH STRUCTURE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workplaces (
  id VARCHAR(50) PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  city VARCHAR(255) NOT NULL DEFAULT 'Colombo',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backward-compatibility column assertions for pre-existing tables
ALTER TABLE public.workplaces ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE public.workplaces ADD COLUMN IF NOT EXISTS city VARCHAR(255) DEFAULT 'Colombo';
ALTER TABLE public.workplaces ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Avoid UNIQUE(code) conflicts with legacy Peliyagoda codes if present
UPDATE public.workplaces
SET code = 'OLD_' || code
WHERE id IN ('peliyagoda_sec5', 'peliyagoda_sec2') AND code NOT LIKE 'OLD_%';

-- Seed baseline branches
INSERT INTO public.workplaces (id, code, name, city, is_active)
VALUES 
  ('orugodawatta_sec5', 'SEC5', 'United Motors — Section 5 (Main)', 'Orugodawatta, Colombo', TRUE),
  ('kandy', 'KDY', 'United Motors — Kandy Branch', 'Kandy', TRUE),
  ('galle', 'GLE', 'United Motors — Galle Branch', 'Galle', TRUE),
  ('kurunegala', 'KRG', 'United Motors — Kurunegala Branch', 'Kurunegala', TRUE)
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name, code = EXCLUDED.code, city = EXCLUDED.city, is_active = EXCLUDED.is_active;

-- ------------------------------------------------------------------------------
-- 4. USER PROFILES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255),
  display_name VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'service_executive',
  section VARCHAR(50), -- 'car', 'suv', 'lcv', 'hoist', 'alignment'
  branch_id VARCHAR(50) NOT NULL DEFAULT 'orugodawatta_sec5' REFERENCES public.workplaces(id),
  theme_preference VARCHAR(20) DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backward-compatibility column assertions for pre-existing user_profiles
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) DEFAULT 'Staff';
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'service_executive';
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS section VARCHAR(50);
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS branch_id VARCHAR(50) DEFAULT 'orugodawatta_sec5';
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(20) DEFAULT 'system';

-- ------------------------------------------------------------------------------
-- 5. OPERATIONAL TABLES (VEHICLES, STAGE LOGS, TASKS)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_no VARCHAR(50) NOT NULL,
  current_zone bay_zone NOT NULL DEFAULT 'workshop',
  technician_name VARCHAR(255),
  assigned_tech VARCHAR(255) NOT NULL DEFAULT 'Unassigned',
  remarks TEXT DEFAULT '',
  is_booking BOOLEAN NOT NULL DEFAULT FALSE,
  has_additional_repairs BOOLEAN NOT NULL DEFAULT FALSE,
  intake_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  effective_completed_at TIMESTAMPTZ,
  is_finished BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'incomplete', 'on_hold')),
  is_urgent BOOLEAN NOT NULL DEFAULT FALSE,
  urgent_note TEXT,
  is_paused BOOLEAN NOT NULL DEFAULT FALSE,
  paused_at TIMESTAMPTZ,
  paused_seconds INT NOT NULL DEFAULT 0,
  pause_reason TEXT,
  branch_id VARCHAR(50) NOT NULL DEFAULT 'orugodawatta_sec5' REFERENCES public.workplaces(id) ON DELETE RESTRICT,
  gross_tat_seconds INT NOT NULL DEFAULT 0,
  net_tat_seconds INT NOT NULL DEFAULT 0,
  total_break_seconds INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backward-compatibility column assertions for pre-existing vehicles
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS technician_name VARCHAR(255);
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS assigned_tech VARCHAR(255) DEFAULT 'Unassigned';
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS remarks TEXT DEFAULT '';
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS is_booking BOOLEAN DEFAULT FALSE;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS has_additional_repairs BOOLEAN DEFAULT FALSE;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS intake_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS effective_completed_at TIMESTAMPTZ;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS is_finished BOOLEAN DEFAULT FALSE;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN DEFAULT FALSE;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS urgent_note TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS paused_seconds INT DEFAULT 0;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS pause_reason TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS branch_id VARCHAR(50) DEFAULT 'orugodawatta_sec5';
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS gross_tat_seconds INT DEFAULT 0;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS net_tat_seconds INT DEFAULT 0;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS total_break_seconds INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.stage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  from_zone bay_zone,
  to_zone bay_zone NOT NULL,
  visit_number INT NOT NULL DEFAULT 1,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  work_started_at TIMESTAMPTZ,
  work_completed_at TIMESTAMPTZ,
  exited_at TIMESTAMPTZ,
  duration_seconds INT NOT NULL DEFAULT 0,
  active_seconds INT NOT NULL DEFAULT 0,
  idle_seconds INT NOT NULL DEFAULT 0,
  break_seconds INT NOT NULL DEFAULT 0,
  moved_by VARCHAR(255) DEFAULT 'Staff',
  technician_name VARCHAR(255),
  stage_remarks TEXT,
  is_paused BOOLEAN NOT NULL DEFAULT FALSE,
  paused_at TIMESTAMPTZ,
  paused_seconds INT NOT NULL DEFAULT 0,
  is_dispatched BOOLEAN NOT NULL DEFAULT FALSE,
  branch_id VARCHAR(50) NOT NULL DEFAULT 'orugodawatta_sec5' REFERENCES public.workplaces(id) ON DELETE CASCADE
);

-- Backward-compatibility column assertions for pre-existing stage_logs
ALTER TABLE public.stage_logs ADD COLUMN IF NOT EXISTS from_zone bay_zone;
ALTER TABLE public.stage_logs ADD COLUMN IF NOT EXISTS to_zone bay_zone;
ALTER TABLE public.stage_logs ADD COLUMN IF NOT EXISTS visit_number INT DEFAULT 1;
ALTER TABLE public.stage_logs ADD COLUMN IF NOT EXISTS entered_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.stage_logs ADD COLUMN IF NOT EXISTS work_started_at TIMESTAMPTZ;
ALTER TABLE public.stage_logs ADD COLUMN IF NOT EXISTS work_completed_at TIMESTAMPTZ;
ALTER TABLE public.stage_logs ADD COLUMN IF NOT EXISTS exited_at TIMESTAMPTZ;
ALTER TABLE public.stage_logs ADD COLUMN IF NOT EXISTS duration_seconds INT DEFAULT 0;
ALTER TABLE public.stage_logs ADD COLUMN IF NOT EXISTS active_seconds INT DEFAULT 0;
ALTER TABLE public.stage_logs ADD COLUMN IF NOT EXISTS idle_seconds INT DEFAULT 0;
ALTER TABLE public.stage_logs ADD COLUMN IF NOT EXISTS break_seconds INT DEFAULT 0;
ALTER TABLE public.stage_logs ADD COLUMN IF NOT EXISTS moved_by VARCHAR(255) DEFAULT 'Staff';
ALTER TABLE public.stage_logs ADD COLUMN IF NOT EXISTS technician_name VARCHAR(255);
ALTER TABLE public.stage_logs ADD COLUMN IF NOT EXISTS stage_remarks TEXT;
ALTER TABLE public.stage_logs ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE;
ALTER TABLE public.stage_logs ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE public.stage_logs ADD COLUMN IF NOT EXISTS paused_seconds INT DEFAULT 0;
ALTER TABLE public.stage_logs ADD COLUMN IF NOT EXISTS is_dispatched BOOLEAN DEFAULT FALSE;
ALTER TABLE public.stage_logs ADD COLUMN IF NOT EXISTS branch_id VARCHAR(50) DEFAULT 'orugodawatta_sec5';

CREATE TABLE IF NOT EXISTS public.vehicle_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  task_name VARCHAR(255) NOT NULL,
  task_type task_type NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  completed_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backward-compatibility column assertions for pre-existing vehicle_tasks
ALTER TABLE public.vehicle_tasks ADD COLUMN IF NOT EXISTS task_name VARCHAR(255);
ALTER TABLE public.vehicle_tasks ADD COLUMN IF NOT EXISTS task_type task_type;
ALTER TABLE public.vehicle_tasks ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT TRUE;
ALTER TABLE public.vehicle_tasks ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE public.vehicle_tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.vehicle_tasks ADD COLUMN IF NOT EXISTS completed_by VARCHAR(255);

-- ------------------------------------------------------------------------------
-- 6. IMMUTABLE ADMINISTRATIVE AUDIT LOG
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action_timestamp TIMESTAMPTZ DEFAULT NOW(),
  branch_id VARCHAR(50) NOT NULL DEFAULT 'orugodawatta_sec5' REFERENCES public.workplaces(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL DEFAULT 'vehicle',
  entity_id UUID NOT NULL,
  vehicle_no VARCHAR(50),
  action VARCHAR(50) NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email VARCHAR(255),
  actor_name VARCHAR(255),
  actor_role VARCHAR(50),
  changed_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  old_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Backward-compatibility column assertions for pre-existing audit_logs
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action_timestamp TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS branch_id VARCHAR(50) DEFAULT 'orugodawatta_sec5';
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50) DEFAULT 'vehicle';
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS vehicle_no VARCHAR(50);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action VARCHAR(50);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_id UUID;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_email VARCHAR(255);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_name VARCHAR(255);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_role VARCHAR(50);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS changed_fields JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS old_values JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS new_values JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- ------------------------------------------------------------------------------
-- 7. PERFORMANCE & INTEGRITY INDEXES
-- ------------------------------------------------------------------------------
-- Partial Unique Index: Zero duplicate active vehicles per plate
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_unique_active_plate 
ON public.vehicles (UPPER(TRIM(vehicle_no))) 
WHERE is_finished = FALSE;

-- High-speed query & filter indexes
CREATE INDEX IF NOT EXISTS idx_vehicles_branch_finished ON public.vehicles(branch_id, is_finished);
CREATE INDEX IF NOT EXISTS idx_vehicles_created_at ON public.vehicles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicles_intake_at ON public.vehicles(intake_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON public.vehicles(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_current_zone ON public.vehicles(current_zone);

CREATE INDEX IF NOT EXISTS idx_stage_logs_vehicle_id ON public.stage_logs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_stage_logs_entered_at ON public.stage_logs(entered_at);
CREATE INDEX IF NOT EXISTS idx_stage_logs_branch_id ON public.stage_logs(branch_id);

CREATE INDEX IF NOT EXISTS idx_vehicle_tasks_vehicle_id ON public.vehicle_tasks(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_tasks_task_type ON public.vehicle_tasks(task_type);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_timestamp ON public.audit_logs(action_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_id ON public.audit_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_vehicle_no ON public.audit_logs(vehicle_no);

-- ------------------------------------------------------------------------------
-- 8. REALTIME REPLICATION & REPLICA IDENTITY
-- ------------------------------------------------------------------------------
ALTER TABLE public.vehicles REPLICA IDENTITY FULL;
ALTER TABLE public.stage_logs REPLICA IDENTITY FULL;
ALTER TABLE public.vehicle_tasks REPLICA IDENTITY FULL;
ALTER TABLE public.audit_logs REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicles;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.stage_logs;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicle_tasks;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
EXCEPTION WHEN OTHERS THEN null; END $$;

-- ------------------------------------------------------------------------------
-- 9. AUDIT LOG IMMUTABILITY TRIGGER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_audit_log_tampering()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Security Policy: Audit logs are legally immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_tampering();

-- ------------------------------------------------------------------------------
-- 10. ROW-LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.workplaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Workplaces
DROP POLICY IF EXISTS "workplaces_read_all" ON public.workplaces;
CREATE POLICY "workplaces_read_all" ON public.workplaces FOR SELECT USING (true);

-- User Profiles
DROP POLICY IF EXISTS "user_profiles_read_all" ON public.user_profiles;
CREATE POLICY "user_profiles_read_all" ON public.user_profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "user_profiles_update_own" ON public.user_profiles;
CREATE POLICY "user_profiles_update_own" ON public.user_profiles FOR UPDATE USING (auth.uid() = id);

-- Vehicles (Operational Floor)
DROP POLICY IF EXISTS "vehicles_read_all" ON public.vehicles;
CREATE POLICY "vehicles_read_all" ON public.vehicles FOR SELECT USING (true);

DROP POLICY IF EXISTS "vehicles_write_all" ON public.vehicles;
CREATE POLICY "vehicles_write_all" ON public.vehicles FOR ALL USING (true) WITH CHECK (true);

-- Stage Logs
DROP POLICY IF EXISTS "stage_logs_read_all" ON public.stage_logs;
CREATE POLICY "stage_logs_read_all" ON public.stage_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "stage_logs_write_all" ON public.stage_logs;
CREATE POLICY "stage_logs_write_all" ON public.stage_logs FOR ALL USING (true) WITH CHECK (true);

-- Vehicle Tasks
DROP POLICY IF EXISTS "vehicle_tasks_read_all" ON public.vehicle_tasks;
CREATE POLICY "vehicle_tasks_read_all" ON public.vehicle_tasks FOR SELECT USING (true);

DROP POLICY IF EXISTS "vehicle_tasks_write_all" ON public.vehicle_tasks;
CREATE POLICY "vehicle_tasks_write_all" ON public.vehicle_tasks FOR ALL USING (true) WITH CHECK (true);

-- Audit Logs (Read restricted to Super Admin, write via SECURITY DEFINER triggers)
DROP POLICY IF EXISTS "audit_logs_read_super_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_read_super_admin" ON public.audit_logs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

-- ------------------------------------------------------------------------------
-- 11. ATOMIC AUDITING TRIGGER ON VEHICLES
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_vehicle_changes_trigger()
RETURNS TRIGGER AS $$
DECLARE
  _actor_id UUID;
  _actor_email VARCHAR(255);
  _actor_name VARCHAR(255);
  _actor_role VARCHAR(50);
  _jwt_claims JSONB;
BEGIN
  _actor_id := auth.uid();

  IF _actor_id IS NOT NULL THEN
    SELECT display_name, role, email
    INTO _actor_name, _actor_role, _actor_email
    FROM public.user_profiles
    WHERE id = _actor_id;

    IF _actor_email IS NULL THEN
      SELECT email INTO _actor_email FROM auth.users WHERE id = _actor_id;
    END IF;
  END IF;

  IF _actor_email IS NULL THEN
    BEGIN
      _jwt_claims := current_setting('request.jwt.claims', true)::jsonb;
      _actor_email := _jwt_claims->>'email';
    EXCEPTION WHEN OTHERS THEN
      _actor_email := NULL;
    END;
  END IF;

  -- A. Vehicle Intake
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (
      branch_id, entity_type, entity_id, vehicle_no, action,
      actor_id, actor_email, actor_name, actor_role,
      changed_fields, old_values, new_values, action_timestamp
    ) VALUES (
      NEW.branch_id, 'vehicle', NEW.id, NEW.vehicle_no, 'VEHICLE_CREATED',
      _actor_id, _actor_email, COALESCE(_actor_name, 'Staff'), COALESCE(_actor_role, 'staff'),
      jsonb_build_object(
        'vehicle_no', jsonb_build_object('old', null, 'new', NEW.vehicle_no),
        'current_zone', jsonb_build_object('old', null, 'new', NEW.current_zone)
      ),
      '{}'::jsonb, to_jsonb(NEW), NOW()
    );
    RETURN NEW;
  END IF;

  -- B. Vehicle Deletion
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (
      branch_id, entity_type, entity_id, vehicle_no, action,
      actor_id, actor_email, actor_name, actor_role,
      changed_fields, old_values, new_values, action_timestamp
    ) VALUES (
      OLD.branch_id, 'vehicle', OLD.id, OLD.vehicle_no, 'DELETE_VEHICLE',
      _actor_id, _actor_email, COALESCE(_actor_name, 'Staff'), COALESCE(_actor_role, 'staff'),
      jsonb_build_object('status', jsonb_build_object('old', OLD.status, 'new', 'DELETED')),
      to_jsonb(OLD), '{}'::jsonb, NOW()
    );
    RETURN OLD;
  END IF;

  -- C. Vehicle Update (Specific Category Actions)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.vehicle_no IS DISTINCT FROM NEW.vehicle_no THEN
      INSERT INTO public.audit_logs (
        branch_id, entity_type, entity_id, vehicle_no, action,
        actor_id, actor_email, actor_name, actor_role,
        changed_fields, old_values, new_values, action_timestamp
      ) VALUES (
        NEW.branch_id, 'vehicle', NEW.id, NEW.vehicle_no, 'PLATE_MODIFIED',
        _actor_id, _actor_email, COALESCE(_actor_name, 'Staff'), COALESCE(_actor_role, 'staff'),
        jsonb_build_object('vehicle_no', jsonb_build_object('old', OLD.vehicle_no, 'new', NEW.vehicle_no)),
        jsonb_build_object('vehicle_no', OLD.vehicle_no),
        jsonb_build_object('vehicle_no', NEW.vehicle_no), NOW()
      );
    END IF;

    IF OLD.remarks IS DISTINCT FROM NEW.remarks THEN
      INSERT INTO public.audit_logs (
        branch_id, entity_type, entity_id, vehicle_no, action,
        actor_id, actor_email, actor_name, actor_role,
        changed_fields, old_values, new_values, action_timestamp
      ) VALUES (
        NEW.branch_id, 'vehicle', NEW.id, NEW.vehicle_no, 'REMARKS_MODIFIED',
        _actor_id, _actor_email, COALESCE(_actor_name, 'Staff'), COALESCE(_actor_role, 'staff'),
        jsonb_build_object('remarks', jsonb_build_object('old', OLD.remarks, 'new', NEW.remarks)),
        jsonb_build_object('remarks', OLD.remarks),
        jsonb_build_object('remarks', NEW.remarks), NOW()
      );
    END IF;

    IF OLD.is_paused IS DISTINCT FROM NEW.is_paused THEN
      INSERT INTO public.audit_logs (
        branch_id, entity_type, entity_id, vehicle_no, action,
        actor_id, actor_email, actor_name, actor_role,
        changed_fields, old_values, new_values, action_timestamp
      ) VALUES (
        NEW.branch_id, 'vehicle', NEW.id, NEW.vehicle_no,
        CASE WHEN NEW.is_paused THEN 'HOLD_OVERRIDE_PAUSED' ELSE 'HOLD_OVERRIDE_RESUMED' END,
        _actor_id, _actor_email, COALESCE(_actor_name, 'Staff'), COALESCE(_actor_role, 'staff'),
        jsonb_build_object('is_paused', jsonb_build_object('old', OLD.is_paused, 'new', NEW.is_paused)),
        jsonb_build_object('is_paused', OLD.is_paused, 'pause_reason', OLD.pause_reason),
        jsonb_build_object('is_paused', NEW.is_paused, 'pause_reason', NEW.pause_reason), NOW()
      );
    END IF;

    IF OLD.is_urgent IS DISTINCT FROM NEW.is_urgent THEN
      INSERT INTO public.audit_logs (
        branch_id, entity_type, entity_id, vehicle_no, action,
        actor_id, actor_email, actor_name, actor_role,
        changed_fields, old_values, new_values, action_timestamp
      ) VALUES (
        NEW.branch_id, 'vehicle', NEW.id, NEW.vehicle_no, 'URGENCY_MODIFIED',
        _actor_id, _actor_email, COALESCE(_actor_name, 'Staff'), COALESCE(_actor_role, 'staff'),
        jsonb_build_object('is_urgent', jsonb_build_object('old', OLD.is_urgent, 'new', NEW.is_urgent)),
        jsonb_build_object('is_urgent', OLD.is_urgent, 'urgent_note', OLD.urgent_note),
        jsonb_build_object('is_urgent', NEW.is_urgent, 'urgent_note', NEW.urgent_note), NOW()
      );
    END IF;

    IF OLD.current_zone IS DISTINCT FROM NEW.current_zone THEN
      INSERT INTO public.audit_logs (
        branch_id, entity_type, entity_id, vehicle_no, action,
        actor_id, actor_email, actor_name, actor_role,
        changed_fields, old_values, new_values, action_timestamp
      ) VALUES (
        NEW.branch_id, 'vehicle', NEW.id, NEW.vehicle_no, 'BAY_TRANSFERRED',
        _actor_id, _actor_email, COALESCE(_actor_name, 'Staff'), COALESCE(_actor_role, 'staff'),
        jsonb_build_object('current_zone', jsonb_build_object('old', OLD.current_zone, 'new', NEW.current_zone)),
        jsonb_build_object('current_zone', OLD.current_zone),
        jsonb_build_object('current_zone', NEW.current_zone), NOW()
      );
    END IF;

    IF OLD.is_finished IS DISTINCT FROM NEW.is_finished AND NEW.is_finished = TRUE THEN
      INSERT INTO public.audit_logs (
        branch_id, entity_type, entity_id, vehicle_no, action,
        actor_id, actor_email, actor_name, actor_role,
        changed_fields, old_values, new_values, action_timestamp
      ) VALUES (
        NEW.branch_id, 'vehicle', NEW.id, NEW.vehicle_no, 'JOB_COMPLETED',
        _actor_id, _actor_email, COALESCE(_actor_name, 'Staff'), COALESCE(_actor_role, 'staff'),
        jsonb_build_object('is_finished', jsonb_build_object('old', OLD.is_finished, 'new', NEW.is_finished)),
        jsonb_build_object('is_finished', OLD.is_finished),
        jsonb_build_object('is_finished', NEW.is_finished), NOW()
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_vehicle_changes ON public.vehicles;
CREATE TRIGGER trg_audit_vehicle_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION audit_vehicle_changes_trigger();

-- Task Audit Trigger
CREATE OR REPLACE FUNCTION audit_task_changes_trigger()
RETURNS TRIGGER AS $$
DECLARE
  _actor_id UUID;
  _actor_email VARCHAR(255);
  _actor_name VARCHAR(255);
  _actor_role VARCHAR(50);
  _vehicle_no VARCHAR(50);
  _branch_id VARCHAR(50);
BEGIN
  IF OLD.is_completed IS DISTINCT FROM NEW.is_completed AND NEW.is_completed = TRUE THEN
    _actor_id := auth.uid();
    IF _actor_id IS NOT NULL THEN
      SELECT display_name, role, email INTO _actor_name, _actor_role, _actor_email
      FROM public.user_profiles WHERE id = _actor_id;
    END IF;

    SELECT vehicle_no, branch_id INTO _vehicle_no, _branch_id
    FROM public.vehicles WHERE id = NEW.vehicle_id;

    INSERT INTO public.audit_logs (
      branch_id, entity_type, entity_id, vehicle_no, action,
      actor_id, actor_email, actor_name, actor_role,
      changed_fields, old_values, new_values, action_timestamp
    ) VALUES (
      COALESCE(_branch_id, 'orugodawatta_sec5'), 'task', NEW.id, _vehicle_no, 'TASK_COMPLETED',
      _actor_id, _actor_email, COALESCE(_actor_name, NEW.completed_by, 'Technician'), COALESCE(_actor_role, 'technician'),
      jsonb_build_object('task_name', NEW.task_name, 'is_completed', jsonb_build_object('old', OLD.is_completed, 'new', NEW.is_completed)),
      jsonb_build_object('is_completed', OLD.is_completed),
      jsonb_build_object('is_completed', NEW.is_completed), NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_task_changes ON public.vehicle_tasks;
CREATE TRIGGER trg_audit_task_changes
  AFTER UPDATE ON public.vehicle_tasks
  FOR EACH ROW EXECUTE FUNCTION audit_task_changes_trigger();

-- ------------------------------------------------------------------------------
-- 12. ATOMIC SERVER-SIDE RPC FUNCTIONS
-- ------------------------------------------------------------------------------

-- Safely drop all previous overloads and signatures of operational RPCs to allow return type changes
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_audit_logs_paginated',
        'get_service_report_kpis',
        'get_service_report_data',
        'intake_vehicle',
        'start_stage_work',
        'transfer_vehicle_zone',
        'finish_vehicle_job',
        'toggle_task_completion',
        'reconcile_daily_vehicles',
        'purge_records_older_than_90_days'
      )
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.proname) || '(' || r.args || ') CASCADE;';
  END LOOP;
END $$;

-- A. Intake Vehicle
CREATE OR REPLACE FUNCTION public.intake_vehicle(
  p_vehicle_no VARCHAR(50),
  p_target_zone VARCHAR(50) DEFAULT 'workshop',
  p_technician_name VARCHAR(255) DEFAULT NULL,
  p_remarks TEXT DEFAULT '',
  p_is_booking BOOLEAN DEFAULT FALSE,
  p_has_additional_repairs BOOLEAN DEFAULT FALSE,
  p_is_urgent BOOLEAN DEFAULT FALSE,
  p_urgent_note TEXT DEFAULT NULL,
  p_tasks JSONB DEFAULT '[]'::jsonb,
  p_branch_id VARCHAR(50) DEFAULT 'orugodawatta_sec5'
)
RETURNS JSONB AS $$
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
    intake_at, status, is_finished, branch_id
  ) VALUES (
    UPPER(TRIM(p_vehicle_no)), p_target_zone::bay_zone, p_technician_name,
    COALESCE(p_technician_name, 'Unassigned'), p_remarks,
    p_is_booking, p_has_additional_repairs, p_is_urgent, p_urgent_note,
    v_now, 'active', FALSE, p_branch_id
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. Start Stage Work
CREATE OR REPLACE FUNCTION public.start_stage_work(
  p_vehicle_id UUID,
  p_tech_name VARCHAR(255) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_log_id UUID;
  v_entered TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
  v_idle INT;
BEGIN
  SELECT id, entered_at INTO v_log_id, v_entered
  FROM public.stage_logs
  WHERE vehicle_id = p_vehicle_id AND exited_at IS NULL
  ORDER BY entered_at DESC
  LIMIT 1;

  IF v_log_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active stage log found');
  END IF;

  v_idle := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_entered))::INT);

  UPDATE public.stage_logs
  SET work_started_at = v_now,
      idle_seconds = v_idle
  WHERE id = v_log_id AND work_started_at IS NULL;

  IF p_tech_name IS NOT NULL AND TRIM(p_tech_name) != '' THEN
    UPDATE public.vehicles
    SET assigned_tech = p_tech_name
    WHERE id = p_vehicle_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'log_id', v_log_id, 'idle_seconds', v_idle);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- C. Transfer Vehicle Zone (With Offline Timestamp & Inspection Re-entry Invalidation)
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

-- D. Finish Vehicle Job (Advisor Handover)
CREATE OR REPLACE FUNCTION public.finish_vehicle_job(
  p_vehicle_id UUID,
  p_advisor_name VARCHAR(255) DEFAULT 'Service Advisor'
)
RETURNS JSONB AS $$
DECLARE
  v_old_log_id UUID;
  v_old_entered TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
  v_duration INT;
BEGIN
  SELECT id, entered_at INTO v_old_log_id, v_old_entered
  FROM public.stage_logs
  WHERE vehicle_id = p_vehicle_id AND exited_at IS NULL
  ORDER BY entered_at DESC
  LIMIT 1;

  IF v_old_log_id IS NOT NULL THEN
    v_duration := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_old_entered))::INT);
    UPDATE public.stage_logs
    SET exited_at = v_now,
        duration_seconds = v_duration,
        idle_seconds = v_duration,
        is_dispatched = TRUE
    WHERE id = v_old_log_id;
  END IF;

  UPDATE public.vehicles
  SET current_zone = 'completed',
      is_finished = TRUE,
      completed_at = v_now,
      effective_completed_at = COALESCE(effective_completed_at, v_now),
      status = 'finished',
      is_paused = FALSE,
      paused_at = NULL,
      updated_at = v_now
  WHERE id = p_vehicle_id;

  RETURN jsonb_build_object('success', true, 'completed_at', v_now);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- E. Toggle Task Completion
CREATE OR REPLACE FUNCTION public.toggle_task_completion(
  p_task_id UUID,
  p_is_completed BOOLEAN
)
RETURNS JSONB AS $$
DECLARE
  v_vehicle_id UUID;
  v_task_type VARCHAR(50);
  v_target_zone bay_zone;
BEGIN
  UPDATE public.vehicle_tasks
  SET is_completed = p_is_completed,
      completed_at = CASE WHEN p_is_completed THEN NOW() ELSE NULL END,
      completed_by = CASE WHEN p_is_completed THEN COALESCE(completed_by, 'Technician') ELSE NULL END
  WHERE id = p_task_id
  RETURNING vehicle_id, task_type INTO v_vehicle_id, v_task_type;

  IF v_vehicle_id IS NOT NULL THEN
    v_target_zone := CASE 
      WHEN v_task_type = 'general_service' THEN 'workshop'::bay_zone
      WHEN v_task_type = 'wheel_alignment' THEN 'alignment'::bay_zone
      WHEN v_task_type = 'hoist_service' THEN 'hoist'::bay_zone
      ELSE NULL
    END;

    IF v_target_zone IS NOT NULL THEN
      UPDATE public.stage_logs
      SET work_completed_at = CASE WHEN p_is_completed THEN NOW() ELSE NULL END
      WHERE vehicle_id = v_vehicle_id 
        AND to_zone = v_target_zone 
        AND exited_at IS NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- F. Reconcile Daily Vehicles (Midnight Rollover)
CREATE OR REPLACE FUNCTION public.reconcile_daily_vehicles(
  p_branch_id VARCHAR(50) DEFAULT 'orugodawatta_sec5'
)
RETURNS JSONB AS $$
DECLARE
  v_completed_count INT := 0;
  v_deleted_count INT := 0;
  v_today_start TIMESTAMPTZ := DATE_TRUNC('day', NOW());
BEGIN
  -- 1. Complete stale vehicles sitting in inspection from previous days
  WITH completed_inspection AS (
    UPDATE public.vehicles
    SET current_zone = 'completed',
        is_finished = TRUE,
        completed_at = NOW(),
        effective_completed_at = COALESCE(effective_completed_at, NOW()),
        status = 'finished',
        updated_at = NOW()
    WHERE is_finished = FALSE
      AND current_zone = 'inspection'
      AND branch_id = p_branch_id
      AND intake_at < v_today_start
    RETURNING id
  )
  SELECT COUNT(*) INTO v_completed_count FROM completed_inspection;

  -- Close any open stage logs for newly completed inspection vehicles
  UPDATE public.stage_logs
  SET exited_at = NOW(),
      duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - entered_at))::INT),
      idle_seconds = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - entered_at))::INT),
      is_dispatched = TRUE
  WHERE vehicle_id IN (
    SELECT id FROM public.vehicles
    WHERE is_finished = TRUE AND current_zone = 'completed' AND intake_at < v_today_start
  ) AND exited_at IS NULL;

  -- 2. Delete out-of-scope unfinished vehicles in working bays from previous days
  WITH deleted_bay AS (
    DELETE FROM public.vehicles
    WHERE is_finished = FALSE
      AND current_zone != 'inspection'
      AND branch_id = p_branch_id
      AND intake_at < v_today_start
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_count FROM deleted_bay;

  RETURN jsonb_build_object(
    'completed_count', v_completed_count,
    'deleted_count', v_deleted_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- G. 90-Day Retention Auto-Purge
CREATE OR REPLACE FUNCTION public.purge_records_older_than_90_days()
RETURNS JSONB AS $$
DECLARE
  v_purged_count INT := 0;
  v_cutoff TIMESTAMPTZ := NOW() - INTERVAL '90 days';
BEGIN
  WITH purged AS (
    DELETE FROM public.vehicles
    WHERE created_at < v_cutoff
      AND is_finished = TRUE
    RETURNING id
  )
  SELECT COUNT(*) INTO v_purged_count FROM purged;

  RETURN jsonb_build_object('success', true, 'purged_count', v_purged_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- H. Service Reports Aggregation KPI RPC
CREATE OR REPLACE FUNCTION public.get_service_report_kpis(
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
    COALESCE(SUM(total_break_seconds), 0)
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

-- I. Comprehensive Paginated Service Report Data RPC
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

  -- 2. Summary Counts and Breakdown
  SELECT jsonb_build_object(
    'totalVehicles', COUNT(*)::INT,
    'completedCount', COUNT(*) FILTER (WHERE is_finished = TRUE OR current_zone = 'inspection' OR effective_completed_at IS NOT NULL)::INT,
    'inProgressCount', COUNT(*) FILTER (WHERE is_finished = FALSE AND current_zone != 'inspection' AND effective_completed_at IS NULL)::INT,
    'bookingCount', COUNT(*) FILTER (WHERE is_booking = TRUE)::INT,
    'additionalRepairsCount', COUNT(*) FILTER (WHERE has_additional_repairs = TRUE)::INT,
    'onHoldCount', COUNT(*) FILTER (WHERE is_paused = TRUE OR status = 'on_hold')::INT,
    'totalBreakSeconds', COALESCE(SUM(total_break_seconds), 0)::INT
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

      COALESCE(SUM(CASE WHEN to_zone = 'workshop' THEN break_seconds END), 0)::INT AS ws_break,

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

      COALESCE(SUM(CASE WHEN to_zone = 'alignment' THEN break_seconds END), 0)::INT AS al_break,

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

      COALESCE(SUM(CASE WHEN to_zone = 'hoist' THEN break_seconds END), 0)::INT AS hs_break,

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

      COALESCE(SUM(break_seconds), 0)::INT AS total_stage_breaks_sec
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
      'total_break_seconds', COALESCE(vba.total_stage_breaks_sec, fv.total_break_seconds, 0),
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

-- J. Paginated Audit Trail RPC
DROP FUNCTION IF EXISTS public.get_audit_logs_paginated(character varying, timestamp with time zone, timestamp with time zone, character varying, integer, integer);
DROP FUNCTION IF EXISTS public.get_audit_logs_paginated(character varying, timestamp with time zone, timestamp with time zone, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_audit_logs_paginated(text, timestamp with time zone, timestamp with time zone, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_audit_logs_paginated(character varying, timestamp with time zone, timestamp with time zone, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_audit_logs_paginated(varchar, timestamptz, timestamptz, text, text, int, int);
DROP FUNCTION IF EXISTS public.get_audit_logs_paginated;
CREATE OR REPLACE FUNCTION public.get_audit_logs_paginated(
  p_branch_id VARCHAR(50) DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  action VARCHAR,
  entity_type VARCHAR,
  entity_id UUID,
  vehicle_no VARCHAR,
  actor_name VARCHAR,
  actor_role VARCHAR,
  actor_email VARCHAR,
  branch_id VARCHAR,
  changed_fields JSONB,
  old_values JSONB,
  new_values JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  action_timestamp TIMESTAMPTZ,
  is_offline_sync BOOLEAN,
  total_count BIGINT
) AS $$
DECLARE
  v_total BIGINT;
BEGIN
  -- Count total matching records
  SELECT COUNT(*) INTO v_total
  FROM public.audit_logs a
  WHERE (p_branch_id IS NULL OR a.branch_id = p_branch_id)
    AND (p_start_date IS NULL OR a.action_timestamp >= p_start_date)
    AND (p_end_date IS NULL OR a.action_timestamp <= p_end_date)
    AND (
      p_search IS NULL OR TRIM(p_search) = ''
      OR a.vehicle_no ILIKE '%' || p_search || '%'
      OR a.actor_name ILIKE '%' || p_search || '%'
      OR a.action ILIKE '%' || p_search || '%'
    )
    AND (
      p_category IS NULL OR p_category = 'all'
      OR (p_category = 'holds' AND a.action IN ('HOLD_OVERRIDE_PAUSED', 'HOLD_OVERRIDE_RESUMED'))
      OR (p_category = 'urgency' AND a.action = 'URGENCY_MODIFIED')
      OR (p_category = 'plate' AND a.action = 'PLATE_MODIFIED')
      OR (p_category = 'remarks' AND a.action = 'REMARKS_MODIFIED')
      OR (p_category = 'transfers' AND a.action IN ('BAY_TRANSFERRED', 'SECTION_TRANSFER'))
      OR (p_category = 'intake_delete' AND a.action IN ('VEHICLE_CREATED', 'DELETE_VEHICLE'))
      OR (p_category = 'completions' AND a.action IN ('TASK_COMPLETED', 'JOB_COMPLETED'))
      OR (p_category = 'users' AND a.action = 'USER_ROLE_CHANGED')
    );

  RETURN QUERY
  SELECT 
    a.id,
    a.action,
    a.entity_type,
    a.entity_id,
    a.vehicle_no,
    a.actor_name,
    a.actor_role,
    a.actor_email,
    a.branch_id,
    a.changed_fields,
    a.old_values,
    a.new_values,
    a.metadata,
    a.created_at,
    COALESCE(a.action_timestamp, a.created_at) AS action_timestamp,
    (a.action_timestamp IS NOT NULL AND a.created_at IS NOT NULL AND ABS(EXTRACT(EPOCH FROM (a.created_at - a.action_timestamp))) > 60) AS is_offline_sync,
    v_total AS total_count
  FROM public.audit_logs a
  WHERE (p_branch_id IS NULL OR a.branch_id = p_branch_id)
    AND (p_start_date IS NULL OR a.action_timestamp >= p_start_date)
    AND (p_end_date IS NULL OR a.action_timestamp <= p_end_date)
    AND (
      p_search IS NULL OR TRIM(p_search) = ''
      OR a.vehicle_no ILIKE '%' || p_search || '%'
      OR a.actor_name ILIKE '%' || p_search || '%'
      OR a.action ILIKE '%' || p_search || '%'
    )
    AND (
      p_category IS NULL OR p_category = 'all'
      OR (p_category = 'holds' AND a.action IN ('HOLD_OVERRIDE_PAUSED', 'HOLD_OVERRIDE_RESUMED'))
      OR (p_category = 'urgency' AND a.action = 'URGENCY_MODIFIED')
      OR (p_category = 'plate' AND a.action = 'PLATE_MODIFIED')
      OR (p_category = 'remarks' AND a.action = 'REMARKS_MODIFIED')
      OR (p_category = 'transfers' AND a.action IN ('BAY_TRANSFERRED', 'SECTION_TRANSFER'))
      OR (p_category = 'intake_delete' AND a.action IN ('VEHICLE_CREATED', 'DELETE_VEHICLE'))
      OR (p_category = 'completions' AND a.action IN ('TASK_COMPLETED', 'JOB_COMPLETED'))
      OR (p_category = 'users' AND a.action = 'USER_ROLE_CHANGED')
    )
  ORDER BY COALESCE(a.action_timestamp, a.created_at) DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 13. AUTONOMOUS PG_CRON SCHEDULES (OPTIONAL CLOUD SETUP)
-- ------------------------------------------------------------------------------
DO $$ BEGIN
  PERFORM cron.unschedule('daily-midnight-reconciliation');
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'daily-midnight-reconciliation',
    '0 0 * * *',
    $cmd$SELECT public.reconcile_daily_vehicles('orugodawatta_sec5');$cmd$
  );
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  PERFORM cron.unschedule('weekly-90day-retention-purge');
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'weekly-90day-retention-purge',
    '0 3 * * 0',
    $cmd$SELECT public.purge_records_older_than_90_days();$cmd$
  );
EXCEPTION WHEN OTHERS THEN null; END $$;

-- End of Pristine Production Schema Deployment
