-- ==============================================================================
-- SEED SECTION 2 EXPANDED USER ROSTER (15 USERS TOTAL)
-- ==============================================================================
-- 1 AGM: agm.sec2@unitedmotors.com
-- 2 Managers: manager.sec2@unitedmotors.com, manager2.sec2@unitedmotors.com
-- 6 Advisors: advisor1.sec2..advisor6.sec2 (advisor.sec2 -> advisor1.sec2)
-- 3 Foremen (Workshop + Alignment): foreman1.sec2..foreman3.sec2
-- 1 Foreman (Hoist): foreman.hoist.sec2@unitedmotors.com
-- 1 Job Controller: controller.sec2@unitedmotors.com
-- 1 View Only (Driver): driver.sec2@unitedmotors.com
-- ==============================================================================

DO $$
DECLARE
  v_default_pw TEXT := crypt('Sec2User@123', gen_salt('bf', 10));
BEGIN

  -- 1. AGM (1 required)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '20000000-0000-0000-0000-000000000010', 'agm.sec2@unitedmotors.com', v_default_pw, NOW(), '', '',
    '{"provider": "email", "providers": ["email"]}'::jsonb, '{"display_name": "Section 2 AGM"}'::jsonb, NOW(), NOW()
  ) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password, updated_at = NOW();

  INSERT INTO public.user_profiles (id, email, display_name, role, section, branch_id, max_parallel_sessions, is_trial, updated_at)
  VALUES ('20000000-0000-0000-0000-000000000010', 'agm.sec2@unitedmotors.com', 'Section 2 Assistant General Manager', 'agm', NULL, 'orugodawatta_sec2', 3, TRUE, NOW())
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role, branch_id = EXCLUDED.branch_id, updated_at = NOW();

  -- 2. Managers (2 required: manager.sec2, manager2.sec2)
  -- Existing: manager.sec2 (id: ...0001)
  UPDATE auth.users SET encrypted_password = v_default_pw, updated_at = NOW() WHERE id = '20000000-0000-0000-0000-000000000001';
  UPDATE public.user_profiles SET role = 'workshop_manager', section = NULL, branch_id = 'orugodawatta_sec2', is_trial = TRUE, updated_at = NOW() WHERE id = '20000000-0000-0000-0000-000000000001';

  -- New: manager2.sec2
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '20000000-0000-0000-0000-000000000011', 'manager2.sec2@unitedmotors.com', v_default_pw, NOW(), '', '',
    '{"provider": "email", "providers": ["email"]}'::jsonb, '{"display_name": "Section 2 Manager 2"}'::jsonb, NOW(), NOW()
  ) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password, updated_at = NOW();

  INSERT INTO public.user_profiles (id, email, display_name, role, section, branch_id, max_parallel_sessions, is_trial, updated_at)
  VALUES ('20000000-0000-0000-0000-000000000011', 'manager2.sec2@unitedmotors.com', 'Section 2 Workshop Manager 2', 'workshop_manager', NULL, 'orugodawatta_sec2', 3, TRUE, NOW())
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role, branch_id = EXCLUDED.branch_id, updated_at = NOW();

  -- 3. Job Controller (1 required: controller.sec2 exists at ...0002)
  UPDATE auth.users SET encrypted_password = v_default_pw, updated_at = NOW() WHERE id = '20000000-0000-0000-0000-000000000002';
  UPDATE public.user_profiles SET role = 'job_controller', section = NULL, branch_id = 'orugodawatta_sec2', is_trial = TRUE, updated_at = NOW() WHERE id = '20000000-0000-0000-0000-000000000002';

  -- 4. Foreman Hoist (1 required: foreman.hoist.sec2 exists at ...0006)
  UPDATE auth.users SET encrypted_password = v_default_pw, updated_at = NOW() WHERE id = '20000000-0000-0000-0000-000000000006';
  UPDATE public.user_profiles SET role = 'foreman', section = 'hoist', branch_id = 'orugodawatta_sec2', is_trial = TRUE, updated_at = NOW() WHERE id = '20000000-0000-0000-0000-000000000006';

  -- 5. Foremen Workshop + Alignment (3 required)
  -- Foreman 1 (...0003)
  UPDATE auth.users SET email = 'foreman1.sec2@unitedmotors.com', encrypted_password = v_default_pw, updated_at = NOW() WHERE id = '20000000-0000-0000-0000-000000000003';
  UPDATE public.user_profiles SET email = 'foreman1.sec2@unitedmotors.com', display_name = 'Section 2 Foreman 1 (Workshop + Alignment)', role = 'foreman', section = 'workshop_alignment', branch_id = 'orugodawatta_sec2', updated_at = NOW() WHERE id = '20000000-0000-0000-0000-000000000003';

  -- Foreman 2 (...0004)
  UPDATE auth.users SET email = 'foreman2.sec2@unitedmotors.com', encrypted_password = v_default_pw, updated_at = NOW() WHERE id = '20000000-0000-0000-0000-000000000004';
  UPDATE public.user_profiles SET email = 'foreman2.sec2@unitedmotors.com', display_name = 'Section 2 Foreman 2 (Workshop + Alignment)', role = 'foreman', section = 'workshop_alignment', branch_id = 'orugodawatta_sec2', updated_at = NOW() WHERE id = '20000000-0000-0000-0000-000000000004';

  -- Foreman 3 (...0012)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '20000000-0000-0000-0000-000000000012', 'foreman3.sec2@unitedmotors.com', v_default_pw, NOW(), '', '',
    '{"provider": "email", "providers": ["email"]}'::jsonb, '{"display_name": "Section 2 Foreman 3"}'::jsonb, NOW(), NOW()
  ) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password, updated_at = NOW();

  INSERT INTO public.user_profiles (id, email, display_name, role, section, branch_id, max_parallel_sessions, is_trial, updated_at)
  VALUES ('20000000-0000-0000-0000-000000000012', 'foreman3.sec2@unitedmotors.com', 'Section 2 Foreman 3 (Workshop + Alignment)', 'foreman', 'workshop_alignment', 'orugodawatta_sec2', 3, TRUE, NOW())
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role, section = EXCLUDED.section, branch_id = EXCLUDED.branch_id, updated_at = NOW();

  -- 6. Service Advisors (6 required: advisor1.sec2..advisor6.sec2)
  -- Advisor 1 (...0005)
  UPDATE auth.users SET email = 'advisor1.sec2@unitedmotors.com', encrypted_password = v_default_pw, updated_at = NOW() WHERE id = '20000000-0000-0000-0000-000000000005';
  UPDATE public.user_profiles SET email = 'advisor1.sec2@unitedmotors.com', display_name = 'Section 2 Service Advisor 1', role = 'advisor', section = 'car', branch_id = 'orugodawatta_sec2', updated_at = NOW() WHERE id = '20000000-0000-0000-0000-000000000005';

  -- Advisor 2
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES ('20000000-0000-0000-0000-000000000022', 'advisor2.sec2@unitedmotors.com', v_default_pw, NOW(), '', '', '{"provider": "email", "providers": ["email"]}'::jsonb, '{"display_name": "Advisor 2"}'::jsonb, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password, updated_at = NOW();
  INSERT INTO public.user_profiles (id, email, display_name, role, section, branch_id, max_parallel_sessions, is_trial, updated_at)
  VALUES ('20000000-0000-0000-0000-000000000022', 'advisor2.sec2@unitedmotors.com', 'Section 2 Service Advisor 2', 'advisor', 'car', 'orugodawatta_sec2', 3, TRUE, NOW())
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role, branch_id = EXCLUDED.branch_id, updated_at = NOW();

  -- Advisor 3
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES ('20000000-0000-0000-0000-000000000023', 'advisor3.sec2@unitedmotors.com', v_default_pw, NOW(), '', '', '{"provider": "email", "providers": ["email"]}'::jsonb, '{"display_name": "Advisor 3"}'::jsonb, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password, updated_at = NOW();
  INSERT INTO public.user_profiles (id, email, display_name, role, section, branch_id, max_parallel_sessions, is_trial, updated_at)
  VALUES ('20000000-0000-0000-0000-000000000023', 'advisor3.sec2@unitedmotors.com', 'Section 2 Service Advisor 3', 'advisor', 'car', 'orugodawatta_sec2', 3, TRUE, NOW())
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role, branch_id = EXCLUDED.branch_id, updated_at = NOW();

  -- Advisor 4
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES ('20000000-0000-0000-0000-000000000024', 'advisor4.sec2@unitedmotors.com', v_default_pw, NOW(), '', '', '{"provider": "email", "providers": ["email"]}'::jsonb, '{"display_name": "Advisor 4"}'::jsonb, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password, updated_at = NOW();
  INSERT INTO public.user_profiles (id, email, display_name, role, section, branch_id, max_parallel_sessions, is_trial, updated_at)
  VALUES ('20000000-0000-0000-0000-000000000024', 'advisor4.sec2@unitedmotors.com', 'Section 2 Service Advisor 4', 'advisor', 'car', 'orugodawatta_sec2', 3, TRUE, NOW())
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role, branch_id = EXCLUDED.branch_id, updated_at = NOW();

  -- Advisor 5
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES ('20000000-0000-0000-0000-000000000025', 'advisor5.sec2@unitedmotors.com', v_default_pw, NOW(), '', '', '{"provider": "email", "providers": ["email"]}'::jsonb, '{"display_name": "Advisor 5"}'::jsonb, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password, updated_at = NOW();
  INSERT INTO public.user_profiles (id, email, display_name, role, section, branch_id, max_parallel_sessions, is_trial, updated_at)
  VALUES ('20000000-0000-0000-0000-000000000025', 'advisor5.sec2@unitedmotors.com', 'Section 2 Service Advisor 5', 'advisor', 'car', 'orugodawatta_sec2', 3, TRUE, NOW())
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role, branch_id = EXCLUDED.branch_id, updated_at = NOW();

  -- Advisor 6
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES ('20000000-0000-0000-0000-000000000026', 'advisor6.sec2@unitedmotors.com', v_default_pw, NOW(), '', '', '{"provider": "email", "providers": ["email"]}'::jsonb, '{"display_name": "Advisor 6"}'::jsonb, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password, updated_at = NOW();
  INSERT INTO public.user_profiles (id, email, display_name, role, section, branch_id, max_parallel_sessions, is_trial, updated_at)
  VALUES ('20000000-0000-0000-0000-000000000026', 'advisor6.sec2@unitedmotors.com', 'Section 2 Service Advisor 6', 'advisor', 'car', 'orugodawatta_sec2', 3, TRUE, NOW())
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role, branch_id = EXCLUDED.branch_id, updated_at = NOW();

  -- 7. View Only for Driver (1 required: driver.sec2)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '20000000-0000-0000-0000-000000000030', 'driver.sec2@unitedmotors.com', v_default_pw, NOW(), '', '',
    '{"provider": "email", "providers": ["email"]}'::jsonb, '{"display_name": "Section 2 Driver (View Only)"}'::jsonb, NOW(), NOW()
  ) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password, updated_at = NOW();

  INSERT INTO public.user_profiles (id, email, display_name, role, section, branch_id, max_parallel_sessions, is_trial, updated_at)
  VALUES ('20000000-0000-0000-0000-000000000030', 'driver.sec2@unitedmotors.com', 'Section 2 Driver (Floor View Only)', 'viewer', NULL, 'orugodawatta_sec2', 5, TRUE, NOW())
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role, branch_id = EXCLUDED.branch_id, max_parallel_sessions = EXCLUDED.max_parallel_sessions, updated_at = NOW();

END $$;
