-- ==============================================================================
-- MIGRATION V19: CONFIGURABLE PARALLEL SESSIONS PER USER PROFILE
-- ==============================================================================
-- Description:
-- Replaces rigid single-session with configurable parallel session limit per user.
-- 1. Adds 'max_parallel_sessions' (INTEGER DEFAULT 3) to public.user_profiles.
--    You can easily change any user's limit anytime with:
--      UPDATE public.user_profiles SET max_parallel_sessions = 5 WHERE email = '...';
-- 2. Adds 'active_session_tokens' (JSONB DEFAULT '[]'::jsonb) to public.user_profiles.
--    Maintains an ordered list of current active device tokens.
-- 3. Provides 'public.register_active_session(p_token TEXT)' RPC to register new device
--    and pop off the oldest session beyond max_parallel_sessions.
-- 4. Updates auth.sessions trigger 'enforce_single_session_last_login_wins' to respect
--    the user's individual 'max_parallel_sessions'.
-- ==============================================================================

-- 1. Schema Changes
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS max_parallel_sessions INTEGER NOT NULL DEFAULT 3;

ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS active_session_tokens JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Ensure Realtime publication includes user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_profiles;
  END IF;
END $$;

ALTER TABLE public.user_profiles REPLICA IDENTITY FULL;

-- 2. RPC to register active session token & trim beyond max_parallel_sessions
CREATE OR REPLACE FUNCTION public.register_active_session(p_token TEXT)
RETURNS jsonb AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_limit INTEGER;
  v_tokens jsonb;
  v_filtered jsonb;
  v_updated jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(max_parallel_sessions, 3), COALESCE(active_session_tokens, '[]'::jsonb)
  INTO v_limit, v_tokens
  FROM public.user_profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_limit IS NULL OR v_limit < 1 THEN
    v_limit := 3;
  END IF;

  -- Filter out the current token if already in list to avoid duplicates
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
  INTO v_filtered
  FROM jsonb_array_elements_text(v_tokens) elem
  WHERE elem <> p_token;

  -- Prepend newest token at front
  v_filtered := jsonb_build_array(p_token) || v_filtered;

  -- Keep only up to v_limit tokens
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
  INTO v_updated
  FROM (
    SELECT elem FROM jsonb_array_elements_text(v_filtered) elem LIMIT v_limit
  ) sub;

  UPDATE public.user_profiles
  SET 
    active_session_tokens = v_updated,
    active_session_token = p_token,
    updated_at = NOW()
  WHERE id = v_user_id;

  RETURN v_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.register_active_session(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_active_session(TEXT) TO anon;

-- 3. Trigger Function on auth.sessions to clean up expired sessions on GoTrue layer
CREATE OR REPLACE FUNCTION public.enforce_single_session_last_login_wins()
RETURNS TRIGGER AS $$
DECLARE
  v_limit INTEGER;
BEGIN
  SELECT COALESCE(max_parallel_sessions, 3)
  INTO v_limit
  FROM public.user_profiles
  WHERE id = NEW.user_id;

  IF v_limit IS NULL OR v_limit < 1 THEN
    v_limit := 3;
  END IF;

  WITH active_sess AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) as rn
    FROM auth.sessions
    WHERE user_id = NEW.user_id
      AND (not_after IS NULL OR not_after > NOW())
  )
  UPDATE auth.sessions
  SET not_after = NOW(), updated_at = NOW()
  WHERE id IN (SELECT id FROM active_sess WHERE rn > v_limit);

  UPDATE auth.refresh_tokens
  SET revoked = TRUE, updated_at = NOW()
  WHERE user_id = NEW.user_id::text
    AND session_id IN (
      SELECT id FROM auth.sessions
      WHERE user_id = NEW.user_id
        AND not_after <= NOW()
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
