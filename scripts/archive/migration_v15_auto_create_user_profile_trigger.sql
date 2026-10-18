-- ==============================================================================
-- MIGRATION V15: AUTOMATIC USER PROFILE CREATION TRIGGER
-- ==============================================================================
-- Automatically creates a matching row in public.user_profiles whenever
-- a new user is created in auth.users (via Supabase Dashboard, API, or invite).
-- Eliminates manual profile creation permanently.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
DECLARE
  v_role user_role;
  v_raw_role TEXT;
BEGIN
  v_raw_role := NEW.raw_user_meta_data->>'role';
  
  -- Parse role if provided in metadata, otherwise default to 'service_executive'
  BEGIN
    IF v_raw_role IS NOT NULL THEN
      v_role := v_raw_role::user_role;
    ELSE
      v_role := 'service_executive'::user_role;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_role := 'service_executive'::user_role;
  END;

  INSERT INTO public.user_profiles (
    id,
    email,
    display_name,
    role,
    branch_id,
    section,
    theme_preference,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    v_role,
    COALESCE(NEW.raw_user_meta_data->>'branch_id', 'orugodawatta_sec5'),
    NEW.raw_user_meta_data->>'section',
    'system',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
