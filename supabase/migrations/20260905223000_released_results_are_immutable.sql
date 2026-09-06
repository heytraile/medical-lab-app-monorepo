-- A released clinical result is terminal. Corrections after release require a
-- future, explicit amendment workflow that creates an auditable new record.
create or replace function public.protect_released_result()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'released' then
    raise exception 'Released result % is immutable', old.id
      using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists protect_released_result_update on public.results;
create trigger protect_released_result_update
  before update on public.results
  for each row execute function public.protect_released_result();

drop trigger if exists protect_released_result_delete on public.results;
create trigger protect_released_result_delete
  before delete on public.results
  for each row execute function public.protect_released_result();
