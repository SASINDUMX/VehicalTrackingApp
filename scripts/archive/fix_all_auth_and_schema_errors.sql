-- ==============================================================================
-- UNITED MOTORS VEHICLE TRACKING - COMPREHENSIVE REPAIR SCRIPT
-- ==============================================================================
-- Fixes:
-- 1. "Database error querying schema" on admin@unitedmotors.com
-- 2. "Invalid login credentials" on foremen accounts
-- 3. Duplicate get_service_report_kpis overload in schema cache
-- 4. Deploys get_service_report_data and ensures Super Admin permissions
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. CLEAN UP DUPLICATE FUNCTION SIGNATURES IN SCHEMA CACHE
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_service_report_kpis(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_service_report_kpis(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, VARCHAR);
DROP FUNCTION IF EXISTS public.get_service_report_kpis(TIMESTAMPTZ, TIMESTAMPTZ, VARCHAR, TEXT);
DROP FUNCTION IF EXISTS public.get_service_report_kpis(TIMESTAMPTZ, TIMESTAMPTZ, TEXT);

-- ------------------------------------------------------------------------------
-- 2. ENSURE user_role ENUM CONTAINS super_admin
-- ------------------------------------------------------------------------------
DO $enum$ BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
EXCEPTION WHEN duplicate_object THEN null; END $enum$;

-- ------------------------------------------------------------------------------
-- 3. FIX user_profiles RLS PERMISSIONS
-- ------------------------------------------------------------------------------
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow user to read own profile" ON public.user_profiles;
CREATE POLICY "Allow user to read own profile" 
  ON public.user_profiles 
  FOR SELECT 
  USING (true);

DROP POLICY IF EXISTS "Allow user to update own profile" ON public.user_profiles;
CREATE POLICY "Allow user to update own profile" 
  ON public.user_profiles 
  FOR UPDATE 
  USING (auth.uid() = id);

-- ------------------------------------------------------------------------------
-- 4. SYNCHRONIZE & REPAIR ALL 16 ACCOUNTS IN auth.users & public.user_profiles
-- ------------------------------------------------------------------------------
DO $sync$
DECLARE
  rec RECORD;
  v_uid UUID;
  all_users JSONB := '[
    {"email": "admin@unitedmotors.com", "password": "UMAdmin@2026", "role": "super_admin", "section": null, "name": "Super Administrator"},
    {"email": "foreman.car@unitedmotors.com", "password": "Foreman@123", "role": "foreman", "section": "car", "name": "Foreman (CAR)"},
    {"email": "foreman.suv@unitedmotors.com", "password": "Foreman@123", "role": "foreman", "section": "suv", "name": "Foreman (SUV)"},
    {"email": "foreman.lcv@unitedmotors.com", "password": "Foreman@123", "role": "foreman", "section": "lcv", "name": "Foreman (LCV)"},
    {"email": "foreman.hoist@unitedmotors.com", "password": "Foreman@123", "role": "foreman", "section": "hoist", "name": "Foreman (Hoist)"},
    {"email": "foreman.alignment@unitedmotors.com", "password": "Foreman@123", "role": "foreman", "section": "alignment", "name": "Foreman (Alignment)"},
    {"email": "manager@unitedmotors.com", "password": "Manager@123", "role": "workshop_manager", "section": null, "name": "Workshop Manager"},
    {"email": "agm@unitedmotors.com", "password": "Agm@123", "role": "agm", "section": null, "name": "Assistant General Manager"},
    {"email": "executive@unitedmotors.com", "password": "Exec@123", "role": "service_executive", "section": null, "name": "Service Executive"},
    {"email": "controller@unitedmotors.com", "password": "Controller@123", "role": "job_controller", "section": null, "name": "Job Controller"},
    {"email": "advisor.car1@unitedmotors.com", "password": "Advisor@123", "role": "advisor", "section": "car", "name": "Advisor Car 1"},
    {"email": "advisor.car2@unitedmotors.com", "password": "Advisor@123", "role": "advisor", "section": "car", "name": "Advisor Car 2"},
    {"email": "advisor.suv1@unitedmotors.com", "password": "Advisor@123", "role": "advisor", "section": "suv", "name": "Advisor SUV 1"},
    {"email": "advisor.suv2@unitedmotors.com", "password": "Advisor@123", "role": "advisor", "section": "suv", "name": "Advisor SUV 2"},
    {"email": "advisor.lcv1@unitedmotors.com", "password": "Advisor@123", "role": "advisor", "section": "lcv", "name": "Advisor LCV 1"},
    {"email": "advisor.lcv2@unitedmotors.com", "password": "Advisor@123", "role": "advisor", "section": "lcv", "name": "Advisor LCV 2"}
  ]'::jsonb;
