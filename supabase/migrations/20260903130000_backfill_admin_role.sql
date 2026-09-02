-- Ensure seeded admin account has permission role admin on existing databases.

update public.profiles
set role = 'admin',
    job_title = coalesce(job_title, 'admin_staff'),
    full_name = coalesce(full_name, 'Sam Admin'),
    updated_at = now()
where email = 'admin@draxhall.local';
