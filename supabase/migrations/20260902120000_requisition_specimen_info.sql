-- Specimen collection metadata on requisitions (DHMS form Specimen Information section).
alter table requisitions
  add column if not exists specimen_info jsonb not null default '{}'::jsonb;
