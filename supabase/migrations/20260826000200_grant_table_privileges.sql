-- Fix: "permission denied for table …" (42501) for every PostgREST caller.
--
-- The baseline enabled RLS and wrote policies but never issued table GRANTs.
-- Those are two independent gates: a policy can only narrow access that a GRANT
-- has already given. Without the GRANT, `authenticated` could not read a single
-- clinical row and `service_role` — the identity apps/api connects as — could
-- not write the sync projection at all.
--
-- Dashboard-created tables inherit grants from Supabase's default privileges,
-- which is why this stayed hidden while the schema was applied by hand in the
-- SQL editor. Declaring them explicitly makes the schema self-contained and
-- reproducible on any project.

-- The cloud API (apps/api) uses the service_role key and bypasses RLS, but
-- still needs ordinary table privileges.
grant all on table
  public.patients,
  public.specimens,
  public.results,
  public.profiles,
  public.sync_events
to service_role;

-- Browser clients: read clinical data, restricted per-row by the policies in
-- the baseline migration.
grant select on table
  public.patients,
  public.specimens,
  public.results
to authenticated;

-- Release workflow — policy limits this to authorizer/admin.
grant update on table public.results to authenticated;

-- Own profile: read + update display name.
grant select, update on table public.profiles to authenticated;

-- sync_events stays service_role only: no grants for anon/authenticated, which
-- keeps the raw edge outbox ledger out of the browser entirely.

-- Future tables in public inherit the same shape so this gap cannot silently
-- reappear. RLS still governs which rows are visible.
alter default privileges in schema public
  grant all on tables to service_role;
