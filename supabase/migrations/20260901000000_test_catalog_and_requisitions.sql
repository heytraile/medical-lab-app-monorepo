-- Test catalog, panels, and requisitions for DHMS-style ordering.
-- Scoped by lab_id for future multi-site commercialization.

create table if not exists labs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Tie staff to a lab once we have more than one site.
alter table profiles add column if not exists lab_id uuid references labs (id);

create table if not exists test_catalog_items (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references labs (id) on delete cascade,
  code text not null,
  name text not null,
  category text not null default 'general',
  specimen_hint text,
  fasting_required boolean not null default false,
  sort_order int not null default 0,
  active boolean not null default true,
  unique (lab_id, code)
);

create index if not exists test_catalog_items_lab_category_idx
  on test_catalog_items (lab_id, category, sort_order);

create table if not exists test_panels (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references labs (id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  sort_order int not null default 0,
  active boolean not null default true,
  unique (lab_id, code)
);

create table if not exists test_panel_members (
  panel_id uuid not null references test_panels (id) on delete cascade,
  catalog_item_id uuid not null references test_catalog_items (id) on delete cascade,
  sort_order int not null default 0,
  primary key (panel_id, catalog_item_id)
);

create table if not exists requisitions (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references labs (id) on delete cascade,
  patient_id uuid references patients (id) on delete set null,
  patient_snapshot jsonb,
  referring_physician text,
  clinical_notes text,
  ordered_selections jsonb not null default '[]'::jsonb,
  ordered_tests jsonb not null default '[]'::jsonb,
  status text not null default 'registered'
    check (status in ('draft', 'registered', 'collected', 'in_progress', 'complete', 'cancelled')),
  accession_number text,
  edge_specimen_id text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists requisitions_lab_created_idx
  on requisitions (lab_id, created_at desc);

create index if not exists requisitions_accession_idx
  on requisitions (accession_number)
  where accession_number is not null;

alter table test_catalog_items enable row level security;
alter table test_panels enable row level security;
alter table test_panel_members enable row level security;
alter table requisitions enable row level security;
alter table labs enable row level security;

-- v1: single lab — any authenticated user can read/write catalog and requisitions.
create policy "catalog_items_read_authenticated"
  on test_catalog_items for select to authenticated using (true);

create policy "panels_read_authenticated"
  on test_panels for select to authenticated using (true);

create policy "panel_members_read_authenticated"
  on test_panel_members for select to authenticated using (true);

create policy "labs_read_authenticated"
  on labs for select to authenticated using (true);

create policy "requisitions_read_authenticated"
  on requisitions for select to authenticated using (true);

create policy "requisitions_insert_authenticated"
  on requisitions for insert to authenticated with check (true);

create policy "requisitions_update_authenticated"
  on requisitions for update to authenticated using (true) with check (true);

grant all on table
  public.labs,
  public.test_catalog_items,
  public.test_panels,
  public.test_panel_members,
  public.requisitions
to service_role;

grant select on table
  public.labs,
  public.test_catalog_items,
  public.test_panels,
  public.test_panel_members,
  public.requisitions
to authenticated;

grant insert, update on table public.requisitions to authenticated;
