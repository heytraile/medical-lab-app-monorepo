-- Drax Hall LIS — Supabase clinical + auth schema (baseline migration)
-- Applied automatically by `supabase db reset` (local) and `supabase db push` (cloud).
-- Do not edit in place once applied to a remote project — add a new migration instead:
--   pnpm supabase:migration <name>

-- ---------------------------------------------------------------------------
-- Sync ledger (idempotent edge outbox)
-- ---------------------------------------------------------------------------
create table if not exists sync_events (
  event_id text primary key,
  edge_node_id text not null,
  type text not null,
  sequence bigint not null,
  payload jsonb not null,
  created_at timestamptz,
  received_at timestamptz not null default now()
);

create index if not exists sync_events_edge_seq
  on sync_events (edge_node_id, sequence);

-- ---------------------------------------------------------------------------
-- Clinical tables (projected from edge outbox)
-- ---------------------------------------------------------------------------
create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  edge_patient_id text unique,
  mrn text not null unique,
  external_id text,
  first_name text not null,
  middle_name text,
  last_name text not null,
  date_of_birth date,
  sex text,
  status text not null default 'active',
  identity_origin text not null default 'upstream',
  sync_status text not null default 'n_a',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists patients_mrn_idx on patients (mrn);

create table if not exists specimens (
  id uuid primary key default gen_random_uuid(),
  edge_specimen_id text unique,
  accession_number text not null unique,
  barcode text not null unique,
  patient_id uuid references patients (id),
  patient_json jsonb,
  ordered_tests jsonb not null default '[]'::jsonb,
  specimen_type text not null default 'blood',
  status text not null default 'registered',
  identity_confirmation jsonb,
  registered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists specimens_accession_idx on specimens (accession_number);

create table if not exists results (
  id uuid primary key default gen_random_uuid(),
  edge_result_id text unique,
  accession_number text not null,
  barcode text not null,
  analyzer_id text not null,
  test_code text not null,
  test_name text,
  value text not null,
  units text,
  reference_low double precision,
  reference_high double precision,
  flag text not null default 'unknown',
  status text not null default 'pending_review',
  urgency text,
  observed_at timestamptz not null,
  released_by text,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists results_accession_idx on results (accession_number);
create index if not exists results_status_idx on results (status);
create index if not exists results_flag_idx on results (flag);

-- ---------------------------------------------------------------------------
-- Profiles + roles (Supabase Auth)
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'tech'
    check (role in ('tech', 'authorizer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'tech')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table patients enable row level security;
alter table specimens enable row level security;
alter table results enable row level security;
alter table profiles enable row level security;
alter table sync_events enable row level security;

-- Service role bypasses RLS; these policies are for authenticated browser clients.

create policy "profiles_read_own"
  on profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles_update_own"
  on profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_admin_read_all"
  on profiles for select
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('admin', 'authorizer')
    )
  );

create policy "clinical_read_authenticated"
  on patients for select to authenticated using (true);

create policy "specimens_read_authenticated"
  on specimens for select to authenticated using (true);

create policy "results_read_authenticated"
  on results for select to authenticated using (true);

-- Authorizer/admin may update results (release)
create policy "results_release_authorizer"
  on results for update
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('authorizer', 'admin')
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('authorizer', 'admin')
    )
  );

-- sync_events: no authenticated access (Nest service role only)
-- (no policies → deny for anon/authenticated; service role still works)

-- ---------------------------------------------------------------------------
-- Local dev: staff logins are created by supabase/seed.sql on `supabase db reset`.
-- Cloud: invite users in Auth → Users with raw_user_meta_data.role = authorizer,
-- or: update profiles set role = 'authorizer' where email = '...';
-- Env wiring: see docs/LOCAL_DEV.md.
