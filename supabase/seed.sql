-- Drax Hall LIS — local development seed.
-- Runs automatically after migrations on `pnpm supabase:reset`.
--
-- LOCAL ONLY. These are throwaway credentials for the Docker stack on your
-- machine; `supabase db push` never sends this file to a cloud project.
--
--   admin@draxhall.local      / password123   → staff management
--   authorizer@draxhall.local / password123   → can release results
--   tech@draxhall.local       / password123   → phlebotomist (Marlon Reid)
--   phleb@draxhall.local      / password123   → lab technologist (Jordan Blake)
--   karen@draxhall.local      / password123   → phlebotomist (Karen Sinclair)
--   reception@draxhall.local  / password123   → receptionist (Tanya Clarke)
--   labtech@draxhall.local    / password123   → lab technologist (Devon Matthews)
--
-- Clinical rows are NOT seeded here — they arrive through the real edge sync
-- loop (edge-engine → POST /sync/events → cloud API), which is what we want to
-- exercise locally.

create extension if not exists pgcrypto with schema extensions;

-- Fixed UUIDs keep reruns deterministic and make debugging easier.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  -- GoTrue scans these nullable text columns into plain Go strings, so a NULL
  -- here fails every sign-in with "Database error querying schema". The normal
  -- signup path writes '' — hand-inserted rows must do the same.
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  email_change_token_current
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'authorizer@draxhall.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"authorizer","full_name":"Dr. Alicia Bennett"}'::jsonb,
    now(),
    now(),
    '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'tech@draxhall.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"tech","full_name":"Marlon Reid"}'::jsonb,
    now(),
    now(),
    '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '33333333-3333-4333-8333-333333333333',
    'authenticated',
    'authenticated',
    'admin@draxhall.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"admin","full_name":"Sam Admin","job_title":"admin_staff"}'::jsonb,
    now(),
    now(),
    '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '44444444-4444-4444-8444-444444444444',
    'authenticated',
    'authenticated',
    'phleb@draxhall.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"tech","full_name":"Jordan Blake","job_title":"lab_technologist"}'::jsonb,
    now(),
    now(),
    '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '55555555-5555-4555-8555-555555555555',
    'authenticated',
    'authenticated',
    'karen@draxhall.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"tech","full_name":"Karen Sinclair","job_title":"phlebotomist"}'::jsonb,
    now(),
    now(),
    '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '66666666-6666-4666-8666-666666666666',
    'authenticated',
    'authenticated',
    'reception@draxhall.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"tech","full_name":"Tanya Clarke","job_title":"receptionist"}'::jsonb,
    now(),
    now(),
    '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '77777777-7777-4777-8777-777777777777',
    'authenticated',
    'authenticated',
    'labtech@draxhall.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"tech","full_name":"Devon Matthews","job_title":"lab_technologist"}'::jsonb,
    now(),
    now(),
    '', '', '', '', ''
  )
on conflict (id) do nothing;

-- GoTrue requires a matching identity row for email/password sign-in.
insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  u.id,
  u.id::text,
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(),
  now(),
  now()
from auth.users u
where u.email in (
  'admin@draxhall.local',
  'authorizer@draxhall.local',
  'tech@draxhall.local',
  'phleb@draxhall.local',
  'karen@draxhall.local',
  'reception@draxhall.local',
  'labtech@draxhall.local'
)
on conflict (provider_id, provider) do nothing;

-- handle_new_user() already created the profile rows with the right role;
-- backfill the display name so the sidebar shows something friendly.
update public.profiles p
set full_name = u.raw_user_meta_data ->> 'full_name',
    updated_at = now()
from auth.users u
where u.id = p.id
  and p.full_name is null
  and u.raw_user_meta_data ? 'full_name';

-- Drax Hall lab row for catalog + requisitions (multi-lab scaffold).
insert into public.labs (id, code, name)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'drax-hall',
  'Drax Hall Clinical Laboratory'
)
on conflict (id) do nothing;

update public.profiles
set lab_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
where lab_id is null;

update public.profiles
set job_title = 'phlebotomist',
    full_name = coalesce(full_name, 'Marlon Reid')
where email = 'tech@draxhall.local';

update public.profiles
set job_title = 'lab_technologist',
    full_name = coalesce(full_name, 'Jordan Blake')
where email = 'phleb@draxhall.local';

update public.profiles
set role = 'admin',
    job_title = coalesce(job_title, 'admin_staff'),
    full_name = coalesce(full_name, 'Sam Admin')
where email = 'admin@draxhall.local';

update public.profiles
set job_title = 'physician',
    full_name = coalesce(full_name, 'Dr. Alicia Bennett')
where email = 'authorizer@draxhall.local';

update public.profiles
set job_title = 'phlebotomist',
    full_name = coalesce(full_name, 'Karen Sinclair')
where email = 'karen@draxhall.local';

update public.profiles
set job_title = 'receptionist',
    full_name = coalesce(full_name, 'Tanya Clarke')
where email = 'reception@draxhall.local';

update public.profiles
set job_title = 'lab_technologist',
    full_name = coalesce(full_name, 'Devon Matthews')
where email = 'labtech@draxhall.local';
