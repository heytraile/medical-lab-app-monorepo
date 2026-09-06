alter table public.results
  add column if not exists manual_entered_by text,
  add column if not exists manual_entered_by_snapshot jsonb,
  add column if not exists manual_entered_at timestamptz,
  add column if not exists manual_last_edited_by text,
  add column if not exists manual_last_edited_by_snapshot jsonb,
  add column if not exists manual_last_edited_at timestamptz;
