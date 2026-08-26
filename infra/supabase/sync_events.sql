-- Future Supabase migration placeholder (Phase 2).
-- Edge sync currently works with the Nest API in-memory store when env is unset.

create table if not exists sync_events (
  event_id text primary key,
  edge_node_id text not null,
  type text not null,
  sequence bigint not null,
  payload jsonb not null,
  created_at timestamptz,
  received_at timestamptz not null default now()
);

create index if not exists sync_events_edge_seq
  on sync_events (edge_node_id, sequence);