BEGIN
  FOR rec IN SELECT * FROM jsonb_to_recordset(all_users) AS x(email TEXT, password TEXT, role TEXT, section TEXT, name TEXT)
  LOOP
    SELECT id INTO v_uid FROM auth.users WHERE email = rec.email;

    IF v_uid IS NULL THEN
      v_uid := gen_random_uuid();
      INSERT INTO auth.users (
        id, instance_id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        is_super_admin, created_at, updated_at
      ) VALUES (
        v_uid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        rec.email,
        crypt(rec.password, gen_salt('bf', 10)),
        NOW(),
        '{"provider": "email", "providers": ["email"]}'::jsonb,
        jsonb_build_object('display_name', rec.name, 'role', rec.role, 'section', rec.section),
        FALSE,
        NOW(),
        NOW()
      );
    ELSE
      -- Repair auth.users record to match Supabase GoTrue expectations
      UPDATE auth.users
      SET encrypted_password = crypt(rec.password, gen_salt('bf', 10)),
          email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
          aud = 'authenticated',
          role = 'authenticated',
          instance_id = '00000000-0000-0000-0000-000000000000',
          raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb,
          raw_user_meta_data = jsonb_build_object('display_name', rec.name, 'role', rec.role, 'section', rec.section),
          updated_at = NOW()
      WHERE id = v_uid;
    END IF;

    -- Upsert profile with proper enum role & branch
    INSERT INTO public.user_profiles (id, display_name, role, section, branch_id, theme_preference)
    VALUES (v_uid, rec.name, rec.role::user_role, rec.section, 'peliyagoda_sec5', 'system')
    ON CONFLICT (id) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          role = EXCLUDED.role,
          section = EXCLUDED.section;
  END LOOP;
END $sync$;

-- ------------------------------------------------------------------------------
-- 5. REPAIR RLS HELPER: is_manager_or_executive()
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_manager_or_executive()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE id = auth.uid() 
      AND role IN ('super_admin', 'agm', 'workshop_manager', 'service_executive')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 6. AUDIT LOGS ACCESS POLICY & RPC
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "audit_logs_select_super_admin_only" ON public.audit_logs;
CREATE POLICY "audit_logs_select_super_admin_only" ON public.audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles 
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE OR REPLACE FUNCTION get_audit_logs_paginated(
  p_branch_id VARCHAR(50) DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  branch_id VARCHAR(50),
  entity_type VARCHAR(50),
  entity_id UUID,
  vehicle_no VARCHAR(50),
  action VARCHAR(50),
  actor_id UUID,
  actor_email VARCHAR(255),
  actor_name VARCHAR(255),
  actor_role VARCHAR(50),
  changed_fields JSONB,
  old_values JSONB,
  new_values JSONB,
  total_count BIGINT
) AS $$
DECLARE
  v_is_super_admin BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE public.user_profiles.id = auth.uid() 
      AND public.user_profiles.role = 'super_admin'
  ) INTO v_is_super_admin;

  IF NOT v_is_super_admin THEN
    RAISE EXCEPTION 'Access Denied: Only Super Administrators can inspect audit logs.';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT a.*
    FROM public.audit_logs a
    WHERE (p_branch_id IS NULL OR a.branch_id = p_branch_id)
      AND (p_start_date IS NULL OR a.created_at >= p_start_date)
      AND (p_end_date IS NULL OR a.created_at <= p_end_date)
      AND (
        p_search IS NULL OR 
        a.vehicle_no ILIKE '%' || p_search || '%' OR 
        a.actor_name ILIKE '%' || p_search || '%' OR 
        a.actor_email ILIKE '%' || p_search || '%' OR 
        a.action ILIKE '%' || p_search || '%'
      )
  ),
  total AS (
    SELECT COUNT(*) AS cnt FROM filtered
  )
  SELECT 
    f.id, f.created_at, f.branch_id, f.entity_type, f.entity_id,
    f.vehicle_no, f.action, f.actor_id, f.actor_email, f.actor_name, f.actor_role,
    f.changed_fields, f.old_values, f.new_values,
    t.cnt AS total_count
  FROM filtered f
  CROSS JOIN total t
  ORDER BY f.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 7. CLEAN SINGLE DEFINITION: get_service_report_kpis
