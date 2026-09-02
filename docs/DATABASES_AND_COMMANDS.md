# Databases, migrations, and commands — a plain-English guide

This document is for anyone learning how this lab app stores data and which commands to run. You do **not** need a computer science background to read it.

If you see a word you do not know, check the [Glossary of terms](#glossary-of-terms) at the bottom.

---

## The big picture: why this app uses two databases

Imagine a medical lab with two desks:

1. **The front desk at the lab (the “edge”)**  
   This is the computer next to the analyzers and the label printer. It must work even if the internet drops. It keeps a **local notebook** of patients who walked in today, specimens you accessioned, and results coming off the machines.

2. **The main office in the cloud**  
   This is the central system of record: staff logins, the full test catalog, requisitions (what the doctor ordered), and results waiting for an authorizer to release. It lives in a **bigger filing system** that multiple people can reach when online.

This project uses **two different databases** on purpose:

| Database | Technology | Where it runs | What it stores |
| --- | --- | --- | --- |
| **Edge database** | **SQLite** (a single file on disk) | Lab mini PC in production; your Mac in dev | Specimens, barcodes, bench results, label printing |
| **Cloud database** | **PostgreSQL** via **Supabase** | Hosted Supabase in production; Docker on your Mac in dev | Patients (cloud copy), requisitions, test catalog, auth, released results |

**Important:** In production, the edge still uses **SQLite on the mini PC**. The cloud uses **hosted Supabase** (real cloud). On your Mac during development, you use **local Supabase** (Postgres in Docker) instead of paying for cloud — but it is the *same kind* of database as production cloud.

```text
                    YOUR MAC (development)
┌─────────────────────────────────────────────────────────┐
│  Web app (browser)                                      │
│       │                    │                            │
│       ▼                    ▼                            │
│  Edge engine          Cloud API                         │
│       │                    │                            │
│       ▼                    ▼                            │
│  SQLite file          Local Supabase (Docker)           │
│  (e.g. dev.db)        “pretend cloud” on your machine   │
└─────────────────────────────────────────────────────────┘

                    DRAX HALL (production)
┌─────────────────────────────────────────────────────────┐
│  Web / Edge on mini PC  ──sync when online──►  Hosted   │
│       │                                        Supabase │
│       ▼                                        (cloud)  │
│  SQLite on mini PC                                      │
└─────────────────────────────────────────────────────────┘
```

---

## What is a “database” in simple terms?

A **database** is organized storage for information your app needs to remember: patient names, test orders, accession numbers, etc.

Instead of scattered spreadsheets, the app reads and writes through **tables** (like sheets with rows and columns). The app’s code asks questions like “show me all tests on this accession” and the database answers.

---

## What is a migration?

### The filing cabinet analogy

Think of your database as a **filing cabinet** with drawers (tables) and folders (columns).

When you first build the app, you decide: “Drawer A = patients, Drawer B = specimens, each folder labeled name, date of birth, …”

Later you realize: “We need a new folder in the requisitions drawer called **specimen information**.”

You have two bad options:

- **Wing it:** Open the cabinet and stick labels on by hand on every machine. Soon your lab cabinet and your home test cabinet look different. Bugs appear.
- **The right way — a migration:** Write down an official instruction: “Add folder `specimen_info` to requisitions drawer.” Save that instruction in git. Run a command that applies it everywhere the same way.

A **migration** is a **saved, versioned instruction** that changes the database structure (add a table, add a column, change permissions). Each migration is a small file. They run **in order**, like chapters in a manual.

### Why we need a migration every time we change structure

When **code** expects a column that **does not exist** in the database, the app crashes or behaves wrongly.

Migrations make sure:

1. **Everyone’s database matches** — your Mac, a teammate’s Mac, staging, production.
2. **Changes are repeatable** — you do not rely on memory or clicking in a web UI.
3. **You can see history** — “when did we add specimen info?” → look at the migration file and date.

### What counts as a “big change” that needs a migration?

| Needs a migration | Does **not** need a migration |
| --- | --- |
| New table | Adding more **rows** (e.g. a new patient) |
| New column | Updating a patient’s phone number |
| New index or permission rule | Loading new test names from a seed file (catalog sync) |
| Renaming or removing a column | Changing app colors or button text |

**Example from this project:** Adding `specimen_info` to requisitions → **migration**.  
Adding 180 tests to the catalog → **not** a migration (data sync into existing tables).

---

## Prisma and the edge (SQLite) database

### What is Prisma?

**Prisma** (pronounced PRIZ-muh) is a tool that sits between the edge app’s code and the SQLite file.

- You describe tables in a file called **`schema.prisma`** (human-readable blueprint).
- Prisma generates code so the app can read/write patients and specimens safely.
- **Prisma is only used for the edge SQLite database**, not for Supabase.

### What is SQLite?

**SQLite** is a database stored as **one file** on disk (for example `dev.db`). No separate database server to install. Perfect for a mini PC that must work offline.

### How Prisma “migrations” work in this repo

This project uses Prisma’s **`db push`** workflow for development (not a long folder of Prisma migration files yet). In plain English:

| Step | Command | What it does |
| --- | --- | --- |
| 1 | Edit `apps/edge-engine/prisma/schema.prisma` | You change the blueprint (e.g. add a field on Specimen). |
| 2 | `pnpm db:generate` | Prisma updates the **code** that talks to the database so TypeScript knows about the new field. |
| 3 | `pnpm db:push` | Prisma **updates the actual SQLite file** to match the blueprint. |

**`db:generate`** = update the instruction manual for the app.  
**`db:push`** = rebuild the filing cabinet to match the manual.

The `:bare` versions (`pnpm db:generate:bare`, `pnpm db:push:bare`) do the same thing **without** loading secrets from Doppler. Use them when you run `pnpm dev:local` and are not using Doppler.

### Edge database commands (SQLite) — cheat sheet

Run these from the **root** of the monorepo (the folder with the main `package.json`):

| Command | When to use it |
| --- | --- |
| `pnpm db:generate` | After changing `schema.prisma` — refreshes generated code. |
| `pnpm db:push` | After `db:generate` — applies structure changes to the SQLite file. |
| `pnpm db:generate:bare` | Same as above, no Doppler. |
| `pnpm db:push:bare` | Same as above, no Doppler. |

**Typical sequence after an edge schema change:**

```bash
pnpm db:generate:bare
pnpm db:push:bare
```

Then restart the edge engine (`pnpm dev:local` or your usual dev command).

**Where is the file?** Controlled by `DATABASE_URL` in env — often `file:./dev.db` inside the edge-engine app folder.

---

## Supabase and the cloud (PostgreSQL) database

### What is Supabase?

**Supabase** is a product that gives you:

- **PostgreSQL** — a powerful database server (heavier than SQLite, meant for many users and the cloud).
- **Auth** — sign-in, passwords, roles.
- **Studio** — a web UI to browse tables (like a friendly view of the filing cabinet).

Your app’s **cloud API** talks to Supabase for requisitions, catalog, and staff accounts.

### What is PostgreSQL?

**PostgreSQL** (often called Postgres) is a **database server**. Unlike SQLite’s single file, it runs as a service and handles many connections. Supabase wraps Postgres plus extras.

### Local Supabase vs cloud Supabase

| | **Local Supabase** (your Mac) | **Cloud Supabase** (hosted) |
| --- | --- | --- |
| **What it is** | Postgres + Auth running in **Docker** on your machine | Postgres + Auth on Supabase’s servers |
| **Why use it** | Develop without paying, no internet required for DB | Real staging/production |
| **How you start it** | `pnpm supabase:start` | Nothing to start — it is always on |
| **Secrets** | `supabase/local.env` (fixed demo keys, safe to commit) | Doppler or dashboard (real secrets) |
| **How you run the app against it** | `pnpm dev:local` | `pnpm dev` (with Doppler) |
| **Migrations** | Same **files** in `supabase/migrations/` | Same **files**, applied with `db push` to remote |

**Key idea:** Local Supabase is not a different *kind* of database. It is the **same Postgres + Supabase stack**, just running on your laptop so you can practice.

### Where Supabase migrations live

All cloud database structure changes go in:

```text
supabase/migrations/
```

Each file is named with a timestamp, e.g. `20260902120000_requisition_specimen_info.sql`.  
They run **in order**. Never edit old migration files after they have been shared — add a **new** file instead.

There is also `supabase/seed.sql` — starter data (demo users, lab row) run on **reset**, not on every small change.

---

## Supabase migration commands — all three situations

### 1) Local Supabase (development on your Mac)

| Command | Plain English |
| --- | --- |
| `pnpm supabase:start` | Turn on the local cloud database (Docker). First time downloads images; can take a few minutes. |
| `pnpm supabase:status` | “Is it running?” Shows URLs and keys (Studio, Postgres port, etc.). |
| `pnpm supabase:stop` | Turn off Docker Supabase. **Your data stays** until you reset. |
| `pnpm supabase:reset` | **Erase local cloud data**, re-run **all** migration files from scratch, then run `seed.sql`. Use after pulling new migrations or when you want a clean slate. |
| `pnpm supabase:migration my_change_name` | Creates a **new empty** migration file for you to edit (developers add SQL). |
| `pnpm supabase:types` | Regenerates TypeScript types from the local DB shape (after schema changes). |
| `pnpm exec supabase migration up` | Apply **only pending** migrations without wiping data (not wrapped in package.json; run manually if you want to keep local rows). |

**Most common workflow when someone adds a cloud migration (like `specimen_info`):**

```bash
# 1. Make sure Docker is running
pnpm supabase:start

# 2. Apply all migrations fresh (wipes local cloud data)
pnpm supabase:reset

# 3. Start the app
pnpm dev:local
```

**Open Supabase Studio (table viewer):** http://127.0.0.1:54323  
**Demo logins (after reset):** `tech@draxhall.local` / `password123` for accession; **`admin@draxhall.local`** / `password123` for Staff registry and full authorizer powers (release + assign authorizers).

### 2) Cloud Supabase (hosted — staging or production)

You do **not** use `supabase:start` or `supabase:reset` on production. Those are for local Docker only.

| Command | Plain English |
| --- | --- |
| `pnpm exec supabase link --project-ref <ref>` | One-time: connect this repo to your hosted Supabase project. |
| `pnpm exec supabase db push` | Apply **pending** migration files to the **remote** database. |

Then point the app at hosted URLs via **Doppler** and run `pnpm dev` (or deploy your servers).

**Never** put production `service_role` keys in `supabase/local.env`. Real secrets live in Doppler.

### 3) Edge SQLite (Prisma) — recap

Already covered above. This is **separate** from Supabase. Changing requisitions in the cloud does **not** automatically change edge SQLite — they sync through the app’s **outbox** when online.

| Command | Plain English |
| --- | --- |
| `pnpm db:generate` / `pnpm db:generate:bare` | Refresh Prisma client after `schema.prisma` changes. |
| `pnpm db:push` / `pnpm db:push:bare` | Apply `schema.prisma` to the SQLite file. |

---

## Which migration do I run for a given change?

Use this decision table:

| What changed | What to run |
| --- | --- |
| New column/table in **Supabase** (`supabase/migrations/*.sql`) | `pnpm supabase:reset` (local) or `pnpm exec supabase db push` (hosted) |
| New field in **edge** Prisma schema | `pnpm db:generate:bare` then `pnpm db:push:bare` |
| New tests in catalog (`packages/catalog/...`) | **No migration** — restart cloud API; catalog syncs on `GET /catalog` |
| Only changed React UI | **No database command** |

**Recent example — Specimen Information on Accession:**

- Added `specimen_info` column → **Supabase migration** → run `pnpm supabase:reset` locally.
- Edge already had `specimenType` and `collectedAt` columns in Prisma — we only started **sending** those values; **no** `db:push` needed for that part.

---

## Every command in the root `package.json`

All commands are run from the project root unless noted.

### Running the application

| Command | What it does |
| --- | --- |
| `pnpm dev` | Starts web + edge + cloud API + simulators. Uses **Doppler** for secrets and a **hosted** Supabase project. |
| `pnpm dev:local` | **Recommended for daily work.** Same apps, but cloud DB is **local Supabase** in Docker (`supabase/local.env`). No Doppler account needed. |
| `pnpm dev:bare` | Starts apps **without** injecting secrets. Cloud API may use in-memory storage if Supabase is not configured. Quick smoke test only. |
| `pnpm dev:edge` | Only edge engine + web (lab counter, bench, labels). |
| `pnpm dev:cloud` | Only cloud API + web (requisitions, catalog, login). |
| `pnpm dev:sim` | Only fake analyzers / instrument simulators. |

**Memory aid:** `dev:local` = “everything on my Mac, including pretend cloud.” `dev` = “talk to real cloud Supabase via Doppler.”

### Checking code quality (not databases)

| Command | What it does |
| --- | --- |
| `pnpm build` | Compiles all packages/apps for production. |
| `pnpm lint` | Style and common mistake checks. |
| `pnpm typecheck` | TypeScript consistency checks. |
| `pnpm test` | Runs automated tests. |

### Edge database (SQLite / Prisma)

| Command | What it does |
| --- | --- |
| `pnpm db:generate` | Regenerate Prisma client (with Doppler env if configured). |
| `pnpm db:push` | Push Prisma schema to SQLite file. |
| `pnpm db:generate:bare` | Same, no Doppler. |
| `pnpm db:push:bare` | Same, no Doppler. |

### Cloud database (Supabase / Postgres)

| Command | What it does |
| --- | --- |
| `pnpm supabase:start` | Start local Supabase (Docker). |
| `pnpm supabase:stop` | Stop local Supabase. |
| `pnpm supabase:status` | Show if running + URLs/keys. |
| `pnpm supabase:reset` | Wipe local Supabase data; apply all migrations + seed. |
| `pnpm supabase:migration <name>` | Create a new migration SQL file. |
| `pnpm supabase:types` | Generate TypeScript types from local DB. |
| `pnpm supabase` | Run any other Supabase CLI command. |

### Automatic (you do not run manually)

| Hook | What it does |
| --- | --- |
| `postinstall` (after `pnpm install`) | Builds shared packages: contracts, protocols, catalog. |

---

## Other useful database-related commands (not in package.json)

| Command | When |
| --- | --- |
| `pnpm exec supabase migration up` | Apply new Supabase migrations **without** wiping local data. |
| `pnpm exec supabase db push` | Push migrations to **hosted** Supabase. |
| `pnpm install` | After pulling code; also rebuilds shared packages via postinstall. |
| `curl -X POST http://localhost:3101/patients/seed` | Re-seed demo patients on the **edge** only. |

---

## A simple “first day on the project” checklist

```bash
# 1. Install dependencies
pnpm install

# 2. Set up edge SQLite
pnpm db:generate:bare
pnpm db:push:bare

# 3. Start local cloud database
pnpm supabase:start
pnpm supabase:reset    # first time, or after pulling new migrations

# 4. Run everything
pnpm dev:local
```

Then open http://localhost:3100. Use `tech@draxhall.local` / `password123` for accession, or `admin@draxhall.local` / `password123` for Staff registry and authorizer powers.

---

## When something goes wrong

| Symptom | Things to try |
| --- | --- |
| API says “in-memory sync store” | Run `pnpm supabase:start` — cloud DB not running. |
| Column does not exist errors on cloud | Run `pnpm supabase:reset` after pulling new migrations. |
| Prisma errors on edge (`requisitionId` column missing, P2022) | `pnpm db:generate:bare && pnpm db:push:bare` — `pnpm dev:local` runs `db:push:bare` automatically on start |
| `supabase start` fails | Start **Docker Desktop** and wait until it is fully running. |
| Sign-in database errors after reset | Re-run `pnpm supabase:reset` — seed creates auth users correctly. |

More troubleshooting: [LOCAL_DEV.md](./LOCAL_DEV.md).

---

## Glossary of terms

| Term | Meaning |
| --- | --- |
| **API** | Application Programming Interface — the server program your web app calls over HTTP (e.g. port 3101 edge, 3102 cloud). |
| **Accession** | Assigning a specimen an ID/barcode when it enters the lab. |
| **Auth** | Authentication — proving who is signed in (email/password). |
| **CLI** | Command Line Interface — typing commands in Terminal instead of clicking. |
| **Cloud** | Servers on the internet (or local Docker pretending to be cloud during dev). |
| **Column** | One field in a table (e.g. `collected_by`). |
| **Database** | Organized storage for app data. |
| **Docker** | Runs Supabase as packaged services on your Mac. |
| **Doppler** | Service that stores secrets (API keys, database URLs) for hosted environments. |
| **Edge** | The lab-floor computer / mini PC running SQLite next to instruments. |
| **Migration** | Versioned file that changes database **structure**. |
| **Monorepo** | One git repository containing multiple apps (`apps/web`, `apps/api`, etc.). |
| **ORM** | Object-Relational Mapping — Prisma maps tables to code objects. |
| **Postgres / PostgreSQL** | Server database used by Supabase. |
| **Prisma** | Tool for edge SQLite schema and queries. |
| **Requisition** | The order of tests for a patient (from the doctor’s form). |
| **RLS** | Row Level Security — database rules about who can see which rows. |
| **Schema** | The blueprint of tables and columns. |
| **Seed** | Starter data (demo users, default lab) loaded after reset. |
| **SQLite** | Single-file database on the edge mini PC. |
| **SQL** | Structured Query Language — language for defining tables and querying data. |
| **Supabase** | Postgres + Auth + tools; local in Docker or hosted in cloud. |
| **Sync / outbox** | Edge saves work locally, then sends copies to cloud when online. |
| **Table** | A collection of rows in the database (e.g. `requisitions`). |
| **Turbo / Turborepo** | Runs `dev`, `build`, etc. across all apps in the monorepo. |
| **TypeScript types** | Descriptions of data shapes in code; `supabase:types` regenerates them from DB. |

---

## Related docs

- [LOCAL_DEV.md](./LOCAL_DEV.md) — ports, Docker, Doppler, troubleshooting.
- [REQUISITION.md](./REQUISITION.md) — how test orders and catalog work.
- [GLOSSARY.md](./GLOSSARY.md) — lab and technical acronyms for the whole product.

---

*Last updated for the Drax Hall LIS monorepo — edge SQLite (Prisma) + Supabase Postgres (local and hosted).*
