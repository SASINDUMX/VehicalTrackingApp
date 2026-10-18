-- ==============================================================================
-- MIGRATION V18: CONCURRENT SESSION LIMIT ENFORCEMENT (MULTI-DEVICE SLIDING WINDOW)
-- ==============================================================================
-- Description:
-- Limits the number of concurrent active device sessions per user account.
-- Uses a First-In-First-Out (FIFO) sliding window (default 3 concurrent logins).
-- When a user logs in on a 4th device, the oldest active session is automatically
-- evicted, ensuring seamless login on new devices without orphaned session lockouts.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.enforce_concurrent_session_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_max_sessions INT := 3; -- Limit of 3 concurrent sessions for all accounts
BEGIN
  -- Keep the newest N sessions, evict any older sessions beyond the limit
  DELETE FROM auth.sessions
  WHERE id IN (
    SELECT id FROM auth.sessions
    WHERE user_id = NEW.user_id
    ORDER BY created_at DESC
    OFFSET v_max_sessions
  );

  -- Purge orphaned refresh tokens for revoked sessions
  DELETE FROM auth.refresh_tokens 
  WHERE session_id NOT IN (SELECT id FROM auth.sessions);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger idempotently
DROP TRIGGER IF EXISTS on_session_created_enforce_limit ON auth.sessions;

CREATE TRIGGER on_session_created_enforce_limit
AFTER INSERT ON auth.sessions
FOR EACH ROW EXECUTE FUNCTION public.enforce_concurrent_session_limit();
