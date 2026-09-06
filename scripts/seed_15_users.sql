-- ==============================================================================
-- UNITED MOTORS VEHICLE TRACKING - 15 ORGANIZATIONAL ACCOUNTS SEED SCRIPT
-- ==============================================================================
-- Paste and run this script in Supabase Dashboard -> SQL Editor
-- Creates or updates all 15 users in both auth.users and public.user_profiles.
-- Uses the 6 official roles:
--   'service_executive', 'agm', 'job_controller', 'workshop_manager', 'foreman', 'advisor'
-- And section assignment:
--   Foremen: 'car', 'suv', 'lcv', 'hoist', 'alignment'
--   Advisors: 'car', 'suv', 'lcv'
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Ensure user_role ENUM contains the 6 official roles
DO $enum$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'service_executive', 'agm', 'job_controller', 'workshop_manager', 'foreman', 'advisor'
  );
EXCEPTION WHEN duplicate_object THEN null; END $enum$;

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'service_executive';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'agm';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'job_controller';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'workshop_manager';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'foreman';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'advisor';

-- Ensure user_profiles has section column
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS section VARCHAR(50);

-- 2. Seed / Upsert all 15 Accounts
DO $seed$
DECLARE
  account RECORD;
  v_user_id UUID;
  accounts_data JSONB := '[
    {"email": "executive@unitedmotors.com", "password": "Exec@123", "role": "service_executive", "section": null, "name": "Service Executive"},
    {"email": "agm@unitedmotors.com", "password": "Agm@123", "role": "agm", "section": null, "name": "Assistant General Manager"},
    {"email": "controller@unitedmotors.com", "password": "Controller@123", "role": "job_controller", "section": null, "name": "Job Controller"},
    {"email": "manager@unitedmotors.com", "password": "Manager@123", "role": "workshop_manager", "section": null, "name": "Workshop Manager"},
    {"email": "foreman.car@unitedmotors.com", "password": "Foreman@123", "role": "foreman", "section": "car", "name": "Foreman (CAR)"},
    {"email": "foreman.suv@unitedmotors.com", "password": "Foreman@123", "role": "foreman", "section": "suv", "name": "Foreman (SUV)"},
    {"email": "foreman.lcv@unitedmotors.com", "password": "Foreman@123", "role": "foreman", "section": "lcv", "name": "Foreman (LCV)"},
    {"email": "foreman.hoist@unitedmotors.com", "password": "Foreman@123", "role": "foreman", "section": "hoist", "name": "Foreman (Hoist)"},
    {"email": "foreman.alignment@unitedmotors.com", "password": "Foreman@123", "role": "foreman", "section": "alignment", "name": "Foreman (Alignment)"},
    {"email": "advisor.car1@unitedmotors.com", "password": "Advisor@123", "role": "advisor", "section": "car", "name": "Advisor Car 1"},
    {"email": "advisor.car2@unitedmotors.com", "password": "Advisor@123", "role": "advisor", "section": "car", "name": "Advisor Car 2"},
    {"email": "advisor.suv1@unitedmotors.com", "password": "Advisor@123", "role": "advisor", "section": "suv", "name": "Advisor SUV 1"},
    {"email": "advisor.suv2@unitedmotors.com", "password": "Advisor@123", "role": "advisor", "section": "suv", "name": "Advisor SUV 2"},
    {"email": "advisor.lcv1@unitedmotors.com", "password": "Advisor@123", "role": "advisor", "section": "lcv", "name": "Advisor LCV 1"},
    {"email": "advisor.lcv2@unitedmotors.com", "password": "Advisor@123", "role": "advisor", "section": "lcv", "name": "Advisor LCV 2"}
  ]'::jsonb;
BEGIN
  FOR account IN SELECT * FROM jsonb_to_recordset(accounts_data) AS x(email TEXT, password TEXT, role TEXT, section TEXT, name TEXT)
  LOOP
    -- Check if user exists in auth.users
    SELECT id INTO v_user_id FROM auth.users WHERE email = account.email;

    IF v_user_id IS NULL THEN
      -- Insert new user into auth.users
      v_user_id := gen_random_uuid();
      INSERT INTO auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      ) VALUES (
        v_user_id,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        account.email,
        crypt(account.password, gen_salt('bf')),
        NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('display_name', account.name, 'role', account.role, 'section', account.section),
        NOW(),
        NOW()
      );
    ELSE
      -- Update password and confirmation status in auth.users
      UPDATE auth.users
      SET encrypted_password = crypt(account.password, gen_salt('bf')),
          email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
          raw_user_meta_data = jsonb_build_object('display_name', account.name, 'role', account.role, 'section', account.section),
          updated_at = NOW()
      WHERE id = v_user_id;
    END IF;

    -- Upsert profile into public.user_profiles
    INSERT INTO public.user_profiles (
      id,
      display_name,
      role,
      section,
      branch_id,
      theme_preference
    ) VALUES (
      v_user_id,
      account.name,
      account.role::user_role,
      account.section,
      'main_workshop',
      'system'
    )
    ON CONFLICT (id) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          role = EXCLUDED.role,
          section = EXCLUDED.section,
          branch_id = EXCLUDED.branch_id;
  END LOOP;
END $seed$;

SELECT 
  p.display_name, 
  p.role, 
  p.section,
  u.email, 
  u.email_confirmed_at IS NOT NULL AS is_confirmed
FROM public.user_profiles p
JOIN auth.users u ON u.id = p.id
ORDER BY p.role, p.section;
