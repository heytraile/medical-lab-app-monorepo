-- Staff job titles (separate from permission role) + collector dropdown support.

alter table public.profiles
  add column if not exists job_title text
    check (
      job_title is null
      or job_title in (
        'phlebotomist',
        'lab_technologist',
        'receptionist',
        'physician',
        'admin_staff',
        'other'
      )
    );

alter table public.profiles
  add column if not exists is_active boolean not null default true;

-- Signup / admin.createUser: persist display name and job title on profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, full_name, job_title)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'tech'),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'job_title'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Accession collector dropdown: same-lab colleagues (active only).
drop policy if exists "profiles_lab_colleagues_read" on public.profiles;
create policy "profiles_lab_colleagues_read"
  on public.profiles for select
  to authenticated
  using (
    is_active = true
    and lab_id is not null
    and lab_id = (select lab_id from public.profiles where id = auth.uid())
  );
