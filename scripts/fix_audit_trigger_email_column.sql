-- ==============================================================================
-- IMMEDIATE FIX FOR: column "email" does not exist (Error code: 42703)
-- ==============================================================================
-- Run this in Supabase Dashboard -> SQL Editor (project: eeoyfrhmgarocecphcky)
-- Fixes:
-- 1. "Hold for Major Repair" failure
-- 2. "transfer_vehicle_zone" 400 Bad Request
-- 3. Any vehicle update / PATCH failure
-- ==============================================================================

-- Step 1: Add the missing 'email' column to user_profiles
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Step 2: Backfill emails from auth.users into user_profiles
UPDATE public.user_profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id;

-- Step 3: Update the vehicle audit trigger function to be completely resilient
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

  -- A. Deletion
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

  -- B. Sensitive Column Checks on UPDATE:
  
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

  -- 5. Section Transfer
  IF OLD.current_zone IS DISTINCT FROM NEW.current_zone THEN
    _changed := _changed || jsonb_build_object('current_zone', jsonb_build_object('old', OLD.current_zone, 'new', NEW.current_zone));
    _old_vals := _old_vals || jsonb_build_object('current_zone', OLD.current_zone);
    _new_vals := _new_vals || jsonb_build_object('current_zone', NEW.current_zone);
    IF _action = 'UPDATE' THEN _action := 'SECTION_TRANSFER'; END IF;
    _has_audited_changes := TRUE;
  END IF;

  -- 6. Technician Reassignment
  IF OLD.technician_name IS DISTINCT FROM NEW.technician_name THEN
    _changed := _changed || jsonb_build_object('technician_name', jsonb_build_object('old', OLD.technician_name, 'new', NEW.technician_name));
    _old_vals := _old_vals || jsonb_build_object('technician_name', OLD.technician_name);
    _new_vals := _new_vals || jsonb_build_object('technician_name', NEW.technician_name);
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

  -- 10. Completed At
  IF OLD.completed_at IS DISTINCT FROM NEW.completed_at THEN
    _changed := _changed || jsonb_build_object('completed_at', jsonb_build_object('old', OLD.completed_at, 'new', NEW.completed_at));
    _old_vals := _old_vals || jsonb_build_object('completed_at', OLD.completed_at);
    _new_vals := _new_vals || jsonb_build_object('completed_at', NEW.completed_at);
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
