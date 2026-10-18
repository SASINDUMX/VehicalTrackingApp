-- ==============================================================================
-- MIGRATION V17: TIME-EXPIRING TRIAL LICENSING SYSTEM (MULTI-BRANCH & USER AWARE)
-- ==============================================================================
-- Description:
-- 1. Adds 'is_trial' and 'trial_expires_at' to public.workplaces (defaults to FALSE / NULL).
--    Guarantees 100% zero-regression on existing production branches (Orugodawatta, etc.).
-- 2. Adds 'is_trial' and 'trial_expires_at' to public.user_profiles (defaults to FALSE / NULL).
-- 3. Provides autonomous RPC helper functions:
--    - public.start_branch_trial(p_branch_id, p_days)
--    - public.extend_branch_trial(p_branch_id, p_additional_days)
--    - public.convert_branch_to_licensed(p_branch_id)
-- ==============================================================================

-- 1. Add Trial Columns to Workplaces
ALTER TABLE public.workplaces 
  ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Add Trial Columns to User Profiles
ALTER TABLE public.user_profiles 
  ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Helper Administration Functions for Easy Trial Management

-- 3.1 Start a trial for a branch (e.g., 14 days)
CREATE OR REPLACE FUNCTION public.start_branch_trial(
  p_branch_id VARCHAR(50),
  p_days INT DEFAULT 14
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expires TIMESTAMPTZ;
  v_branch_name VARCHAR(255);
BEGIN
  v_expires := NOW() + (p_days || ' days')::INTERVAL;

  UPDATE public.workplaces
  SET 
    is_trial = TRUE,
    trial_expires_at = v_expires
  WHERE id = p_branch_id
  RETURNING name INTO v_branch_name;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Workplace branch not found: ' || p_branch_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'branch_id', p_branch_id,
    'branch_name', v_branch_name,
    'is_trial', TRUE,
    'trial_expires_at', v_expires,
    'days_granted', p_days
  );
END;
$$;

-- 3.2 Extend an existing trial by N additional days
CREATE OR REPLACE FUNCTION public.extend_branch_trial(
  p_branch_id VARCHAR(50),
  p_additional_days INT DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_expires TIMESTAMPTZ;
  v_new_expires TIMESTAMPTZ;
BEGIN
  SELECT trial_expires_at INTO v_current_expires
  FROM public.workplaces
  WHERE id = p_branch_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Branch not found');
  END IF;

  -- If trial already expired in the past, add from NOW(); otherwise extend from current expiration
  IF v_current_expires IS NULL OR v_current_expires < NOW() THEN
    v_new_expires := NOW() + (p_additional_days || ' days')::INTERVAL;
  ELSE
    v_new_expires := v_current_expires + (p_additional_days || ' days')::INTERVAL;
  END IF;

  UPDATE public.workplaces
  SET 
    is_trial = TRUE,
    trial_expires_at = v_new_expires
  WHERE id = p_branch_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'branch_id', p_branch_id,
    'is_trial', TRUE,
    'trial_expires_at', v_new_expires,
    'additional_days', p_additional_days
  );
END;
$$;

-- 3.3 Convert branch from Trial to Full Permanent License
CREATE OR REPLACE FUNCTION public.convert_branch_to_licensed(
  p_branch_id VARCHAR(50)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.workplaces
  SET 
    is_trial = FALSE,
    trial_expires_at = NULL
  WHERE id = p_branch_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Branch not found');
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'branch_id', p_branch_id,
    'is_trial', FALSE,
    'message', 'Branch successfully converted to Full Permanent License'
  );
END;
$$;

COMMENT ON COLUMN public.workplaces.is_trial IS 'When TRUE, users at this workshop are on a time-limited evaluation trial.';
COMMENT ON COLUMN public.workplaces.trial_expires_at IS 'Timestamp when this workshop trial expires. NULL represents unlimited access.';
