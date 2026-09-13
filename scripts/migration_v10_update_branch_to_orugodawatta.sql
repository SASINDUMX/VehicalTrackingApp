-- ==============================================================================
-- UNITED MOTORS INDUSTRIAL ARCHITECTURE: MIGRATION V10
-- Master Workplace Transition: Peliyagoda -> Orugodawatta & Database Hardening
-- ==============================================================================

-- 1. Safely update old codes first to avoid UNIQUE (code) collisions
UPDATE public.workplaces
SET code = 'OLD_' || code
WHERE id IN ('peliyagoda_sec5', 'peliyagoda_sec2');

-- 2. Upsert the Orugodawatta workplaces into the master directory
INSERT INTO public.workplaces (id, name, code, city)
VALUES 
  ('orugodawatta_sec5', 'United Motors - Orugodawatta (Section 5)', 'SEC 5', 'Orugodawatta'),
  ('orugodawatta_sec2', 'United Motors - Orugodawatta (Section 2)', 'SEC 2', 'Orugodawatta'),
  ('ratmalana', 'United Motors - Ratmalana', 'RTM', 'Ratmalana')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  city = EXCLUDED.city;

-- 3. Migrate operational tables from peliyagoda to orugodawatta
UPDATE public.vehicles
SET branch_id = 'orugodawatta_sec5'
WHERE branch_id = 'peliyagoda_sec5';

UPDATE public.vehicles
SET branch_id = 'orugodawatta_sec2'
WHERE branch_id = 'peliyagoda_sec2';

UPDATE public.stage_logs
SET branch_id = 'orugodawatta_sec5'
WHERE branch_id = 'peliyagoda_sec5';

UPDATE public.stage_logs
SET branch_id = 'orugodawatta_sec2'
WHERE branch_id = 'peliyagoda_sec2';

UPDATE public.user_profiles
SET branch_id = 'orugodawatta_sec5'
WHERE branch_id = 'peliyagoda_sec5';

UPDATE public.user_profiles
SET branch_id = 'orugodawatta_sec2'
WHERE branch_id = 'peliyagoda_sec2';

-- 4. Safely migrate audit_logs (temporarily dropping immutability trigger)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
    DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;

    UPDATE public.audit_logs
    SET branch_id = 'orugodawatta_sec5'
    WHERE branch_id = 'peliyagoda_sec5';

    UPDATE public.audit_logs
    SET branch_id = 'orugodawatta_sec2'
    WHERE branch_id = 'peliyagoda_sec2';

    CREATE TRIGGER trg_audit_logs_immutable
      BEFORE UPDATE OR DELETE ON public.audit_logs
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_tampering();
  END IF;
END $$;

-- 5. Delete obsolete peliyagoda records (all foreign keys now reference orugodawatta)
DELETE FROM public.workplaces WHERE id IN ('peliyagoda_sec5', 'peliyagoda_sec2');

-- 6. Update table column defaults
ALTER TABLE public.vehicles 
  ALTER COLUMN branch_id SET DEFAULT 'orugodawatta_sec5';

ALTER TABLE public.stage_logs 
  ALTER COLUMN branch_id SET DEFAULT 'orugodawatta_sec5';

ALTER TABLE public.user_profiles 
  ALTER COLUMN branch_id SET DEFAULT 'orugodawatta_sec5';

-- 7. Add branch_id to vehicle_tasks for high-performance multi-tenant CDC isolation
ALTER TABLE public.vehicle_tasks
  ADD COLUMN IF NOT EXISTS branch_id VARCHAR(50) DEFAULT 'orugodawatta_sec5' REFERENCES public.workplaces(id) ON DELETE CASCADE;

-- Backfill existing vehicle_tasks with vehicle branch_id
UPDATE public.vehicle_tasks t
SET branch_id = v.branch_id
FROM public.vehicles v
WHERE t.vehicle_id = v.id AND (t.branch_id IS NULL OR t.branch_id = '');

-- Auto-propagate branch_id on new vehicle_tasks insertion
CREATE OR REPLACE FUNCTION set_vehicle_task_branch_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.branch_id IS NULL THEN
    SELECT branch_id INTO NEW.branch_id FROM public.vehicles WHERE id = NEW.vehicle_id;
    IF NEW.branch_id IS NULL THEN
      NEW.branch_id := 'orugodawatta_sec5';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_vehicle_task_branch_id ON public.vehicle_tasks;
