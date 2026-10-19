-- ==============================================================================
-- UNITED MOTORS VEHICLE TRACKING - SECTION 2 TRIAL USERS SEED SCRIPT
-- ==============================================================================
-- Description:
-- Seeds the 1-to-1 operational bay foremen and leadership for Section 2 (orugodawatta_sec2)
-- on a 14-day evaluation trial.
-- Each of the 3 foremen manages their specific bay + universal access to Waiting Area:
-- 1. General Service Foreman  | foreman.general.sec2@unitedmotors.com   | General Service Bay + Waiting Area
-- 2. Wheel Alignment Foreman  | foreman.alignment.sec2@unitedmotors.com | Alignment Bay + Waiting Area
-- 3. Hoist Foreman            | foreman.hoist.sec2@unitedmotors.com     | Hoist Bay + Waiting Area
-- Plus Section 2 Management & Intake:
-- 4. Workshop Manager         | manager.sec2@unitedmotors.com           | Full Section 2 Oversight
-- 5. Job Controller           | controller.sec2@unitedmotors.com        | Section 2 Dispatch
-- 6. Service Advisor          | advisor.sec2@unitedmotors.com           | Section 2 Intake & Handover
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
  '', '', '', '', '', '', '', 0, '', false, false,
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
  '', '', '', '', '', '', '', 0, '', false, false,
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

-- 2.3 foreman.general.sec2 (General Service / Workshop Bay)
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, email_change_confirm_status,
  reauthentication_token, is_sso_user, is_anonymous,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'foreman.general.sec2@unitedmotors.com', '$2a$06$PTEXmYTTqu3aCcr8BCPxJuRwVNxOljOD2kaSqxdQYAE6cBwtomryq', NOW(),
  '', '', '', '', '', '', '', 0, '', false, false,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Section 2 Foreman (General Service)","role":"foreman","section":"workshop","branch_id":"orugodawatta_sec2"}'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    confirmation_token = '',
    recovery_token = '',
    email_change_token_new = '',
    email_change = '',
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = NOW();

INSERT INTO public.user_profiles (
  id, email, display_name, role, section, branch_id, theme_preference
) VALUES (
  '20000000-0000-0000-0000-000000000003', 'foreman.general.sec2@unitedmotors.com', 'Section 2 Foreman (General Service)', 'foreman'::user_role, 'workshop', 'orugodawatta_sec2', 'system'
)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    section = EXCLUDED.section,
    branch_id = EXCLUDED.branch_id,
    updated_at = NOW();

-- 2.4 foreman.alignment.sec2 (Wheel Alignment Bay)
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, email_change_confirm_status,
  reauthentication_token, is_sso_user, is_anonymous,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'foreman.alignment.sec2@unitedmotors.com', '$2a$06$PTEXmYTTqu3aCcr8BCPxJuRwVNxOljOD2kaSqxdQYAE6cBwtomryq', NOW(),
  '', '', '', '', '', '', '', 0, '', false, false,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Section 2 Foreman (Wheel Alignment)","role":"foreman","section":"alignment","branch_id":"orugodawatta_sec2"}'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    confirmation_token = '',
    recovery_token = '',
    email_change_token_new = '',
    email_change = '',
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = NOW();

INSERT INTO public.user_profiles (
  id, email, display_name, role, section, branch_id, theme_preference
) VALUES (
  '20000000-0000-0000-0000-000000000004', 'foreman.alignment.sec2@unitedmotors.com', 'Section 2 Foreman (Wheel Alignment)', 'foreman'::user_role, 'alignment', 'orugodawatta_sec2', 'system'
)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    section = EXCLUDED.section,
    branch_id = EXCLUDED.branch_id,
    updated_at = NOW();

-- 2.5 foreman.hoist.sec2 (Hoist Service Bay)
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, email_change_confirm_status,
  reauthentication_token, is_sso_user, is_anonymous,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'foreman.hoist.sec2@unitedmotors.com', '$2a$06$PTEXmYTTqu3aCcr8BCPxJuRwVNxOljOD2kaSqxdQYAE6cBwtomryq', NOW(),
  '', '', '', '', '', '', '', 0, '', false, false,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Section 2 Foreman (Hoist Service)","role":"foreman","section":"hoist","branch_id":"orugodawatta_sec2"}'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    confirmation_token = '',
    recovery_token = '',
    email_change_token_new = '',
    email_change = '',
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = NOW();

INSERT INTO public.user_profiles (
  id, email, display_name, role, section, branch_id, theme_preference
) VALUES (
  '20000000-0000-0000-0000-000000000006', 'foreman.hoist.sec2@unitedmotors.com', 'Section 2 Foreman (Hoist Service)', 'foreman'::user_role, 'hoist', 'orugodawatta_sec2', 'system'
)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    section = EXCLUDED.section,
    branch_id = EXCLUDED.branch_id,
    updated_at = NOW();

-- 2.6 advisor.sec2
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, email_change_confirm_status,
  reauthentication_token, is_sso_user, is_anonymous,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'advisor.sec2@unitedmotors.com', '$2a$06$DfgamZ2Y2KgRRzVQlszDpezIs/sTscJrbkq6bHQ3aJX4U9KCDTA0e', NOW(),
  '', '', '', '', '', '', '', 0, '', false, false,
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
