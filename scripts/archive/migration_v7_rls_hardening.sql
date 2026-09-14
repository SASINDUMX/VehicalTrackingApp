-- ============================================================================
-- UNITED MOTORS VEHICLE TRACKING - INDUSTRIAL ARCHITECTURE MIGRATION V7
-- ROW-LEVEL SECURITY (RLS) HARDENING & TENANT DATA ISOLATION
-- ============================================================================

-- 1. Helper functions to determine authenticated user's branch and executive privileges
CREATE OR REPLACE FUNCTION get_current_user_branch()
RETURNS VARCHAR(50) AS $$
  SELECT branch_id FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_manager_or_executive()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE id = auth.uid() 
      AND role IN ('agm', 'workshop_manager', 'service_executive')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. Drop existing permissive policies
DROP POLICY IF EXISTS "Allow public full access to vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Allow public full access to stage_logs" ON public.stage_logs;
DROP POLICY IF EXISTS "Allow public full access to vehicle_tasks" ON public.vehicle_tasks;
DROP POLICY IF EXISTS "vehicles_branch_isolation_select" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_branch_isolation_insert" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_branch_isolation_update" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_branch_isolation_delete" ON public.vehicles;
DROP POLICY IF EXISTS "stage_logs_branch_isolation_select" ON public.stage_logs;
DROP POLICY IF EXISTS "stage_logs_branch_isolation_insert" ON public.stage_logs;
DROP POLICY IF EXISTS "stage_logs_branch_isolation_update" ON public.stage_logs;
DROP POLICY IF EXISTS "stage_logs_branch_isolation_delete" ON public.stage_logs;
DROP POLICY IF EXISTS "vehicle_tasks_branch_isolation_select" ON public.vehicle_tasks;
DROP POLICY IF EXISTS "vehicle_tasks_branch_isolation_insert" ON public.vehicle_tasks;
DROP POLICY IF EXISTS "vehicle_tasks_branch_isolation_update" ON public.vehicle_tasks;
DROP POLICY IF EXISTS "vehicle_tasks_branch_isolation_delete" ON public.vehicle_tasks;

-- 3. VEHICLES RLS: Enforce branch-level isolation
CREATE POLICY "vehicles_branch_isolation_select" ON public.vehicles
  FOR SELECT USING (
    is_manager_or_executive()
    OR branch_id = get_current_user_branch()
    OR auth.uid() IS NULL
  );

CREATE POLICY "vehicles_branch_isolation_insert" ON public.vehicles
  FOR INSERT WITH CHECK (
    is_manager_or_executive()
    OR branch_id = get_current_user_branch()
    OR auth.uid() IS NULL
  );

CREATE POLICY "vehicles_branch_isolation_update" ON public.vehicles
  FOR UPDATE USING (
    is_manager_or_executive()
    OR branch_id = get_current_user_branch()
    OR auth.uid() IS NULL
  ) WITH CHECK (
    is_manager_or_executive()
    OR branch_id = get_current_user_branch()
    OR auth.uid() IS NULL
  );

CREATE POLICY "vehicles_branch_isolation_delete" ON public.vehicles
  FOR DELETE USING (
    is_manager_or_executive()
    OR branch_id = get_current_user_branch()
    OR auth.uid() IS NULL
  );

-- 4. STAGE LOGS RLS: Enforce branch-level isolation
CREATE POLICY "stage_logs_branch_isolation_select" ON public.stage_logs
  FOR SELECT USING (
    is_manager_or_executive()
    OR branch_id = get_current_user_branch()
    OR auth.uid() IS NULL
  );

CREATE POLICY "stage_logs_branch_isolation_insert" ON public.stage_logs
  FOR INSERT WITH CHECK (
    is_manager_or_executive()
    OR branch_id = get_current_user_branch()
    OR auth.uid() IS NULL
  );

CREATE POLICY "stage_logs_branch_isolation_update" ON public.stage_logs
  FOR UPDATE USING (
    is_manager_or_executive()
    OR branch_id = get_current_user_branch()
    OR auth.uid() IS NULL
  ) WITH CHECK (
    is_manager_or_executive()
    OR branch_id = get_current_user_branch()
    OR auth.uid() IS NULL
  );

CREATE POLICY "stage_logs_branch_isolation_delete" ON public.stage_logs
  FOR DELETE USING (
    is_manager_or_executive()
    OR branch_id = get_current_user_branch()
    OR auth.uid() IS NULL
  );

-- 5. VEHICLE TASKS RLS: Enforce branch-level isolation via vehicle relationship
CREATE POLICY "vehicle_tasks_branch_isolation_select" ON public.vehicle_tasks
  FOR SELECT USING (
    is_manager_or_executive()
    OR EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_tasks.vehicle_id
        AND (v.branch_id = get_current_user_branch() OR is_manager_or_executive())
    )
    OR auth.uid() IS NULL
  );

CREATE POLICY "vehicle_tasks_branch_isolation_insert" ON public.vehicle_tasks
  FOR INSERT WITH CHECK (
    is_manager_or_executive()
    OR EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_tasks.vehicle_id
        AND (v.branch_id = get_current_user_branch() OR is_manager_or_executive())
    )
    OR auth.uid() IS NULL
  );

CREATE POLICY "vehicle_tasks_branch_isolation_update" ON public.vehicle_tasks
  FOR UPDATE USING (
    is_manager_or_executive()
    OR EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_tasks.vehicle_id
        AND (v.branch_id = get_current_user_branch() OR is_manager_or_executive())
    )
    OR auth.uid() IS NULL
  );

CREATE POLICY "vehicle_tasks_branch_isolation_delete" ON public.vehicle_tasks
  FOR DELETE USING (
    is_manager_or_executive()
    OR EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_tasks.vehicle_id
        AND (v.branch_id = get_current_user_branch() OR is_manager_or_executive())
    )
    OR auth.uid() IS NULL
  );

-- 6. WORKPLACES RLS: Public read for workplace directory to populate switchers
ALTER TABLE public.workplaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public full access to workplaces" ON public.workplaces;
DROP POLICY IF EXISTS "workplaces_select_all" ON public.workplaces;
CREATE POLICY "workplaces_select_all" ON public.workplaces FOR SELECT USING (true);
