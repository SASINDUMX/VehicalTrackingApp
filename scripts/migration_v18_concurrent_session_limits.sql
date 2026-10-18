-- ==============================================================================
-- MIGRATION V18: SINGLE SESSION ENFORCEMENT ("LAST LOGIN WINS")
-- ==============================================================================
-- Description:
-- Enforces strictly 1 active device session per user account at any given time.
-- When a user logs in on a new device:
-- 1. Database trigger immediately expires all previous sessions (setting not_after = NOW())
--    and revokes their refresh tokens in GoTrue Auth.
-- 2. User profile records a unique active_session_token.
-- 3. Supabase Realtime notifies all open tabs/devices to immediately evict stale sessions.
-- ==============================================================================

-- 1. Add active_session_token column to public.user_profiles
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS active_session_token TEXT DEFAULT NULL;

-- 2. Enable Realtime broadcast on user_profiles
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

-- 3. Database session eviction trigger on auth.sessions

CREATE OR REPLACE FUNCTION public.enforce_single_session_last_login_wins()
RETURNS TRIGGER AS $$
BEGIN
  -- 1. Expire all previous sessions for this user except the newly created one
  UPDATE auth.sessions
  SET not_after = NOW(), updated_at = NOW()
  WHERE user_id = NEW.user_id AND id != NEW.id;

  -- 2. Mark older refresh tokens as revoked
  UPDATE auth.refresh_tokens
  SET revoked = TRUE, updated_at = NOW()
  WHERE user_id = NEW.user_id::text AND session_id != NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind trigger idempotently to auth.sessions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_session_created_enforce_single'
  ) THEN
    CREATE TRIGGER on_session_created_enforce_single
    AFTER INSERT ON auth.sessions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_single_session_last_login_wins();
  END IF;
END $$;
