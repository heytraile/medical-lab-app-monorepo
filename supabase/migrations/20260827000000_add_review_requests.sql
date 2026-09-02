-- Review requests: a tech at the bench pings the authorizer who has final say
-- on releasing results to the doctor.
--
-- The payload is deliberately descriptive (accession numbers, name, flag)
-- rather than a results.id foreign key. Bench data is served by the edge engine
-- from its own Prisma database, while this table lives in the cloud Postgres;
-- the accession number is the identifier that is stable across both.

create table if not exists review_requests (
  id uuid primary key default gen_random_uuid(),
  accession_numbers text[] not null,
  patient_display_name text,
  patient_mrn text,
  worst_flag text,
  test_codes text[] not null default '{}',
  result_count int not null default 0,
  note text,
  -- Nullable: in local dev the API runs without Supabase auth and has no real
  -- user id to attribute this to.
  requested_by uuid references auth.users (id) on delete set null,
  requested_by_email text,
  requested_at timestamptz not null default now(),
  acknowledged_by uuid references auth.users (id) on delete set null,
  acknowledged_at timestamptz
);

create index if not exists review_requests_requested_at_idx
  on review_requests (requested_at desc);

-- Partial: the only query that matters at speed is "what is still open".
create index if not exists review_requests_open_idx
  on review_requests (requested_at desc)
  where acknowledged_at is null;

alter table review_requests enable row level security;

-- Everyone signed in can see the queue: a tech needs to confirm their own ping
-- was acknowledged, and an authorizer needs the whole inbox.
create policy "review_requests_read_authenticated"
  on review_requests for select
  to authenticated
  using (true);

-- Raising a request is the tech's job, so insert is open to any role. The
-- with-check pins attribution to the caller so a request cannot be filed under
-- someone else's name.
create policy "review_requests_insert_authenticated"
  on review_requests for insert
  to authenticated
  with check (requested_by = auth.uid());

-- Acknowledging is the authorizer's sign-off, so it carries the same role gate
-- as releasing a result.
create policy "review_requests_ack_authorizer"
  on review_requests for update
  to authenticated
  using (public.current_user_role() in ('authorizer', 'admin'))
  with check (public.current_user_role() in ('authorizer', 'admin'));

-- Grants are a separate gate from RLS: a policy can only narrow what a grant
-- has already given. See 20260826000200_grant_table_privileges.sql.
grant all on table public.review_requests to service_role;
grant select, insert, update on table public.review_requests to authenticated;