CREATE TRIGGER trg_set_vehicle_task_branch_id
  BEFORE INSERT ON public.vehicle_tasks
  FOR EACH ROW EXECUTE FUNCTION set_vehicle_task_branch_id();

-- 8. Update stored procedures with correct bay_zone enums and new branch default
CREATE OR REPLACE FUNCTION intake_vehicle(
  p_vehicle_no TEXT,
  p_target_zone bay_zone DEFAULT 'workshop',
  p_technician_name TEXT DEFAULT NULL,
  p_remarks TEXT DEFAULT '',
  p_is_booking BOOLEAN DEFAULT FALSE,
  p_has_additional_repairs BOOLEAN DEFAULT FALSE,
  p_is_urgent BOOLEAN DEFAULT FALSE,
  p_urgent_note TEXT DEFAULT NULL,
  p_tasks JSONB DEFAULT '[]'::JSONB,
  p_branch_id VARCHAR(50) DEFAULT 'orugodawatta_sec5'
)
RETURNS JSONB AS $$
DECLARE
  v_clean_no TEXT := UPPER(TRIM(p_vehicle_no));
  v_branch VARCHAR(50) := COALESCE(NULLIF(TRIM(p_branch_id), ''), 'orugodawatta_sec5');
  v_vid UUID;
  v_lid UUID;
  v_now TIMESTAMPTZ := NOW();
  v_task JSONB;
