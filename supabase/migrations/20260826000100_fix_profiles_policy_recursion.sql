-- Fix: "infinite recursion detected in policy for relation profiles" (42P17)
--
-- The baseline policies resolved a caller's role with an inline
-- `exists (select 1 from profiles ...)`. Evaluating that subquery re-triggers
-- RLS on `profiles`, which evaluates the same policy again — Postgres aborts
-- the whole statement. It broke `profiles_admin_read_all` directly, and
-- `results_release_authorizer` transitively, so no authenticated user could
-- read profiles or release a result.
--
-- A SECURITY DEFINER helper reads the role with RLS bypassed, which breaks the
-- cycle. It is STABLE so the planner evaluates it once per statement.

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke execute on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated, service_role;

drop policy if exists "profiles_admin_read_all" on profiles;
create policy "profiles_admin_read_all"
  on profiles for select
  to authenticated
  using (public.current_user_role() in ('admin', 'authorizer'));

drop policy if exists "results_release_authorizer" on results;
create policy "results_release_authorizer"
  on results for update
  to authenticated
  using (public.current_user_role() in ('authorizer', 'admin'))
  with check (public.current_user_role() in ('authorizer', 'admin'));
