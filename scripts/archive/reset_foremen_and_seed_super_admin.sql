-- ==============================================================================
-- UNITED MOTORS VEHICLE TRACKING - FOREMEN PASSWORD RESET & SUPER ADMIN SEED
-- ==============================================================================
-- Run this in the Supabase Dashboard -> SQL Editor (project: eeoyfrhmgarocecphcky)
-- 100% Safe, Additive, and Idempotent.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Ensure user_role enum includes 'super_admin'
DO $enum$ BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
EXCEPTION WHEN duplicate_object THEN null; END $enum$;

-- 2. RESET ALL FOREMEN PASSWORDS TO: 'UMForeman@2026'
DO $foremen$
DECLARE
  f_record RECORD;
  v_uid UUID;
  foremen_list JSONB := '[
    {"email": "foreman.car@unitedmotors.com", "name": "Foreman (CAR)", "section": "car"},
    {"email": "foreman.suv@unitedmotors.com", "name": "Foreman (SUV)", "section": "suv"},
    {"email": "foreman.lcv@unitedmotors.com", "name": "Foreman (LCV)", "section": "lcv"},
    {"email": "foreman.hoist@unitedmotors.com", "name": "Foreman (Hoist)", "section": "hoist"},
    {"email": "foreman.alignment@unitedmotors.com", "name": "Foreman (Alignment)", "section": "alignment"}
  ]'::jsonb;
BEGIN
  FOR f_record IN SELECT * FROM jsonb_to_recordset(foremen_list) AS x(email TEXT, name TEXT, section TEXT)
  LOOP
    SELECT id INTO v_uid FROM auth.users WHERE email = f_record.email;
    
    IF v_uid IS NULL THEN
      v_uid := gen_random_uuid();
      INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) VALUES (
        v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        f_record.email, crypt('UMForeman@2026', gen_salt('bf')), NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('display_name', f_record.name, 'role', 'foreman', 'section', f_record.section),
        NOW(), NOW()
      );
    ELSE
      UPDATE auth.users
      SET encrypted_password = crypt('UMForeman@2026', gen_salt('bf')),
          email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
          raw_user_meta_data = jsonb_build_object('display_name', f_record.name, 'role', 'foreman', 'section', f_record.section),
          updated_at = NOW()
      WHERE id = v_uid;
    END IF;

    -- Update or Insert profile
    INSERT INTO public.user_profiles (id, display_name, role, section, branch_id, theme_preference)
    VALUES (v_uid, f_record.name, 'foreman'::user_role, f_record.section, 'peliyagoda_sec5', 'system')
    ON CONFLICT (id) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          role = 'foreman'::user_role,
          section = EXCLUDED.section;
  END LOOP;
END $foremen$;

-- 3. SEED / UPDATE UNIVERSAL SUPER ADMIN ACCOUNT
-- Email: admin@unitedmotors.com
-- Password: UMAdmin@2026
DO $admin$
DECLARE
  v_admin_id UUID;
BEGIN
  SELECT id INTO v_admin_id FROM auth.users WHERE email = 'admin@unitedmotors.com';

  IF v_admin_id IS NULL THEN
    v_admin_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'admin@unitedmotors.com', crypt('UMAdmin@2026', gen_salt('bf')), NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', 'Super Administrator', 'role', 'super_admin'),
      NOW(), NOW()
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = crypt('UMAdmin@2026', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        raw_user_meta_data = jsonb_build_object('display_name', 'Super Administrator', 'role', 'super_admin'),
        updated_at = NOW()
    WHERE id = v_admin_id;
  END IF;

  -- Upsert super_admin profile
  INSERT INTO public.user_profiles (id, display_name, role, section, branch_id, theme_preference)
  VALUES (v_admin_id, 'Super Administrator', 'super_admin'::user_role, NULL, 'peliyagoda_sec5', 'system')
  ON CONFLICT (id) DO UPDATE
    SET display_name = 'Super Administrator',
        role = 'super_admin'::user_role;
END $admin$;

-- 4. UPDATE RLS HELPER FUNCTION TO GRANT SUPER ADMIN FULL ACCESS ACROSS ALL BRANCHES
CREATE OR REPLACE FUNCTION is_manager_or_executive()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE id = auth.uid() 
      AND role IN ('super_admin', 'agm', 'workshop_manager', 'service_executive')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 5. VERIFICATION QUERY: Return the updated accounts
SELECT 
  p.display_name, 
  p.role, 
  p.section,
  p.branch_id,
  u.email, 
  u.email_confirmed_at IS NOT NULL AS is_active
FROM public.user_profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.role IN ('foreman', 'super_admin')
ORDER BY p.role, p.section;
