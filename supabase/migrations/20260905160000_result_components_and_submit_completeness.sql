-- Component-aware manual results and the point-in-time completeness snapshot
-- acknowledged by the bench tech when submitting an incomplete accession.

alter table public.results
  add column if not exists ordered_test_code text,
  add column if not exists result_component_code text;

alter table public.specimens
  add column if not exists submit_missing_expected jsonb;

create index if not exists results_ordered_test_component_idx
  on public.results (accession_number, ordered_test_code, result_component_code);
