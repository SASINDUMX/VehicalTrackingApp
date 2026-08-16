-- ==============================================================================
-- Migration v2: Security and Performance Improvements
-- ==============================================================================
-- This migration script enhances the database by replacing wide-open RLS policies
-- with authenticated-only policies, creating necessary indexes for performance,
-- and introducing atomic RPCs for critical operations.
-- ==============================================================================

-- ==============================================================================
-- 1. DROP old wide-open RLS policies and create proper ones
-- ==============================================================================

-- Drop old policies
DROP POLICY IF EXISTS "Allow public full access to vehicles" ON vehicles;
DROP POLICY IF EXISTS "Allow public full access to vehicle_tasks" ON vehicle_tasks;
DROP POLICY IF EXISTS "Allow public full access to stage_logs" ON stage_logs;

-- Vehicles: authenticated users can read all, only supervisors can insert
CREATE POLICY "Authenticated users can read vehicles" ON vehicles
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert vehicles" ON vehicles
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update vehicles" ON vehicles
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Vehicle tasks: authenticated users can read all, update tasks
CREATE POLICY "Authenticated users can read tasks" ON vehicle_tasks
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert tasks" ON vehicle_tasks
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update tasks" ON vehicle_tasks
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Stage logs: authenticated users can read all, insert/update logs
CREATE POLICY "Authenticated users can read logs" ON stage_logs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert logs" ON stage_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update logs" ON stage_logs
  FOR UPDATE USING (auth.role() = 'authenticated');


-- ==============================================================================
-- 2. Create missing database indexes
-- ==============================================================================

-- Foreign key indexes for fast JOINs and CASCADE deletes
CREATE INDEX IF NOT EXISTS idx_vehicle_tasks_vehicle_id ON vehicle_tasks(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_stage_logs_vehicle_id ON stage_logs(vehicle_id);

-- Sort optimization indexes
CREATE INDEX IF NOT EXISTS idx_vehicles_created_at ON vehicles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stage_logs_entered_at ON stage_logs(entered_at);

-- Partial index for active stage log lookup (critical for zone transfers)
CREATE INDEX IF NOT EXISTS idx_stage_logs_active ON stage_logs(vehicle_id) WHERE exited_at IS NULL;


-- ==============================================================================
-- 3. Create atomic RPC for zone transfers
-- ==============================================================================

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
  v_duration INT;
  v_new_log_id UUID;
BEGIN
  -- Get current zone
  SELECT current_zone INTO v_from_zone FROM vehicles WHERE id = p_vehicle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found: %', p_vehicle_id;
  END IF;

  -- Close active stage log
  SELECT id, entered_at INTO v_active_log_id, v_entered_at
  FROM stage_logs
  WHERE vehicle_id = p_vehicle_id AND exited_at IS NULL
  ORDER BY entered_at DESC
  LIMIT 1;

  IF v_active_log_id IS NOT NULL THEN
    v_duration := EXTRACT(EPOCH FROM (NOW() - v_entered_at))::INT;
    UPDATE stage_logs
    SET exited_at = NOW(), duration_seconds = v_duration
    WHERE id = v_active_log_id;
  END IF;

  -- Insert new stage log
  INSERT INTO stage_logs (vehicle_id, from_zone, to_zone, entered_at, moved_by)
  VALUES (p_vehicle_id, v_from_zone, p_to_zone, NOW(), p_moved_by)
  RETURNING id INTO v_new_log_id;

  -- Update vehicle current zone
  UPDATE vehicles SET current_zone = p_to_zone WHERE id = p_vehicle_id;

  RETURN jsonb_build_object(
    'success', true,
    'from_zone', v_from_zone,
    'to_zone', p_to_zone,
    'new_log_id', v_new_log_id,
    'duration_seconds', COALESCE(v_duration, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==============================================================================
-- 4. Create atomic RPC for task toggling
-- ==============================================================================

CREATE OR REPLACE FUNCTION toggle_task_completion(
  p_task_id UUID,
  p_completed_by TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_current_state BOOLEAN;
  v_new_state BOOLEAN;
BEGIN
  -- Lock the row to prevent concurrent updates
  SELECT is_completed INTO v_current_state
  FROM vehicle_tasks WHERE id = p_task_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;

  v_new_state := NOT v_current_state;

  UPDATE vehicle_tasks
  SET is_completed = v_new_state,
      completed_at = CASE WHEN v_new_state THEN NOW() ELSE NULL END,
      completed_by = CASE WHEN v_new_state THEN p_completed_by ELSE NULL END
  WHERE id = p_task_id;

  RETURN jsonb_build_object(
    'success', true,
    'is_completed', v_new_state,
    'completed_at', CASE WHEN v_new_state THEN NOW() ELSE NULL END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==============================================================================
-- 5. Create atomic RPC for finishing a vehicle job sheet
-- ==============================================================================

CREATE OR REPLACE FUNCTION finish_vehicle_job(
  p_vehicle_id UUID,
  p_advisor_name TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_active_log_id UUID;
  v_entered_at TIMESTAMPTZ;
  v_duration INT;
BEGIN
  -- Close active stage log
  SELECT id, entered_at INTO v_active_log_id, v_entered_at
  FROM stage_logs
  WHERE vehicle_id = p_vehicle_id AND exited_at IS NULL
  ORDER BY entered_at DESC
  LIMIT 1;

  IF v_active_log_id IS NOT NULL THEN
    v_duration := EXTRACT(EPOCH FROM (NOW() - v_entered_at))::INT;
    UPDATE stage_logs
    SET exited_at = NOW(), duration_seconds = v_duration
    WHERE id = v_active_log_id;
  END IF;

  -- Insert final completed stage log
  INSERT INTO stage_logs (vehicle_id, from_zone, to_zone, entered_at, exited_at, duration_seconds, moved_by)
  VALUES (p_vehicle_id, 'inspection', 'completed', NOW(), NOW(), 0, p_advisor_name);

  -- Mark vehicle as finished
  UPDATE vehicles
  SET current_zone = 'completed',
      is_finished = true,
      completed_at = NOW()
  WHERE id = p_vehicle_id;

  RETURN jsonb_build_object(
    'success', true,
    'completed_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
