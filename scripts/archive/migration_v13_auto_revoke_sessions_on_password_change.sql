-- ==============================================================================
-- UNITED MOTORS VEHICLE TRACKING - MIGRATION V13
-- AUTOMATIC SESSION REVOCATION ON PASSWORD CHANGE & IMMEDIATE LOGOUT SECURITY
-- ==============================================================================
-- Paste and run this script in Supabase Dashboard -> SQL Editor
-- 
-- WHAT THIS SCRIPT DOES:
-- 1. Creates an automatic PostgreSQL trigger on auth.users:
--    Whenever a user's encrypted_password is changed (by any seed script,
--    admin SQL, or dashboard action), all their active sessions & refresh
--    tokens are instantly revoked in Supabase.
-- 2. Creates a helper RPC 'admin_reset_user_password' to safely change any
--    user's password and terminate their active sessions in one command.
-- 3. Cleans up all existing active sessions immediately so current users
--    with changed passwords must log in afresh with new credentials.
-- ==============================================================================

-- 1. CREATE FUNCTION TO REVOKE SESSIONS ON PASSWORD UPDATE
CREATE OR REPLACE FUNCTION public.handle_user_password_change_revoke_sessions()
RETURNS trigger
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check if encrypted_password column was actually updated and changed
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
    -- Delete all active sessions for this user
    DELETE FROM auth.sessions WHERE user_id = NEW.id;
    
    -- Clean up orphaned refresh tokens
    DELETE FROM auth.refresh_tokens WHERE session_id NOT IN (SELECT id FROM auth.sessions);
  END IF;
  RETURN NEW;
END;
$$;

-- 2. ATTACH TRIGGER TO auth.users
DROP TRIGGER IF EXISTS on_auth_user_password_change ON auth.users;

CREATE TRIGGER on_auth_user_password_change
  AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_password_change_revoke_sessions();

-- 3. ADMIN HELPER RPC TO CHANGE A USER'S PASSWORD AND KICK THEM OUT IN ONE STEP
CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  p_email TEXT,
  p_new_password TEXT
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Look up user ID
  SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = LOWER(TRIM(p_email));
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found with email: ' || p_email);
  END IF;

  -- Update password (this will also fire the trigger above to delete sessions)
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = NOW()
  WHERE id = v_user_id;

  -- Explicit fallback deletion in case trigger is disabled
  DELETE FROM auth.sessions WHERE user_id = v_user_id;
  DELETE FROM auth.refresh_tokens WHERE session_id NOT IN (SELECT id FROM auth.sessions);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Password reset successfully and all active sessions revoked.',
    'user_id', v_user_id,
    'email', p_email
  );
END;
$$;

-- 4. IMMEDIATE CLEANUP: REVOKE ALL CURRENT ACTIVE SESSIONS
-- (Forces all currently connected browsers/devices to re-authenticate)
DELETE FROM auth.sessions;
DELETE FROM auth.refresh_tokens;

SELECT 'Migration V13 completed successfully: Automatic session revocation trigger enabled, and all active sessions purged.' AS status;
