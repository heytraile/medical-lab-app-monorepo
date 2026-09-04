-- Track when an accession leaves the authorizer's "Ready to send" queue.
-- Clinical release status on results is unchanged; this is UI queue membership only.
alter table specimens
  add column if not exists release_queue_dismissed_at timestamptz;

create index if not exists specimens_release_queue_dismissed_idx
  on specimens (release_queue_dismissed_at)
  where release_queue_dismissed_at is null;