-- ------------------------------------------------------------------------------
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
      v.status,
      v.is_paused,
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
      COUNT(*) FILTER (WHERE has_additional_repairs = TRUE)::INT AS extra_repairs,
      COUNT(*) FILTER (WHERE is_paused = TRUE OR status = 'on_hold')::INT AS on_hold
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
      AND fv.has_additional_repairs = FALSE
      AND fv.is_paused = FALSE
      AND fv.status != 'on_hold'
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
    'onHoldCount', COALESCE(c.on_hold, 0),
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
    'onHoldCount', 0,
    'workshopBay', jsonb_build_object('zone', 'workshop', 'name', 'General Service', 'vehicleCount', 0, 'totalActiveSec', 0, 'avgActiveSec', 0, 'totalIdleSec', 0, 'avgIdleSec', 0, 'totalStageSec', 0, 'avgStageSec', 0),
    'alignmentBay', jsonb_build_object('zone', 'alignment', 'name', 'Wheel Alignment', 'vehicleCount', 0, 'totalActiveSec', 0, 'avgActiveSec', 0, 'totalIdleSec', 0, 'avgIdleSec', 0, 'totalStageSec', 0, 'avgStageSec', 0),
    'hoistBay', jsonb_build_object('zone', 'hoist', 'name', 'Hoist Service', 'vehicleCount', 0, 'totalActiveSec', 0, 'avgActiveSec', 0, 'totalIdleSec', 0, 'avgIdleSec', 0, 'totalStageSec', 0, 'avgStageSec', 0)
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 8. COMPREHENSIVE REPORT RPC: get_service_report_data
-- ------------------------------------------------------------------------------
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
  FROM vehicles v
  WHERE (p_start_date IS NULL OR v.intake_at >= p_start_date)
    AND (p_end_date IS NULL OR v.intake_at <= p_end_date)
    AND (p_branch_id IS NULL OR v.branch_id = p_branch_id)
    AND (
      p_status = 'all'
      OR (p_status = 'completed' AND (v.is_finished = TRUE OR v.current_zone = 'inspection'))
      OR (p_status = 'in_progress' AND v.is_finished = FALSE AND v.current_zone != 'inspection')
    );

  SELECT jsonb_build_object(
    'totalVehicles', COUNT(*)::INT,
    'completedCount', COUNT(*) FILTER (WHERE is_finished = TRUE OR current_zone = 'inspection')::INT,
    'inProgressCount', COUNT(*) FILTER (WHERE is_finished = FALSE AND current_zone != 'inspection')::INT,
    'bookingCount', COUNT(*) FILTER (WHERE is_booking = TRUE)::INT,
    'additionalRepairsCount', COUNT(*) FILTER (WHERE has_additional_repairs = TRUE)::INT,
    'onHoldCount', COUNT(*) FILTER (WHERE is_paused = TRUE OR status = 'on_hold')::INT,
    'totalBreakSeconds', COALESCE(SUM(total_break_seconds), 0)::INT
  ) INTO v_summary
  FROM temp_filtered_vehicles;

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
      COUNT(*) FILTER (WHERE is_completed = TRUE)::INT AS tasks_completed_count,
      COUNT(*)::INT AS tasks_total_count,
      string_agg(
        task_name || ' (by ' || COALESCE(completed_by, 'Tech') || ')', 
        '; ' ORDER BY completed_at
      ) FILTER (WHERE is_completed = TRUE) AS completed_tasks_str
    FROM vehicle_tasks
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
      'is_effective_done', (fv.is_finished = TRUE OR fv.current_zone = 'inspection'),
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
      'workshop_idle', COALESCE(vba.ws_idle, 0),
      'workshop_active', COALESCE(vba.ws_active, 0),
      'workshop_break', COALESCE(vba.ws_break, 0),
      'alignment_idle', COALESCE(vba.al_idle, 0),
      'alignment_active', COALESCE(vba.al_active, 0),
      'alignment_break', COALESCE(vba.al_break, 0),
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

-- ------------------------------------------------------------------------------
-- 9. VERIFICATION
-- ------------------------------------------------------------------------------
SELECT 
  u.email, 
  p.role, 
  p.section, 
  p.display_name,
  u.email_confirmed_at IS NOT NULL AS is_active
FROM auth.users u
JOIN public.user_profiles p ON p.id = u.id
ORDER BY p.role, p.section;
