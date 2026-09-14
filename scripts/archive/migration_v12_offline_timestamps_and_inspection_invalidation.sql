-- ==============================================================================
-- UNITED MOTORS VEHICLE TRACKING - ARCHITECTURAL FIXES (V12)
-- 
-- 1. INSPECTION RE-ENTRY STATE INVALIDATION:
--    When a vehicle in 'inspection' is rejected and transferred back to a work bay
--    (workshop, alignment, hoist), automatically invalidate effective_completed_at
--    and reset is_finished to FALSE so KPI reports reflect true floor state.
--
-- 2. OFFLINE AUDIT TIMESTAMPS:
--    Add action_timestamp and is_offline_sync columns to public.audit_logs.
--    When actions occur offline, records physical event time rather than server sync time.
-- ==============================================================================

-- 1. ADD AUDIT OFFLINE TIMESTAMPS COLUMNS
ALTER TABLE public.audit_logs 
  ADD COLUMN IF NOT EXISTS action_timestamp TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS is_offline_sync BOOLEAN DEFAULT FALSE;

-- Update historical records to match created_at
UPDATE public.audit_logs
SET action_timestamp = created_at
WHERE action_timestamp IS NULL;


-- 2. UPDATE transfer_vehicle_zone RPC TO HANDLE INSPECTION RE-ENTRY INVALIDATION
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
  v_duration INT;
  v_idle INT;
  v_active INT;
  v_next_visit INT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Read current vehicle state
  SELECT current_zone INTO v_old_zone
  FROM public.vehicles
  WHERE id = p_vehicle_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vehicle not found');
  END IF;

  -- Close active stage log
  SELECT id, entered_at, work_started_at
  INTO v_old_log_id, v_old_entered, v_old_started
  FROM public.stage_logs
  WHERE vehicle_id = p_vehicle_id AND exited_at IS NULL
  ORDER BY entered_at DESC
  LIMIT 1;

  IF v_old_log_id IS NOT NULL THEN
    v_duration := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_old_entered))::INT);
    IF v_old_started IS NOT NULL THEN
      v_idle := GREATEST(0, EXTRACT(EPOCH FROM (v_old_started - v_old_entered))::INT);
      v_active := GREATEST(0, v_duration - v_idle);
    ELSE
      v_idle := v_duration;
      v_active := 0;
    END IF;

    UPDATE public.stage_logs
    SET exited_at = v_now,
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
  WHERE vehicle_id = p_vehicle_id AND to_zone = p_to_zone;

  -- Insert new stage log for target zone
  INSERT INTO public.stage_logs (
    vehicle_id, from_zone, to_zone, visit_number,
    entered_at, duration_seconds, idle_seconds, active_seconds,
    moved_by, is_dispatched
  ) VALUES (
    p_vehicle_id, v_old_zone, p_to_zone, v_next_visit,
    v_now, 0, 0, 0,
    COALESCE(p_moved_by, 'Staff'), FALSE
  );

  -- UPDATE VEHICLE RECORD WITH INSPECTION RE-ENTRY INVALIDATION:
  IF p_to_zone = 'inspection' THEN
    -- Moving into inspection -> stamp effective completion
    UPDATE public.vehicles
    SET current_zone = p_to_zone,
        effective_completed_at = v_now,
        is_paused = FALSE,
        paused_at = NULL,
        status = 'active',
        updated_at = v_now
    WHERE id = p_vehicle_id;
  ELSE
    -- Moving to floor work bays (workshop, alignment, hoist)
    -- ACTIVE STATE INVALIDATION: If vehicle was previously in inspection, clear effective_completed_at
    UPDATE public.vehicles
    SET current_zone = p_to_zone,
        effective_completed_at = NULL, -- Invalidates 'DONE' status because it is back on the floor
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


-- 3. ENHANCE get_audit_logs_paginated RPC TO RETURN action_timestamp AND is_offline_sync
-- Drop previous function signatures because PostgreSQL requires dropping when OUT/RETURN table column types change:
DROP FUNCTION IF EXISTS public.get_audit_logs_paginated(character varying, timestamp with time zone, timestamp with time zone, character varying, integer, integer);
DROP FUNCTION IF EXISTS public.get_audit_logs_paginated(character varying, timestamp with time zone, timestamp with time zone, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_audit_logs_paginated(text, timestamp with time zone, timestamp with time zone, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_audit_logs_paginated(character varying, timestamp with time zone, timestamp with time zone, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_audit_logs_paginated(varchar, timestamptz, timestamptz, text, text, int, int);

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
  created_at TIMESTAMPTZ,
  action_timestamp TIMESTAMPTZ,
  is_offline_sync BOOLEAN,
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
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access Denied: Only Super Administrators have permission to access the Activity & Audit Log.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT a.*
    FROM public.audit_logs a
    WHERE (p_branch_id IS NULL OR p_branch_id = 'all' OR a.branch_id = p_branch_id)
      AND (p_start_date IS NULL OR a.action_timestamp >= p_start_date)
      AND (p_end_date IS NULL OR a.action_timestamp <= p_end_date)
      AND (
        p_category IS NULL OR p_category = 'all'
        OR (p_category = 'holds' AND a.action IN ('HOLD_OVERRIDE_PAUSED', 'HOLD_OVERRIDE_RESUMED'))
        OR (p_category = 'urgency' AND a.action = 'URGENCY_MODIFIED')
        OR (p_category = 'plate' AND a.action = 'PLATE_MODIFIED')
        OR (p_category = 'remarks' AND a.action = 'REMARKS_MODIFIED')
        OR (p_category = 'transfers' AND a.action IN ('BAY_TRANSFERRED', 'SECTION_TRANSFER', 'TECH_REASSIGNED'))
        OR (p_category = 'intake_delete' AND a.action IN ('VEHICLE_CREATED', 'DELETE_VEHICLE'))
        OR (p_category = 'completions' AND a.action IN ('JOB_COMPLETED', 'TASK_COMPLETED'))
        OR (p_category = 'users' AND a.action IN ('USER_ROLE_CHANGED', 'USER_UPDATED'))
      )
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
    f.id, 
    f.created_at, 
    COALESCE(f.action_timestamp, f.created_at) AS action_timestamp,
    COALESCE(f.is_offline_sync, FALSE) AS is_offline_sync,
    f.branch_id, f.entity_type, f.entity_id,
    f.vehicle_no, f.action, f.actor_id, f.actor_email, f.actor_name, f.actor_role,
    f.changed_fields, f.old_values, f.new_values,
    t.cnt AS total_count
  FROM filtered f
  CROSS JOIN total t
  ORDER BY COALESCE(f.action_timestamp, f.created_at) DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
