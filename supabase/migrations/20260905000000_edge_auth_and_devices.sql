-- Edge-first staff auth + lab device enrollment + device-attributed audit.
-- See docs/EDGE_AUTH_AND_STAFF.md for the plain-English design.
--
-- Staff signup now happens ONLY on the edge (lab PC). This migration adds:
--   1. profiles.cloud_login_allowed — true for admin/authorizer, false for tech
--   2. lab_devices / device_enrollment_codes / device_login_log
--   3. clinical_audit_log gains device_id + device_snapshot
--   4. custom_access_token_hook — blocks tech at Supabase Auth token-issue time

-- ---------------------------------------------------------------------------
-- 1. cloud_login_allowed
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists cloud_login_allowed boolean not null default false;

update public.profiles
  set cloud_login_allowed = true
  where role in ('admin', 'authorizer') and cloud_login_allowed is distinct from true;

-- Keep the default correct for any account still created directly in
-- Supabase Auth (e.g. via the dashboard) instead of pushed from edge.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, email, role, full_name, job_title, cloud_login_allowed
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'tech'),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'job_title',
    coalesce(new.raw_user_meta_data->>'role', 'tech') in ('admin', 'authorizer')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Lab device registry + enrollment codes + login log
-- ---------------------------------------------------------------------------
create table if not exists lab_devices (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid,
  name text not null,
  token_hash text not null unique,
  -- Who this device was issued to. Does not change unless an admin
  -- explicitly reassigns it (audited as device.reassigned).
  owner_staff_id uuid not null references profiles (id) on delete restrict,
  issued_by_staff_id uuid references profiles (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  registered_at timestamptz not null default now(),
  last_login_at timestamptz,
  last_seen_at timestamptz,
  user_agent_hint text,
  notes text,
  revoked_at timestamptz,
  revoked_by_staff_id uuid references profiles (id) on delete set null
);

create index if not exists lab_devices_owner_idx on lab_devices (owner_staff_id);
create index if not exists lab_devices_status_idx on lab_devices (status);

-- Pushed here by the edge immediately after an admin generates a code
-- (POST /sync/device-enrollment-codes, same trust boundary as outbox sync).
-- No hard FK on assign_to_staff_id/created_by: the edge Staff row that
-- created/was assigned this code may not have finished its own staff.upsert
-- sync yet — the /devices/enroll redeem step re-validates against the
-- signed-in user's own profile id, so this stays safe either way.
create table if not exists device_enrollment_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  lab_id uuid,
  created_by uuid,
  assign_to_staff_id uuid not null,
  device_label text,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_device_id uuid references lab_devices (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists device_enrollment_codes_expires_idx
  on device_enrollment_codes (expires_at);
create index if not exists device_enrollment_codes_assignee_idx
  on device_enrollment_codes (assign_to_staff_id);

-- Append-only — every cloud sign-in attempt, success or failure.
create table if not exists device_login_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  device_id uuid references lab_devices (id) on delete set null,
  user_id uuid,
  owner_staff_id uuid,
  outcome text not null check (
    outcome in (
      'success',
      'failed_password',
      'failed_device',
      'failed_role',
      'revoked_device'
    )
  ),
  ip text,
  user_agent text
);

create index if not exists device_login_log_device_idx on device_login_log (device_id);
create index if not exists device_login_log_user_idx on device_login_log (user_id);
create index if not exists device_login_log_occurred_idx on device_login_log (occurred_at desc);

-- Only the Nest API (service role) reads/writes these — no direct browser access.
alter table lab_devices enable row level security;
alter table device_enrollment_codes enable row level security;
alter table device_login_log enable row level security;

revoke all on lab_devices from authenticated, anon;
revoke all on device_enrollment_codes from authenticated, anon;
revoke all on device_login_log from authenticated, anon;
grant all on lab_devices to service_role;
grant all on device_enrollment_codes to service_role;
grant all on device_login_log to service_role;

-- ---------------------------------------------------------------------------
-- 3. Device-attributed audit trail
-- ---------------------------------------------------------------------------
alter table clinical_audit_log
  add column if not exists device_id uuid references lab_devices (id) on delete set null;
alter table clinical_audit_log
  add column if not exists device_snapshot jsonb;

create index if not exists clinical_audit_log_device_idx on clinical_audit_log (device_id);

-- ---------------------------------------------------------------------------
-- 4. Auth Hook — block cloud login for anyone with cloud_login_allowed = false
-- ---------------------------------------------------------------------------
-- Wired in supabase/config.toml as [auth.hook.custom_access_token] for local
-- dev. For hosted Supabase, run this same function and enable the hook from
-- Dashboard → Authentication → Hooks (see docs/EDGE_AUTH_AND_STAFF.md).
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  allowed boolean;
  claims jsonb;
begin
  select cloud_login_allowed into allowed
  from public.profiles
  where id = (event->>'user_id')::uuid;

  if allowed is not true then
    raise exception 'cloud login is restricted to admin and authorizer accounts — sign in on the lab PC instead';
  end if;

  claims := coalesce(event->'claims', '{}'::jsonb);
  claims := jsonb_set(claims, '{cloud_login_allowed}', 'true');
  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- The Auth server calls this hook as the supabase_auth_admin role, which
-- needs explicit grants — RLS on profiles otherwise blocks it entirely.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

grant select on table public.profiles to supabase_auth_admin;

drop policy if exists "profiles_auth_hook_read" on public.profiles;
create policy "profiles_auth_hook_read"
  on public.profiles for select
  to supabase_auth_admin
  using (true);