BEGIN
  IF v_clean_no = '' THEN RAISE EXCEPTION 'Vehicle plate cannot be empty'; END IF;

  INSERT INTO vehicles (
    vehicle_no, current_zone, technician_name, remarks,
    is_booking, has_additional_repairs, is_urgent, urgent_note,
    intake_at, status, branch_id, is_finished
  ) VALUES (
    v_clean_no, p_target_zone, p_technician_name, p_remarks,
    p_is_booking, p_has_additional_repairs, p_is_urgent,
    CASE WHEN p_is_urgent THEN NULLIF(TRIM(p_urgent_note), '') ELSE NULL END,
    v_now, 'active', v_branch, FALSE
  ) RETURNING id INTO v_vid;

  INSERT INTO stage_logs (
    vehicle_id, from_zone, to_zone, visit_number,
    entered_at, moved_by, branch_id, technician_name
  ) VALUES (
    v_vid, NULL, p_target_zone, 1,
    v_now, 'Intake Supervisor', v_branch, p_technician_name
  ) RETURNING id INTO v_lid;

  IF p_tasks IS NOT NULL AND jsonb_array_length(p_tasks) > 0 THEN
    FOR v_task IN SELECT * FROM jsonb_array_elements(p_tasks) LOOP
      INSERT INTO vehicle_tasks (vehicle_id, branch_id, task_name, task_type, is_required, is_completed)
      VALUES (
        v_vid,
        v_branch,
        (v_task->>'task_name')::TEXT, 
        (v_task->>'task_type')::task_type, 
        COALESCE((v_task->>'is_required')::BOOLEAN, TRUE), 
        FALSE
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true, 'vehicle_id', v_vid, 'log_id', v_lid, 'branch_id', v_branch);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION transfer_vehicle_zone(
  p_vehicle_id UUID,
  p_to_zone bay_zone,
  p_moved_by TEXT DEFAULT 'Staff'
)
RETURNS JSONB AS $$
DECLARE
  v_from_zone bay_zone;
  v_branch_id VARCHAR(50);
  v_active_log_id UUID;
  v_entered_at TIMESTAMPTZ;
  v_work_started_at TIMESTAMPTZ;
  v_work_completed_at TIMESTAMPTZ;
  v_duration INT := 0;
  v_idle INT := 0;
  v_active INT := 0;
  v_break INT := 0;
  v_pass_count INT := 1;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT current_zone, branch_id 
  INTO v_from_zone, v_branch_id 
  FROM vehicles 
  WHERE id = p_vehicle_id;

  IF v_from_zone IS NULL THEN
    RAISE EXCEPTION 'Vehicle % not found', p_vehicle_id;
  END IF;

  -- Close active log
  SELECT id, entered_at, work_started_at, work_completed_at
  INTO v_active_log_id, v_entered_at, v_work_started_at, v_work_completed_at
  FROM stage_logs
  WHERE vehicle_id = p_vehicle_id AND exited_at IS NULL
  ORDER BY entered_at DESC LIMIT 1;

  IF v_active_log_id IS NOT NULL THEN
    v_duration := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_entered_at))::INT);
    v_break := calculate_break_overlap_seconds(v_entered_at, v_now);
    
    IF v_work_started_at IS NOT NULL THEN
      IF v_work_completed_at IS NOT NULL THEN
        v_active := GREATEST(0, EXTRACT(EPOCH FROM (v_work_completed_at - v_work_started_at))::INT);
      ELSE
        v_active := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_work_started_at))::INT);
      END IF;
      v_idle := GREATEST(0, v_duration - v_active - v_break);
    ELSE
      v_idle := v_duration;
      v_active := 0;
    END IF;

    UPDATE stage_logs
    SET exited_at = v_now,
        work_completed_at = COALESCE(work_completed_at, v_now),
        duration_seconds = v_duration,
        active_seconds = v_active,
        idle_seconds = v_idle,
        break_seconds = v_break
    WHERE id = v_active_log_id;
  END IF;

  -- Increment pass number for target bay
  SELECT COUNT(*) + 1 INTO v_pass_count 
  FROM stage_logs 
  WHERE vehicle_id = p_vehicle_id AND to_zone = p_to_zone;

  -- Open new stage log inheriting branch_id
  INSERT INTO stage_logs (
    vehicle_id, from_zone, to_zone, visit_number,
    entered_at, moved_by, branch_id
  ) VALUES (
    p_vehicle_id, v_from_zone, p_to_zone, v_pass_count,
    v_now, p_moved_by, COALESCE(v_branch_id, 'orugodawatta_sec5')
  );

  -- Update vehicle current station
  UPDATE vehicles
  SET current_zone = p_to_zone,
      effective_completed_at = CASE WHEN p_to_zone = 'inspection' AND effective_completed_at IS NULL THEN v_now ELSE effective_completed_at END
  WHERE id = p_vehicle_id;

  RETURN jsonb_build_object('success', true, 'to_zone', p_to_zone, 'pass', v_pass_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reconcile_daily_vehicles(p_branch_id VARCHAR(50) DEFAULT 'orugodawatta_sec5')
RETURNS JSONB AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_start_of_today TIMESTAMPTZ := (v_now AT TIME ZONE 'Asia/Colombo')::DATE::TIMESTAMPTZ AT TIME ZONE 'Asia/Colombo';
  v_completed_count INT := 0;
  v_deleted_count INT := 0;
  v_rec RECORD;
BEGIN
  -- 1. Auto-complete leftover inspection vehicles from previous days with frozen metrics for this branch
  FOR v_rec IN 
    SELECT id FROM vehicles 
    WHERE is_finished = FALSE 
      AND current_zone = 'inspection' 
      AND intake_at < v_start_of_today 
      AND branch_id = p_branch_id
  LOOP
    PERFORM finish_vehicle_job(v_rec.id, 'Midnight Auto-Reconcile');
    v_completed_count := v_completed_count + 1;
  END LOOP;

  -- 2. Auto-complete vehicles stranded in bays from previous days (ONLY if not paused/on-hold)
  FOR v_rec IN 
    SELECT id FROM vehicles 
    WHERE is_finished = FALSE 
      AND current_zone != 'inspection' 
      AND is_paused = FALSE 
      AND status != 'on_hold' 
      AND intake_at < v_start_of_today 
      AND branch_id = p_branch_id
  LOOP
    PERFORM finish_vehicle_job(v_rec.id, 'Midnight Auto-Reconcile (Unpaused Overnight)');
    v_completed_count := v_completed_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'reconciled_at', v_now,
    'branch_id', p_branch_id,
    'completed_count', v_completed_count,
    'deleted_count', v_deleted_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
