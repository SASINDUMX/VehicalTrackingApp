-- ==============================================================================
-- UNITED MOTORS VEHICLE TRACKING - INDUSTRIAL RBAC SECURITY GUARDS (V11)
-- 
-- 1. Centralized Helper: public.is_super_admin()
-- 2. Audit RPC Guard: Enforces Super Admin restriction inside get_audit_logs_paginated
-- 3. Audit Logs Table RLS: Direct SELECT blocked for non-super-admins
-- 4. Branch Isolation Guard: Non-admins cannot query or switch across unassigned branches
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CENTRALIZED RBAC ROLE HELPER FUNCTIONS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_current_user_branch()
RETURNS VARCHAR(50) AS $$
  SELECT branch_id FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- ------------------------------------------------------------------------------
-- 2. SECURE AUDIT LOG RPC (Defense-in-Depth Guard)
-- ------------------------------------------------------------------------------
-- Even if an attacker directly executes this RPC from browser DevTools,
-- the function asserts Super Admin privilege before returning any data.
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
  -- STRICT BACKEND RBAC ASSERTION:
  -- Only Super Administrators are permitted to query compliance audit logs.
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access Denied: Only Super Administrators have permission to access the Activity & Audit Log.'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

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


-- ------------------------------------------------------------------------------
-- 3. AUDIT LOGS TABLE RLS POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Block direct SELECT for all users except Super Admins
DROP POLICY IF EXISTS "audit_logs_select_super_admin_only" ON public.audit_logs;
CREATE POLICY "audit_logs_select_super_admin_only" ON public.audit_logs
  FOR SELECT USING (
    public.is_super_admin()
  );

-- Direct INSERT/UPDATE/DELETE from client is forbidden (writes must happen via server triggers)
DROP POLICY IF EXISTS "audit_logs_client_mutation_block" ON public.audit_logs;
CREATE POLICY "audit_logs_client_mutation_block" ON public.audit_logs
  FOR INSERT WITH CHECK (false);


-- ------------------------------------------------------------------------------
-- 4. BRANCH ISOLATION SECURITY
-- ------------------------------------------------------------------------------
-- Non-admins can only see vehicles for their assigned branch.
-- Super Admins can query and monitor across all company branches.
DROP POLICY IF EXISTS "vehicles_branch_isolation" ON public.vehicles;
CREATE POLICY "vehicles_branch_isolation" ON public.vehicles
  FOR ALL USING (
    public.is_super_admin() 
    OR branch_id = public.get_current_user_branch()
  );

-- Non-admins cannot see stage logs of other branches
DROP POLICY IF EXISTS "stage_logs_branch_isolation" ON public.stage_logs;
CREATE POLICY "stage_logs_branch_isolation" ON public.stage_logs
  FOR ALL USING (
    public.is_super_admin()
    OR branch_id = public.get_current_user_branch()
    OR branch_id IS NULL
  );

-- Non-admins cannot query user profiles from outside their branch (except admins)
DROP POLICY IF EXISTS "user_profiles_branch_read" ON public.user_profiles;
CREATE POLICY "user_profiles_branch_read" ON public.user_profiles
  FOR SELECT USING (
    public.is_super_admin()
    OR branch_id = public.get_current_user_branch()
    OR id = auth.uid()
  );
