-- ==============================================================================
-- UNITED MOTORS VEHICLE TRACKING - SECTION 5 ROSTER EXPANSION SCRIPT
-- ==============================================================================
-- Applied to Main Production Database: eeoyfrhmgarocecphcky
-- Adds:
--   1. Workshop Manager 2 (manager2@unitedmotors.com)
--   2. Dual-bay Foreman (foreman.general@unitedmotors.com) -> workshop_alignment
--   3. Service Advisor 3 (advisor.general1@unitedmotors.com) -> General / Floating
--   4. Service Advisor 4 (advisor.general2@unitedmotors.com) -> General / Floating
-- ==============================================================================

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, email_change_confirm_status,
  reauthentication_token, is_super_admin, is_sso_user, is_anonymous,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES 
  (
    '50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'manager2@unitedmotors.com', crypt('Mgr2#Sec5!982', gen_salt('bf')), NOW(),
    '', '', '', '', '', '', '', 0, '', FALSE, FALSE, FALSE,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Workshop Manager 2","role":"workshop_manager","branch_id":"orugodawatta_sec5"}'::jsonb,
    NOW(), NOW()
  ),
  (
    '50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'foreman.general@unitedmotors.com', crypt('Fman#WkAln$741', gen_salt('bf')), NOW(),
    '', '', '', '', '', '', '', 0, '', FALSE, FALSE, FALSE,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Foreman (Workshop & Alignment)","role":"foreman","section":"workshop_alignment","branch_id":"orugodawatta_sec5"}'::jsonb,
    NOW(), NOW()
  ),
  (
    '50000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'advisor.general1@unitedmotors.com', crypt('Adv#Flot1&629', gen_salt('bf')), NOW(),
    '', '', '', '', '', '', '', 0, '', FALSE, FALSE, FALSE,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Service Advisor 3","role":"advisor","branch_id":"orugodawatta_sec5"}'::jsonb,
    NOW(), NOW()
  ),
  (
    '50000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'advisor.general2@unitedmotors.com', crypt('Adv#Flot2*318', gen_salt('bf')), NOW(),
    '', '', '', '', '', '', '', 0, '', FALSE, FALSE, FALSE,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Service Advisor 4","role":"advisor","branch_id":"orugodawatta_sec5"}'::jsonb,
    NOW(), NOW()
  )
ON CONFLICT (id) DO UPDATE SET 
  email = EXCLUDED.email, 
  encrypted_password = EXCLUDED.encrypted_password, 
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  updated_at = NOW();

INSERT INTO public.user_profiles (id, email, display_name, role, section, branch_id, max_parallel_sessions, is_trial, theme_preference, updated_at)
VALUES 
  ('50000000-0000-0000-0000-000000000001', 'manager2@unitedmotors.com', 'Workshop Manager 2', 'workshop_manager'::user_role, NULL, 'orugodawatta_sec5', 3, false, 'system', NOW()),
  ('50000000-0000-0000-0000-000000000002', 'foreman.general@unitedmotors.com', 'Foreman (Workshop & Alignment)', 'foreman'::user_role, 'workshop_alignment', 'orugodawatta_sec5', 3, false, 'system', NOW()),
  ('50000000-0000-0000-0000-000000000003', 'advisor.general1@unitedmotors.com', 'Service Advisor 3', 'advisor'::user_role, NULL, 'orugodawatta_sec5', 3, false, 'system', NOW()),
  ('50000000-0000-0000-0000-000000000004', 'advisor.general2@unitedmotors.com', 'Service Advisor 4', 'advisor'::user_role, NULL, 'orugodawatta_sec5', 3, false, 'system', NOW())
ON CONFLICT (id) DO UPDATE SET 
  email = EXCLUDED.email, 
  display_name = EXCLUDED.display_name, 
  role = EXCLUDED.role, 
  section = EXCLUDED.section, 
  branch_id = EXCLUDED.branch_id, 
  max_parallel_sessions = EXCLUDED.max_parallel_sessions, 
  is_trial = EXCLUDED.is_trial, 
  updated_at = NOW();
