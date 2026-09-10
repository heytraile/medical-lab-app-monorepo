-- Persist sample collector on cloud specimens and structured manual entry payload on results.

alter table specimens
  add column if not exists collected_at timestamptz,
  add column if not exists collected_by_staff_id text,
  add column if not exists collected_by_snapshot jsonb;

alter table results
  add column if not exists manual_payload_json jsonb;
