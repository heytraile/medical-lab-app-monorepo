-- Optional referring doctor contact captured at accession.

alter table requisitions
  add column if not exists referring_physician_email text;
