-- Per-tube barcodes on the accession-level specimens row (edge remains N rows).
alter table public.specimens
  add column if not exists containers jsonb;

comment on column public.specimens.containers is
  'Array of { barcode, specimenNumber, departmentKey, collectionType, specimenId } from edge register.';
