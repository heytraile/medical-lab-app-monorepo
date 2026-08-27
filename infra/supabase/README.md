# Moved

The hand-applied `schema.sql` that used to live here is gone. The Supabase schema is now
version-controlled as CLI migrations:

- [`supabase/migrations/`](../../supabase/migrations) — schema history (baseline: `20260826000000_init_clinical_schema.sql`)
- [`supabase/seed.sql`](../../supabase/seed.sql) — local demo staff logins
- [`supabase/config.toml`](../../supabase/config.toml) — local stack configuration

Do **not** paste SQL into the Supabase dashboard editor — it causes drift between
environments. Instead:

```bash
pnpm supabase:start          # boot local Postgres + Auth + Storage + Studio
pnpm supabase:migration add_qc_table   # author a change
pnpm supabase:reset          # rebuild local from migrations + seed
```

Promoting to a cloud project:

```bash
pnpm exec supabase link --project-ref <ref>
pnpm exec supabase db push
```

Full workflow: [`docs/LOCAL_DEV.md`](../../docs/LOCAL_DEV.md).
