-- ==============================================================================
-- MIGRATION V18: SINGLE SESSION ENFORCEMENT ("LAST LOGIN WINS")
-- ==============================================================================
-- Description:
-- Enforces strictly 1 active device session per user account at any given time.
-- When a user logs in on a new device, the database immediately expires all previous
-- sessions (setting not_after = NOW()) and revokes their refresh tokens.
--
-- Why not_after & revoked?
-- 1. 100% non-destructive and audit-friendly (preserves session history).
-- 2. GoTrue Auth natively respects not_after and revoked=true on token refresh.
-- 3. The older device receives 401 Unauthorized and returns to the login screen.
-- ==============================================================================

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
