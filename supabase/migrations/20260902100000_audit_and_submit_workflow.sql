-- Submit-for-release workflow + append-only clinical audit log.

alter table results add column if not exists submitted_at timestamptz;
alter table results add column if not exists submitted_by uuid references auth.users (id) on delete set null;
alter table results add column if not exists submitted_by_snapshot jsonb;
alter table results add column if not exists released_by_snapshot jsonb;

alter table specimens add column if not exists registered_by uuid references auth.users (id) on delete set null;
alter table specimens add column if not exists registered_by_snapshot jsonb;

create index if not exists results_submitted_at_idx on results (submitted_at desc);

create table if not exists clinical_audit_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_snapshot jsonb,
  payload jsonb not null default '{}'::jsonb,
  edge_node_id text
);

create index if not exists clinical_audit_log_occurred_idx
  on clinical_audit_log (occurred_at desc);

create index if not exists clinical_audit_log_entity_idx
  on clinical_audit_log (entity_type, entity_id);

alter table clinical_audit_log enable row level security;

create policy "clinical_audit_log_read_authenticated"
  on clinical_audit_log for select
  to authenticated
  using (true);

-- Inserts only via service role (Nest API). No update/delete policies for authenticated.
revoke update, delete on clinical_audit_log from authenticated;
revoke update, delete on clinical_audit_log from anon;

grant select on clinical_audit_log to authenticated;
grant all on clinical_audit_log to service_role;

create or replace function public.clinical_audit_log_deny_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'clinical_audit_log is append-only';
end;
$$;

drop trigger if exists clinical_audit_log_no_update on clinical_audit_log;
create trigger clinical_audit_log_no_update
  before update or delete on clinical_audit_log
  for each row execute function public.clinical_audit_log_deny_mutation();
