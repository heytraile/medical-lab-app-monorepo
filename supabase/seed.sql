-- Drax Hall LIS — local development seed.
-- Runs automatically after migrations on `pnpm supabase:reset`.
--
-- LOCAL ONLY. These are throwaway credentials for the Docker stack on your
-- machine; `supabase db push` never sends this file to a cloud project.
--
--   authorizer@draxhall.local / password123   → can release results
--   tech@draxhall.local       / password123   → bench review only
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
where u.email in ('authorizer@draxhall.local', 'tech@draxhall.local')
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
