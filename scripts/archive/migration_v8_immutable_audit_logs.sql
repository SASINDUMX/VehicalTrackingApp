-- ============================================================================
-- UNITED MOTORS VEHICLE TRACKING - INDUSTRIAL ARCHITECTURE MIGRATION V8
-- IMMUTABLE ADMINISTRATIVE AUDIT LOG & TRIGGER (WARRANTY & COMPLIANCE)
-- ============================================================================

-- 1. Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    branch_id VARCHAR(50) NOT NULL REFERENCES public.workplaces(id) ON DELETE CASCADE,
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

-- 2. Performance Indexes (Pushing heavy lifting to PostgreSQL engine)
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_id ON public.audit_logs (branch_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_vehicle_no ON public.audit_logs (vehicle_no);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON public.audit_logs (entity_id);

-- 3. Immutability Enforcer (Prevents tampering, updating, or deleting audit entries)
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

-- 4. Row-Level Security (RLS)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select_super_admin_only" ON public.audit_logs;
CREATE POLICY "audit_logs_select_super_admin_only" ON public.audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles 
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- No public INSERT, UPDATE, or DELETE policies — writes only happen via SECURITY DEFINER trigger.

-- 5. PostgreSQL Vehicle Audit Trigger Function
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
  
  -- Extract actor profile info
  IF _actor_id IS NOT NULL THEN
    SELECT email, display_name, role
    INTO _actor_email, _actor_name, _actor_role
    FROM public.user_profiles
    WHERE id = _actor_id;
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
  
  -- 1. License Plate Modification (Crucial for Legal & Warranty Traceability)
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

  -- 5. Bay / Zone Transfers
  IF OLD.current_zone IS DISTINCT FROM NEW.current_zone THEN
    _changed := _changed || jsonb_build_object('current_zone', jsonb_build_object('old', OLD.current_zone, 'new', NEW.current_zone));
    _old_vals := _old_vals || jsonb_build_object('current_zone', OLD.current_zone);
    _new_vals := _new_vals || jsonb_build_object('current_zone', NEW.current_zone);
    IF _action = 'UPDATE' THEN _action := 'BAY_TRANSFERRED'; END IF;
    _has_audited_changes := TRUE;
  END IF;

  -- 6. Assigned Technician Reassignment
  IF OLD.assigned_tech IS DISTINCT FROM NEW.assigned_tech THEN
    _changed := _changed || jsonb_build_object('assigned_tech', jsonb_build_object('old', OLD.assigned_tech, 'new', NEW.assigned_tech));
    _old_vals := _old_vals || jsonb_build_object('assigned_tech', OLD.assigned_tech);
    _new_vals := _new_vals || jsonb_build_object('assigned_tech', NEW.assigned_tech);
    IF _action = 'UPDATE' THEN _action := 'TECH_REASSIGNED'; END IF;
    _has_audited_changes := TRUE;
  END IF;

  -- 7. Job Finished / Handed Over
  IF OLD.is_finished IS DISTINCT FROM NEW.is_finished AND NEW.is_finished = TRUE THEN
    _changed := _changed || jsonb_build_object('is_finished', jsonb_build_object('old', OLD.is_finished, 'new', NEW.is_finished));
    _old_vals := _old_vals || jsonb_build_object('is_finished', OLD.is_finished);
    _new_vals := _new_vals || jsonb_build_object('is_finished', NEW.is_finished);
    IF _action = 'UPDATE' THEN _action := 'JOB_COMPLETED'; END IF;
    _has_audited_changes := TRUE;
  END IF;

  -- 8. Booking Flag or Additional Repairs Changed
  IF OLD.is_booking IS DISTINCT FROM NEW.is_booking OR OLD.has_additional_repairs IS DISTINCT FROM NEW.has_additional_repairs THEN
    _changed := _changed || jsonb_build_object(
      'is_booking', jsonb_build_object('old', OLD.is_booking, 'new', NEW.is_booking),
      'has_additional_repairs', jsonb_build_object('old', OLD.has_additional_repairs, 'new', NEW.has_additional_repairs)
    );
    _old_vals := _old_vals || jsonb_build_object('is_booking', OLD.is_booking, 'has_additional_repairs', OLD.has_additional_repairs);
    _new_vals := _new_vals || jsonb_build_object('is_booking', NEW.is_booking, 'has_additional_repairs', NEW.has_additional_repairs);
    IF _action = 'UPDATE' THEN _action := 'BOOKING_METADATA_MODIFIED'; END IF;
    _has_audited_changes := TRUE;
  END IF;

  -- Only record into audit_logs if audited columns were modified!
  -- Benign timer changes (e.g. paused_seconds, updated_at) are filtered out to keep logs high-value and compact.
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

-- 6. Attach Trigger to vehicles table
DROP TRIGGER IF EXISTS trg_audit_vehicle_changes ON public.vehicles;
CREATE TRIGGER trg_audit_vehicle_changes
  AFTER UPDATE OR DELETE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION audit_vehicle_changes_trigger();
