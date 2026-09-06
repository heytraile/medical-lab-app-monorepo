-- Lab staff messenger (DMs + channels). Synced from edge outbox; cloud-capable
-- users also write/read via Realtime. See docs/MESSAGING.md.

create table if not exists public.conversations (
  id uuid primary key,
  lab_id uuid,
  kind text not null check (kind in ('dm', 'channel')),
  slug text,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lab_id, kind, slug)
);

create index if not exists conversations_kind_idx on public.conversations (kind);
create index if not exists conversations_updated_idx on public.conversations (updated_at desc);

create table if not exists public.conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  staff_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin')),
  joined_at timestamptz not null default now(),
  unique (conversation_id, staff_id)
);

create index if not exists conversation_members_staff_idx
  on public.conversation_members (staff_id);

create table if not exists public.messages (
  id uuid primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_staff_id uuid not null references public.profiles (id) on delete restrict,
  body text not null,
  created_at timestamptz not null,
  local_sequence bigint not null default 0,
  origin text not null default 'edge' check (origin in ('edge', 'cloud')),
  edge_node_id text,
  synced_from_edge_at timestamptz,
  inserted_at timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc, local_sequence desc);
create index if not exists messages_created_idx
  on public.messages (created_at desc);
create index if not exists messages_inserted_idx
  on public.messages (inserted_at desc);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- Members can read conversations they belong to.
drop policy if exists "conversations_select_member" on public.conversations;
create policy "conversations_select_member"
  on public.conversations for select
  to authenticated
  using (
    exists (
      select 1 from public.conversation_members m
      where m.conversation_id = conversations.id
        and m.staff_id = auth.uid()
    )
  );

drop policy if exists "conversation_members_select_self" on public.conversation_members;
create policy "conversation_members_select_self"
  on public.conversation_members for select
  to authenticated
  using (
    staff_id = auth.uid()
    or exists (
      select 1 from public.conversation_members m
      where m.conversation_id = conversation_members.conversation_id
        and m.staff_id = auth.uid()
    )
  );

drop policy if exists "messages_select_member" on public.messages;
create policy "messages_select_member"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.conversation_members m
      where m.conversation_id = messages.conversation_id
        and m.staff_id = auth.uid()
    )
  );

-- Cloud-capable clients may insert into conversations they belong to.
drop policy if exists "messages_insert_member" on public.messages;
create policy "messages_insert_member"
  on public.messages for insert
  to authenticated
  with check (
    sender_staff_id = auth.uid()
    and exists (
      select 1 from public.conversation_members m
      where m.conversation_id = messages.conversation_id
        and m.staff_id = auth.uid()
    )
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.cloud_login_allowed = true
    )
  );

-- Service role (Nest sync projector) bypasses RLS by default; grant table access.
grant select, insert, update, delete on public.conversations to service_role;
grant select, insert, update, delete on public.conversation_members to service_role;
grant select, insert, update, delete on public.messages to service_role;

grant select on public.conversations to authenticated;
grant select on public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;

-- Realtime for remote admin/authorizer inbox.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
