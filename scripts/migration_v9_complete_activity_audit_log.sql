-- ==============================================================================
-- UNITED MOTORS VEHICLE TRACKING - COMPREHENSIVE ACTIVITY & AUDIT LOG (V9)
-- Captures:
-- 1. Vehicle Intakes / Creation (INSERT) -> VEHICLE_CREATED
-- 2. Vehicle Modifications (UPDATE) -> PLATE_MODIFIED, REMARKS_MODIFIED, etc.
-- 3. Vehicle Deletions (DELETE) -> DELETE_VEHICLE
-- 4. Vehicle Task Completion (UPDATE on vehicle_tasks) -> TASK_COMPLETED
-- 5. User Role & Profile Changes (UPDATE on user_profiles) -> USER_ROLE_CHANGED
-- 6. Clean RPC with Action Category Filtering (drops duplicate function overloads)
-- ==============================================================================

-- Clean up any conflicting overloaded RPC signatures
DROP FUNCTION IF EXISTS public.get_audit_logs_paginated(character varying, timestamp with time zone, timestamp with time zone, character varying, integer, integer);
DROP FUNCTION IF EXISTS public.get_audit_logs_paginated(character varying, timestamp with time zone, timestamp with time zone, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_audit_logs_paginated(text, timestamp with time zone, timestamp with time zone, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_audit_logs_paginated(character varying, timestamp with time zone, timestamp with time zone, text, text, integer, integer);

-- 1. COMPREHENSIVE VEHICLE AUDIT TRIGGER
CREATE OR REPLACE FUNCTION audit_vehicle_changes_trigger()
RETURNS TRIGGER AS $$
DECLARE
  _actor_id UUID;
  _actor_email VARCHAR(255);
  _actor_name VARCHAR(255);
  _actor_role VARCHAR(50);
  _jwt_claims JSONB;
  _changed JSONB := '{}'::jsonb;
  _old_vals JSONB := '{}'::jsonb;
  _new_vals JSONB := '{}'::jsonb;
  _action VARCHAR(50) := 'UPDATE';
  _has_audited_changes BOOLEAN := FALSE;
BEGIN
  _actor_id := auth.uid();
  
  -- Extract actor profile info safely
  IF _actor_id IS NOT NULL THEN
    SELECT display_name, role, email
    INTO _actor_name, _actor_role, _actor_email
    FROM public.user_profiles
    WHERE id = _actor_id;

    -- If email column is NULL in user_profiles, safely read from auth.users
    IF _actor_email IS NULL THEN
      SELECT email INTO _actor_email FROM auth.users WHERE id = _actor_id;
    END IF;
  END IF;

  -- Fallback to JWT claims if user_profile not yet loaded
  IF _actor_email IS NULL THEN
    BEGIN
      _jwt_claims := current_setting('request.jwt.claims', true)::jsonb;
      _actor_email := _jwt_claims->>'email';
    EXCEPTION WHEN OTHERS THEN
      _actor_email := NULL;
    END;
  END IF;

  -- A. Vehicle Intake / Creation
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (
      branch_id, entity_type, entity_id, vehicle_no, action,
      actor_id, actor_email, actor_name, actor_role,
      changed_fields, old_values, new_values
    ) VALUES (
      NEW.branch_id, 'vehicle', NEW.id, NEW.vehicle_no, 'VEHICLE_CREATED',
      _actor_id, _actor_email, COALESCE(_actor_name, 'Staff'), COALESCE(_actor_role, 'staff'),
      jsonb_build_object(
        'vehicle_no', jsonb_build_object('old', null, 'new', NEW.vehicle_no),
        'current_zone', jsonb_build_object('old', null, 'new', NEW.current_zone),
        'remarks', jsonb_build_object('old', null, 'new', NEW.remarks)
      ),
      '{}'::jsonb,
      to_jsonb(NEW)
    );
    RETURN NEW;
  END IF;

  -- B. Vehicle Deletion
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (
      branch_id, entity_type, entity_id, vehicle_no, action,
      actor_id, actor_email, actor_name, actor_role,
      changed_fields, old_values, new_values
    ) VALUES (
      OLD.branch_id, 'vehicle', OLD.id, OLD.vehicle_no, 'DELETE_VEHICLE',
      _actor_id, _actor_email, COALESCE(_actor_name, 'Staff'), COALESCE(_actor_role, 'staff'),
      jsonb_build_object('status', jsonb_build_object('old', OLD.status, 'new', 'DELETED')),
      to_jsonb(OLD), '{}'::jsonb
    );
    RETURN OLD;
  END IF;

  -- C. Vehicle Sensitive Modifications (UPDATE):
  
  -- 1. License Plate Modification
  IF OLD.vehicle_no IS DISTINCT FROM NEW.vehicle_no THEN
    _changed := _changed || jsonb_build_object('vehicle_no', jsonb_build_object('old', OLD.vehicle_no, 'new', NEW.vehicle_no));
    _old_vals := _old_vals || jsonb_build_object('vehicle_no', OLD.vehicle_no);
    _new_vals := _new_vals || jsonb_build_object('vehicle_no', NEW.vehicle_no);
    _action := 'PLATE_MODIFIED';
    _has_audited_changes := TRUE;
  END IF;

  -- 2. Job Remarks & Instructions Edits
  IF OLD.remarks IS DISTINCT FROM NEW.remarks THEN
    _changed := _changed || jsonb_build_object('remarks', jsonb_build_object('old', OLD.remarks, 'new', NEW.remarks));
    _old_vals := _old_vals || jsonb_build_object('remarks', OLD.remarks);
    _new_vals := _new_vals || jsonb_build_object('remarks', NEW.remarks);
    IF _action = 'UPDATE' THEN _action := 'REMARKS_MODIFIED'; END IF;
    _has_audited_changes := TRUE;
  END IF;

  -- 3. Hold / Pause State & Reason Overrides
  IF OLD.is_paused IS DISTINCT FROM NEW.is_paused OR OLD.pause_reason IS DISTINCT FROM NEW.pause_reason THEN
    _changed := _changed || jsonb_build_object(
      'is_paused', jsonb_build_object('old', OLD.is_paused, 'new', NEW.is_paused),
      'pause_reason', jsonb_build_object('old', OLD.pause_reason, 'new', NEW.pause_reason)
    );
    _old_vals := _old_vals || jsonb_build_object('is_paused', OLD.is_paused, 'pause_reason', OLD.pause_reason);
    _new_vals := _new_vals || jsonb_build_object('is_paused', NEW.is_paused, 'pause_reason', NEW.pause_reason);
    _action := CASE WHEN NEW.is_paused THEN 'HOLD_OVERRIDE_PAUSED' ELSE 'HOLD_OVERRIDE_RESUMED' END;
    _has_audited_changes := TRUE;
  END IF;

  -- 4. Urgency & Priority Overrides
  IF OLD.is_urgent IS DISTINCT FROM NEW.is_urgent OR OLD.urgent_note IS DISTINCT FROM NEW.urgent_note THEN
    _changed := _changed || jsonb_build_object(
      'is_urgent', jsonb_build_object('old', OLD.is_urgent, 'new', NEW.is_urgent),
      'urgent_note', jsonb_build_object('old', OLD.urgent_note, 'new', NEW.urgent_note)
    );
    _old_vals := _old_vals || jsonb_build_object('is_urgent', OLD.is_urgent, 'urgent_note', OLD.urgent_note);
    _new_vals := _new_vals || jsonb_build_object('is_urgent', NEW.is_urgent, 'urgent_note', NEW.urgent_note);
    IF _action = 'UPDATE' THEN _action := 'URGENCY_MODIFIED'; END IF;
    _has_audited_changes := TRUE;
  END IF;

  -- 5. Section / Bay Transfer
  IF OLD.current_zone IS DISTINCT FROM NEW.current_zone THEN
    _changed := _changed || jsonb_build_object('current_zone', jsonb_build_object('old', OLD.current_zone, 'new', NEW.current_zone));
    _old_vals := _old_vals || jsonb_build_object('current_zone', OLD.current_zone);
    _new_vals := _new_vals || jsonb_build_object('current_zone', NEW.current_zone);
    IF _action = 'UPDATE' THEN _action := 'BAY_TRANSFERRED'; END IF;
    _has_audited_changes := TRUE;
  END IF;

  -- 6. Technician Reassignment
  IF OLD.assigned_tech IS DISTINCT FROM NEW.assigned_tech OR OLD.technician_name IS DISTINCT FROM NEW.technician_name THEN
    _changed := _changed || jsonb_build_object(
      'assigned_tech', jsonb_build_object('old', COALESCE(OLD.assigned_tech, OLD.technician_name), 'new', COALESCE(NEW.assigned_tech, NEW.technician_name))
    );
    _old_vals := _old_vals || jsonb_build_object('assigned_tech', COALESCE(OLD.assigned_tech, OLD.technician_name));
    _new_vals := _new_vals || jsonb_build_object('assigned_tech', COALESCE(NEW.assigned_tech, NEW.technician_name));
    IF _action = 'UPDATE' THEN _action := 'TECH_REASSIGNED'; END IF;
    _has_audited_changes := TRUE;
  END IF;

  -- 7. Additional Repairs Flagged
  IF OLD.has_additional_repairs IS DISTINCT FROM NEW.has_additional_repairs THEN
    _changed := _changed || jsonb_build_object('has_additional_repairs', jsonb_build_object('old', OLD.has_additional_repairs, 'new', NEW.has_additional_repairs));
    _old_vals := _old_vals || jsonb_build_object('has_additional_repairs', OLD.has_additional_repairs);
    _new_vals := _new_vals || jsonb_build_object('has_additional_repairs', NEW.has_additional_repairs);
    IF _action = 'UPDATE' THEN _action := 'ADDITIONAL_REPAIRS_TOGGLED'; END IF;
    _has_audited_changes := TRUE;
  END IF;

  -- 8. Booking Flagged
  IF OLD.is_booking IS DISTINCT FROM NEW.is_booking THEN
    _changed := _changed || jsonb_build_object('is_booking', jsonb_build_object('old', OLD.is_booking, 'new', NEW.is_booking));
    _old_vals := _old_vals || jsonb_build_object('is_booking', OLD.is_booking);
    _new_vals := _new_vals || jsonb_build_object('is_booking', NEW.is_booking);
    IF _action = 'UPDATE' THEN _action := 'BOOKING_TOGGLED'; END IF;
    _has_audited_changes := TRUE;
  END IF;

  -- 9. Status Changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    _changed := _changed || jsonb_build_object('status', jsonb_build_object('old', OLD.status, 'new', NEW.status));
    _old_vals := _old_vals || jsonb_build_object('status', OLD.status);
    _new_vals := _new_vals || jsonb_build_object('status', NEW.status);
    IF _action = 'UPDATE' THEN _action := 'STATUS_CHANGED'; END IF;
    _has_audited_changes := TRUE;
  END IF;

  -- 10. Job Handover / Completion
  IF (OLD.is_finished IS DISTINCT FROM NEW.is_finished AND NEW.is_finished = TRUE) 
     OR (OLD.completed_at IS DISTINCT FROM NEW.completed_at AND NEW.completed_at IS NOT NULL) THEN
    _changed := _changed || jsonb_build_object('is_finished', jsonb_build_object('old', OLD.is_finished, 'new', NEW.is_finished));
    _old_vals := _old_vals || jsonb_build_object('is_finished', OLD.is_finished);
    _new_vals := _new_vals || jsonb_build_object('is_finished', NEW.is_finished);
    IF _action = 'UPDATE' THEN _action := 'JOB_COMPLETED'; END IF;
    _has_audited_changes := TRUE;
  END IF;

  -- Only write audit log if a sensitive / compliance column changed
  IF _has_audited_changes THEN
    INSERT INTO public.audit_logs (
      branch_id, entity_type, entity_id, vehicle_no, action,
      actor_id, actor_email, actor_name, actor_role,
      changed_fields, old_values, new_values
    ) VALUES (
      NEW.branch_id, 'vehicle', NEW.id, NEW.vehicle_no, _action,
      _actor_id, _actor_email, COALESCE(_actor_name, 'Staff'), COALESCE(_actor_role, 'staff'),
      _changed, _old_vals, _new_vals
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger for INSERT, UPDATE, and DELETE
DROP TRIGGER IF EXISTS trg_audit_vehicle_changes ON public.vehicles;
CREATE TRIGGER trg_audit_vehicle_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION audit_vehicle_changes_trigger();


-- 2. VEHICLE TASKS AUDIT TRIGGER (Mechanic Check-offs)
CREATE OR REPLACE FUNCTION audit_task_changes_trigger()
RETURNS TRIGGER AS $$
DECLARE
  _v_no VARCHAR(50);
  _branch_id VARCHAR(50);
  _actor_id UUID := auth.uid();
  _actor_email VARCHAR(255);
  _actor_name VARCHAR(255);
  _actor_role VARCHAR(50);
BEGIN
  -- Extract vehicle details
  SELECT vehicle_no, branch_id INTO _v_no, _branch_id
  FROM public.vehicles
  WHERE id = NEW.vehicle_id;

  IF _actor_id IS NOT NULL THEN
    SELECT display_name, role, email
    INTO _actor_name, _actor_role, _actor_email
    FROM public.user_profiles
    WHERE id = _actor_id;
  END IF;

  IF OLD.is_completed IS DISTINCT FROM NEW.is_completed AND NEW.is_completed = TRUE THEN
    INSERT INTO public.audit_logs (
      branch_id, entity_type, entity_id, vehicle_no, action,
      actor_id, actor_email, actor_name, actor_role,
      changed_fields, old_values, new_values
    ) VALUES (
      COALESCE(_branch_id, 'peliyagoda_sec5'), 'task', NEW.id, _v_no, 'TASK_COMPLETED',
      _actor_id, _actor_email, COALESCE(_actor_name, NEW.completed_by, 'Mechanic'), COALESCE(_actor_role, 'foreman'),
      jsonb_build_object(
        'task_name', jsonb_build_object('old', null, 'new', NEW.task_name),
        'completed_by', jsonb_build_object('old', null, 'new', COALESCE(_actor_name, NEW.completed_by, 'Mechanic'))
      ),
      jsonb_build_object('is_completed', OLD.is_completed),
      jsonb_build_object('is_completed', NEW.is_completed, 'task_name', NEW.task_name)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_task_changes ON public.vehicle_tasks;
CREATE TRIGGER trg_audit_task_changes
  AFTER UPDATE ON public.vehicle_tasks
  FOR EACH ROW EXECUTE FUNCTION audit_task_changes_trigger();


-- 3. USER PROFILE & ROLE AUDIT TRIGGER
CREATE OR REPLACE FUNCTION audit_user_profile_changes_trigger()
RETURNS TRIGGER AS $$
DECLARE
  _actor_id UUID := auth.uid();
  _actor_email VARCHAR(255);
  _actor_name VARCHAR(255);
  _actor_role VARCHAR(50);
BEGIN
  IF _actor_id IS NOT NULL THEN
    SELECT display_name, role, email
    INTO _actor_name, _actor_role, _actor_email
    FROM public.user_profiles
    WHERE id = _actor_id;
  END IF;

  IF OLD.role IS DISTINCT FROM NEW.role OR OLD.display_name IS DISTINCT FROM NEW.display_name THEN
    INSERT INTO public.audit_logs (
      branch_id, entity_type, entity_id, vehicle_no, action,
      actor_id, actor_email, actor_name, actor_role,
      changed_fields, old_values, new_values
    ) VALUES (
      COALESCE(NEW.branch_id, 'peliyagoda_sec5'), 'user', NEW.id, NULL, 'USER_ROLE_CHANGED',
      _actor_id, _actor_email, COALESCE(_actor_name, 'Admin'), COALESCE(_actor_role, 'super_admin'),
      jsonb_build_object(
        'role', jsonb_build_object('old', OLD.role, 'new', NEW.role),
        'display_name', jsonb_build_object('old', OLD.display_name, 'new', NEW.display_name)
      ),
      jsonb_build_object('role', OLD.role, 'display_name', OLD.display_name),
      jsonb_build_object('role', NEW.role, 'display_name', NEW.display_name)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_user_profile_changes ON public.user_profiles;
CREATE TRIGGER trg_audit_user_profile_changes
  AFTER UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION audit_user_profile_changes_trigger();


-- 4. CLEAN, SINGLE DEFINITION FOR get_audit_logs_paginated WITH CATEGORY FILTER
CREATE OR REPLACE FUNCTION get_audit_logs_paginated(
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
  RETURN QUERY
  WITH filtered AS (
    SELECT a.*
    FROM public.audit_logs a
    WHERE (p_branch_id IS NULL OR p_branch_id = 'all' OR a.branch_id = p_branch_id)
      AND (p_start_date IS NULL OR a.created_at >= p_start_date)
      AND (p_end_date IS NULL OR a.created_at <= p_end_date)
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
