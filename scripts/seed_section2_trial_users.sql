-- ==============================================================================
-- UNITED MOTORS VEHICLE TRACKING - SECTION 2 TRIAL USERS SEED SCRIPT
-- ==============================================================================
-- Description:
-- Seeds the 5 designated operational accounts for Section 2 (orugodawatta_sec2)
-- on a 14-day evaluation trial.
-- Section 5 (Main) accounts remain untouched, licensed, and completely uninterrupted.
--
-- Credentials:
-- 1. manager.sec2@unitedmotors.com    | Sec2Manager@123    (Workshop Manager)
-- 2. controller.sec2@unitedmotors.com | Sec2Controller@123 (Job Controller)
-- 3. foreman.car.sec2@unitedmotors.com| Sec2Foreman@123    (Foreman - Car)
-- 4. foreman.sec2@unitedmotors.com    | Sec2Foreman@123    (Foreman - General)
-- 5. advisor.sec2@unitedmotors.com    | Sec2Advisor@123    (Service Advisor)
-- ==============================================================================

-- 1. Set Section 2 Workplace to 14-Day Trial
UPDATE public.workplaces
SET 
  is_trial = TRUE,
  trial_expires_at = NOW() + INTERVAL '14 days'
WHERE id = 'orugodawatta_sec2';

-- Ensure updated_at column exists on user_profiles
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Seed Section 2 Accounts
-- 2.1 manager.sec2
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, email_change_confirm_status,
  reauthentication_token, is_sso_user, is_anonymous,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'manager.sec2@unitedmotors.com', '$2a$06$Rancg9x65nF.mYLONTSMsevo1Gj4ViWzdKoZpbVwGbOJ4bBvu4lk2', NOW(),
  '', '', '', '',
  '', '', '', 0,
  '', false, false,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Section 2 Manager","role":"workshop_manager","branch_id":"orugodawatta_sec2"}'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (id) DO UPDATE
SET encrypted_password = EXCLUDED.encrypted_password,
    confirmation_token = '',
    recovery_token = '',
    email_change_token_new = '',
    email_change = '',
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = NOW();

INSERT INTO public.user_profiles (
  id, email, display_name, role, section, branch_id, theme_preference
) VALUES (
  '20000000-0000-0000-0000-000000000001', 'manager.sec2@unitedmotors.com', 'Section 2 Manager', 'workshop_manager'::user_role, null, 'orugodawatta_sec2', 'system'
)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    branch_id = EXCLUDED.branch_id,
    updated_at = NOW();

-- 2.2 controller.sec2
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, email_change_confirm_status,
  reauthentication_token, is_sso_user, is_anonymous,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'controller.sec2@unitedmotors.com', '$2a$06$/RmT2RdG.qMTS9FIMGAcIeSuMr33sw8CiuoWkLwdTiihTpsIFyhb6', NOW(),
  '', '', '', '',
  '', '', '', 0,
  '', false, false,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Section 2 Job Controller","role":"job_controller","branch_id":"orugodawatta_sec2"}'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (id) DO UPDATE
SET encrypted_password = EXCLUDED.encrypted_password,
    confirmation_token = '',
    recovery_token = '',
    email_change_token_new = '',
    email_change = '',
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = NOW();

INSERT INTO public.user_profiles (
  id, email, display_name, role, section, branch_id, theme_preference
) VALUES (
  '20000000-0000-0000-0000-000000000002', 'controller.sec2@unitedmotors.com', 'Section 2 Job Controller', 'job_controller'::user_role, null, 'orugodawatta_sec2', 'system'
)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    branch_id = EXCLUDED.branch_id,
    updated_at = NOW();

-- 2.3 foreman.car.sec2
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, email_change_confirm_status,
  reauthentication_token, is_sso_user, is_anonymous,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'foreman.car.sec2@unitedmotors.com', '$2a$06$PTEXmYTTqu3aCcr8BCPxJuRwVNxOljOD2kaSqxdQYAE6cBwtomryq', NOW(),
  '', '', '', '',
  '', '', '', 0,
  '', false, false,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Section 2 Foreman (Car)","role":"foreman","section":"car","branch_id":"orugodawatta_sec2"}'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (id) DO UPDATE
SET encrypted_password = EXCLUDED.encrypted_password,
    confirmation_token = '',
    recovery_token = '',
    email_change_token_new = '',
    email_change = '',
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = NOW();

INSERT INTO public.user_profiles (
  id, email, display_name, role, section, branch_id, theme_preference
) VALUES (
  '20000000-0000-0000-0000-000000000003', 'foreman.car.sec2@unitedmotors.com', 'Section 2 Foreman (Car)', 'foreman'::user_role, 'car', 'orugodawatta_sec2', 'system'
)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    section = EXCLUDED.section,
    branch_id = EXCLUDED.branch_id,
    updated_at = NOW();

-- 2.4 foreman.sec2
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, email_change_confirm_status,
  reauthentication_token, is_sso_user, is_anonymous,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'foreman.sec2@unitedmotors.com', '$2a$06$PTEXmYTTqu3aCcr8BCPxJuRwVNxOljOD2kaSqxdQYAE6cBwtomryq', NOW(),
  '', '', '', '',
  '', '', '', 0,
  '', false, false,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Section 2 Foreman (General)","role":"foreman","branch_id":"orugodawatta_sec2"}'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (id) DO UPDATE
SET encrypted_password = EXCLUDED.encrypted_password,
    confirmation_token = '',
    recovery_token = '',
    email_change_token_new = '',
    email_change = '',
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = NOW();

INSERT INTO public.user_profiles (
  id, email, display_name, role, section, branch_id, theme_preference
) VALUES (
  '20000000-0000-0000-0000-000000000004', 'foreman.sec2@unitedmotors.com', 'Section 2 Foreman (General)', 'foreman'::user_role, null, 'orugodawatta_sec2', 'system'
)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    section = EXCLUDED.section,
    branch_id = EXCLUDED.branch_id,
    updated_at = NOW();

-- 2.5 advisor.sec2
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, email_change_confirm_status,
  reauthentication_token, is_sso_user, is_anonymous,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'advisor.sec2@unitedmotors.com', '$2a$06$DfgamZ2Y2KgRRzVQlszDpezIs/sTscJrbkq6bHQ3aJX4U9KCDTA0e', NOW(),
  '', '', '', '',
  '', '', '', 0,
  '', false, false,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Section 2 Service Advisor","role":"advisor","section":"car","branch_id":"orugodawatta_sec2"}'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (id) DO UPDATE
SET encrypted_password = EXCLUDED.encrypted_password,
    confirmation_token = '',
    recovery_token = '',
    email_change_token_new = '',
    email_change = '',
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = NOW();

INSERT INTO public.user_profiles (
  id, email, display_name, role, section, branch_id, theme_preference
) VALUES (
  '20000000-0000-0000-0000-000000000005', 'advisor.sec2@unitedmotors.com', 'Section 2 Service Advisor', 'advisor'::user_role, 'car', 'orugodawatta_sec2', 'system'
)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    section = EXCLUDED.section,
    branch_id = EXCLUDED.branch_id,
    updated_at = NOW();

-- 3. Global safety clean-up for any NULL string tokens across all auth.users
UPDATE auth.users
SET 
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  email_change_confirm_status = COALESCE(email_change_confirm_status, 0),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  is_sso_user = COALESCE(is_sso_user, FALSE),
  is_anonymous = COALESCE(is_anonymous, FALSE)
WHERE 
  confirmation_token IS NULL 
  OR recovery_token IS NULL 
  OR email_change_token_new IS NULL 
  OR email_change IS NULL;
