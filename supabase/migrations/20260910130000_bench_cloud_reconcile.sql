-- Controlled reconciliation when edge SQLite is reseeded but cloud Postgres retained
-- stale clinical rows. Normal client updates cannot mutate released results; this
-- RPC sets lis.reconcile_bench for the transaction so drift can be repaired safely.

create or replace function public.protect_released_result()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'released'
     and coalesce(current_setting('lis.reconcile_bench', true), '') <> 'true' then
    raise exception 'Released result % is immutable', old.id
      using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.reconcile_bench_cloud_results(
  p_delete_edge_result_ids text[] default '{}',
  p_delete_cloud_ids uuid[] default '{}',
  p_reset_edge_result_ids text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_by_edge int := 0;
  deleted_by_cloud int := 0;
  reset_count int := 0;
begin
  perform set_config('lis.reconcile_bench', 'true', true);

  if coalesce(array_length(p_delete_edge_result_ids, 1), 0) > 0 then
    delete from public.results
    where edge_result_id = any (p_delete_edge_result_ids);
    get diagnostics deleted_by_edge = row_count;
  end if;

  if coalesce(array_length(p_delete_cloud_ids, 1), 0) > 0 then
    delete from public.results
    where id = any (p_delete_cloud_ids);
    get diagnostics deleted_by_cloud = row_count;
  end if;

  if coalesce(array_length(p_reset_edge_result_ids, 1), 0) > 0 then
    update public.results
    set
      status = 'pending_review',
      submitted_by = null,
      submitted_by_snapshot = null,
      submitted_at = null,
      released_by = null,
      released_at = null,
      released_by_snapshot = null,
      updated_at = now()
    where edge_result_id = any (p_reset_edge_result_ids)
      and status in ('released', 'pending_authorization');
    get diagnostics reset_count = row_count;
  end if;

  return jsonb_build_object(
    'deletedByEdgeResultId', deleted_by_edge,
    'deletedByCloudId', deleted_by_cloud,
    'reset', reset_count
  );
end;
$$;

comment on function public.reconcile_bench_cloud_results is
  'Repairs cloud clinical projection drift after edge bench reseed. Service-role only.';

revoke all on function public.reconcile_bench_cloud_results from public;
grant execute on function public.reconcile_bench_cloud_results to service_role;
