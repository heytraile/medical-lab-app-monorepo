# Local development — simulated lab

Run the full edge loop on this Mac **without** the four physical analyzers.

Clinical product rules (Bench Review, authorizer release, critical STAT alerts) live in [WORKFLOW.md](./WORKFLOW.md) — implement those next; this doc is how to run the stack locally.

Confused by an acronym or assay code? See [GLOSSARY.md](./GLOSSARY.md). Curious how staff sign-in actually works (edge vs cloud, device enrollment)? See [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md).

## Prerequisites

- Node.js ≥ 20 (`nvm use` if you have `.nvmrc`)
- pnpm 11 (`corepack enable`)
- **Docker Desktop** — runs the local Supabase stack (Postgres + Auth + Storage + Studio)
- Optional: **Doppler CLI** ([install](https://docs.doppler.com/docs/install-cli)) — only needed to talk to a *hosted* Supabase project
- Optional: `socat` (for serial PTY pairs)

The Supabase CLI is pinned as a repo devDependency — no global install.

## Two ways to run

| Command | Cloud database | Secrets from |
| --- | --- | --- |
| `pnpm dev:local` | **Local Supabase** in Docker | [`supabase/local.env`](../supabase/local.env) (committed) |
| `pnpm dev` | Hosted Supabase project | Doppler `drax-lis` / `dev` |
| `pnpm dev:bare` | none → API falls back to in-memory | nothing injected |

**`pnpm dev:local` is the default day-to-day workflow.** It needs no Doppler account, no
hosted project, and no shared credentials — see [Local Supabase](#local-supabase-cli-stack).

> Turborepo 2 runs tasks in **strict env mode**: a variable not listed in
> `globalPassThroughEnv` in [`turbo.json`](../turbo.json) is stripped before your app sees
> it. If you add a new env key, add it there too or it will silently read as `undefined`.

## Environment (Doppler)

Doppler is for **hosted** Supabase projects (staging / production). For everyday local work
use `pnpm dev:local`, which reads the committed [`supabase/local.env`](../supabase/local.env)
instead and needs none of this setup.

Hosted-project env vars live in **Doppler** project `drax-lis`, config `dev` ([`doppler.yaml`](../doppler.yaml)).

```bash
# once
doppler login
cd medical-lab-app-monorepo
doppler setup   # select project drax-lis / config dev
# or non-interactive:
# doppler setup --no-interactive -p drax-lis -c dev

# set secrets (dashboard or CLI)
doppler secrets set EDGE_SYNC_TOKEN=dev-edge-sync-token
doppler secrets set SUPABASE_URL=https://xxxx.supabase.co
# …
```

`pnpm dev` / `pnpm db:*` call [`scripts/with-doppler.sh`](../scripts/with-doppler.sh), which injects Doppler secrets when the CLI is logged in and the project exists. If Doppler is missing or not set up yet, those scripts **fall back** to running without injection (and print a warning) so local work is not blocked. Use `pnpm dev:bare` to skip Doppler on purpose.

**Do not** treat `apps/*/.env` as the source of truth. Those files are gitignored leftovers. [`.env.example`](../apps/edge-engine/.env.example) files are a **key catalog** only.

### Key catalog (put these in Doppler `dev`)

| Key | Used by | Notes |
| --- | --- | --- |
| `EDGE_ENGINE_PORT` | edge | Default `3101` (avoid shared `PORT`) |
| `API_PORT` | api | Default `3102` |
| `DATABASE_URL` | edge / Prisma | e.g. `file:./dev.db` |
| `EDGE_NODE_ID` | edge | e.g. `drax-hall-edge-1` |
| `CLOUD_API_URL` | edge | `http://localhost:3102` |
| `CLOUD_SYNC_ENABLED` | edge | `true` / `false` |
| `EDGE_SYNC_TOKEN` | edge + api | Same value both sides |
| `EDGE_JWT_SECRET` | edge | Signs edge staff login sessions — see [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md); optional locally (falls back to an insecure dev default with a warning) |
| `EDGE_STAFF_SEED` | edge | `true` (default) seeds the 7 dev staff accounts on first boot; set `false` to test the bootstrap-admin flow from empty |
| `SUPABASE_URL` | api | Optional; empty → in-memory sync |
| `SUPABASE_SERVICE_ROLE_KEY` | api | Server only — never `VITE_` |
| `VITE_LIS_API_URL` | web | `http://localhost:3101` |
| `VITE_LIS_MODE` | web | `edge` or `cloud` |
| `VITE_WS_URL` | web | Socket.IO base |
| `VITE_CLOUD_API_URL` | web | `http://localhost:3102` |
| `VITE_SUPABASE_URL` | web | Anon client |
| `VITE_SUPABASE_ANON_KEY` | web | Browser-safe anon key |
| `SYSMEX_TCP_PORT` / `MINDRAY_TCP_PORT` / `IFLASH_TCP_PORT` | edge / sims | Defaults 5001 / 5003 / 5004 |
| `ZEBRA_PRINTER_HOST` / `ZEBRA_PRINTER_PORT` | edge | Defaults `127.0.0.1` / `9100` |
| `PROLYTE_SERIAL_PATH` / `PROLYTE_BAUD` | edge / sims | Optional RS-232 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM` | api | Local Mailpit only — see [EMAIL.md](./EMAIL.md) |
| `RESEND_API_KEY` | api | Production/staging — Resend (per client); empty locally |
| `REVIEW_ALERT_EMAIL_FROM` | api | From address for authorizer alert email — see [EMAIL.md](./EMAIL.md) |

Vite only exposes keys prefixed with `VITE_` to the browser — name them that way in Doppler.

Production / deploy secret placement is deferred; keep using Doppler for local for now.

## Ports

Defaults avoid clashing with common Next.js apps on `:3000`–`:3002`:

| Service | Default port |
| --- | --- |
| Web workbench | `3100` |
| Edge engine | `3101` (`EDGE_ENGINE_PORT`) |
| Cloud API | `3102` (`API_PORT`) |
| Sysmex TCP | `5001` |
| Mindray TCP | `5003` |
| iFlash TCP | `5004` |
| Zebra ZPL | `9100` |
| Supabase API | `54321` |
| Supabase Postgres | `54322` |
| Supabase Studio | `54323` |
| Mailpit (test inbox) | `54324` |

## Install & database

```bash
cd medical-lab-app-monorepo
pnpm install
pnpm --filter @drax-lis/contracts build
pnpm --filter @drax-lis/protocols build

# Edge database (SQLite on this machine / the mini PC)
pnpm db:generate
pnpm db:push

# Cloud database (local Supabase in Docker) — first run pulls ~8 images
pnpm supabase:start
```

## Run everything (dev)

```bash
pnpm dev:local
```

Starts web + edge-engine + cloud API + simulators wired to the local Supabase stack. The
API logs `Supabase client configured` on boot — if it says *"using in-memory sync store"*
instead, the stack is not running (`pnpm supabase:start`).

Use `pnpm dev` instead to point the same processes at a hosted Supabase project via
Doppler — see [Environment (Doppler)](#environment-doppler).

| Service | URL / port |
| --- | --- |
| Web workbench | http://localhost:3100 |
| Edge engine | http://localhost:3101 |
| Cloud API | http://localhost:3102 |
| Sysmex TCP | `:5001` |
| Mindray TCP | `:5003` |
| iFlash TCP | `:5004` |

In another terminal, start simulators (fake analyzers + fake Zebra):

```bash
pnpm --filter @drax-lis/simulators dev
```

Or one-shot ACK-aware sends (edge must be listening):

```bash
pnpm --filter @drax-lis/simulators send:sysmex -- --barcode DHDEMO001
pnpm --filter @drax-lis/simulators send:mindray -- --barcode DHDEMO001-CHEM
pnpm --filter @drax-lis/simulators send:iflash -- --barcode DHDEMO001-IA
# optional host-query round-trip before ORU:
pnpm --filter @drax-lis/simulators send:iflash -- --barcode DHDEMO001-IA --query
```

Then open **Bench** — CBC / chemistry / TSH rows should appear with units, flags, and `pending_review`. Check `GET http://localhost:3101/analyzers/status` or the Bench status strip. **Sync** shows outbox counters draining to the cloud API (in-memory if Supabase env is empty).

### Submit → release → export (local)

1. Sign in as **tech** (`tech@draxhall.local` / `password123`).
2. On **Bench**, expand a patient group and click **Submit for release** (not the same as **Notify authorizer**).
3. Open **Sync** → **Drain now** if the release queue stays empty (flushes edge outbox).
4. Sign in as **authorizer** (`authorizer@draxhall.local`) → **Release** queue → click **Release** once on the accession group, or **Return to bench** to send it back to the tech (confirmation dialog; optional reason).
5. As **tech**, after submit you can **Recall from release queue** on Bench if you submitted too early (confirmation required).
6. Back on **Bench** (or **Patients**), confirm the group shows **Released** (no recall/submit). Use the **Released** tab to browse completed accessions.
7. **Export report** → PDF, JSON, or **Email to doctor** (JSON attachment). Local email lands in [Mailpit](http://127.0.0.1:54324) (SMTP port `54325`). **Production email uses [Resend](./EMAIL.md)** — one Resend setup per client lab.

Patient names in the release queue come from the specimen synced with submit. If you see **Unknown patient** after `pnpm supabase:reset`, re-accession the patient (or submit again so the edge includes `specimensByAccession` in the sync payload).

Audit rows appear in Supabase `clinical_audit_log` — see [AUDIT.md](./AUDIT.md).

## Manual ingest (no simulator)

```bash
curl -s http://localhost:3101/ingest -H 'content-type: application/json' -d '{
  "analyzerId": "sysmex_xs1000i",
  "protocol": "astm_e1394",
  "payload": "H|\\^&|||HOST\rP|1\rO|1|DHDEMO001\rR|1|^^^WBC|7.1|10*3/uL\rL|1|N"
}'
```

## Register + print + analyze (clean loop)

1. Start simulators (includes fake Zebra on `:9100`) if not already running — see [HARDWARE.md](./HARDWARE.md).
2. Open http://localhost:3100/accession  
3. All patients load in the list immediately — type to filter (debounced). Select a patient and the **draft label preview** appears instantly on the right (no printer required).
4. Pick test presets (CBC, BMP, etc.) — preview updates as tests change.
5. **Accession & Print Label** — the same preview panel transitions to the registered accession; ZPL is sent to the fake Zebra (terminal log) or physical ZD411.
6. Use **Open in Labels** or visit http://localhost:3100/labels?accession=DH… to reprint. Labels accepts `?accession=` deep links from Accession scans.
7. Copy the accession barcode (or **Copy sim command**) from the preview panel actions.
8. Run the simulator with **that** barcode, e.g.  
   `pnpm --filter @drax-lis/simulators send:sysmex -- --barcode DH202608260001`  
9. Open **Bench** — CBC rows appear under the same accession with `pending_review`

Accessions are sequential: `DH{YYYYMMDD}{####}`.

**Labels page:** use the **Accession | Labels** tabs to switch workflows. Scan or type an accession, or open `/labels?accession=DH…` from Accession. **Printer status** reflects `GET /print/status` (TCP to Zebra) — preview works even when the printer is offline.

**Print preview / reprint 404:** If Accession shows an edge preview warning, Labels preview is empty, or reprint returns 404, edge-engine is running stale code — rebuild and restart so `/print/*` routes load (`pnpm --filter @drax-lis/edge-engine build`, then restart `pnpm dev`). Labels still shows a cached preview from specimen data when edge preview is unavailable.

Identity rules: [IDENTITY.md](./IDENTITY.md).

### Demo patients + Bench names

Populate the local registry and linked demo results so **Patients** and **Bench** show real names:

```bash
curl -X POST http://localhost:3101/patients/seed
curl -X POST http://localhost:3101/demo/bench
```

`POST /demo/bench` also:

- Purges **patientless** pending results/specimens (old bridge/smoke/unregistered analyzer barcodes that show as “—” on Bench)
- Clears duplicate pending results (from simulator retransmits) and reseeds one clean row per demo test
- Preserves any already released demo accession and removes stale pending duplicates instead of recreating pending work beside an authorized result
- Validates request-form catalog codes and stores raw analyzer codes separately, matching production ingestion (for example `ALT` → `ALT_SGPT`)

Manual-result provenance is never fabricated for old demo rows. After pulling the attribution migration, reset local Supabase and edge demo clinical data, then enter manual values while signed in so the displayed staff/time is genuine. Production migrations only add nullable columns; historical rows show **Entry attribution unavailable**.

After that, ongoing simulator traffic **updates** the same `(accession, test)` instead of stacking clones. Unregistered analyzer barcodes still appear as “—” until you register the specimen to a patient; re-run demo cleanup to remove that local noise.

Then open:

- http://localhost:3100/patients — searchable MRN registry  
- http://localhost:3100/bench — rows under `DHDEMO0001`… with patient name + MRN  

Simulator default barcode is `DHDEMO0001` (Marlon Campbell) so ongoing sim traffic stays patient-linked. Override with `SIM_BARCODE=…` if needed.

**Manual/hybrid completeness demo:** open **Anika S Henry** (`MRN-7004`), accession `DHDEMO0007`, on Bench. It contains completed Mindray `CREATININE` and the automated portion of `WBC_DIFF`, while these observations remain pending:

- `ESR` — manual result
- `GROUP_RH` — manual result
- `WBC_DIFF` — provisional blood-film/manual differential review

Click **Submit for release** to see the incomplete-order warning. **Submit anyway** sends the point-in-time missing list to the release queue, where an authorizer sees the **Incomplete order** badge and can return it to Bench or release it.

### Order-aware simulators (catalog remap)

Simulators read the accession’s `orderedTestsJson` from edge (`GET /specimens?accession=…`) and only send analytes that match the order. Ingestion remaps machine codes (e.g. `GLU` → `GLUCOSE_RAND`, `BUN` → `UREA_BUN`) so Bench shows request-form names. Results not on the order get a **Not ordered** badge.

| Env | Effect |
| --- | --- |
| `SIM_BARCODE` | Barcode/accession to simulate (default `DHDEMO0001`) |
| `SIM_STRICT=1` | Send nothing until that accession is registered with an order |

**Full four-analyzer demo order** — on Accession, register `DHDEMO0001` (or your barcode) with:

- `CBC` (Sysmex)
- `CREATININE`, `ALT_SGPT`, `TOTAL_CHOLESTEROL` (Mindray)
- `ELECTROLYTES` (ProLyte — set `PROLYTE_SERIAL_PATH` per socat recipe below)
- `TSH` (iFlash)

CBC-only orders produce Sysmex results only; chemistry-only skips Sysmex. See [MACHINE_TO_REQUEST_FORM.md](./MACHINE_TO_REQUEST_FORM.md) for the full remap table.

### Patient report export (PDF / JSON)

1. Sign in (e.g. `authorizer@draxhall.local` / `password123`).
2. Accession a specimen and wait for simulator results to sync to cloud.
3. Open **Release** (`/release`) and release pending rows for that patient.
4. On **Bench**, open the patient focus panel → **Export report** → choose **PDF (Letter)**, **PDF (Legal)**, or **JSON**.

Reports include **released results only**. Lab header branding comes from `labs.settings.report` (re-seed with `pnpm supabase:reset` if you need the demo address block). Set `settings.report.logoUrl` in Supabase Studio to replace the logo placeholder.

**Notifications:** the bell (top-right) fills when analyzers report **new** results or when a flag **escalates** to high/critical. Simulator retransmits every ~30s update values quietly — they do not spam the notification center.

Re-seed patients only: `curl -X POST http://localhost:3101/patients/seed`

## Local Supabase (CLI stack)

The cloud clinical store + Auth run **on your machine** in Docker. No hosted project, no
Supabase account, no branching plan needed. The edge database is unrelated and stays SQLite.

```bash
pnpm supabase:start     # boot (first run pulls images, a few minutes)
pnpm supabase:status    # URLs + keys
pnpm supabase:stop      # shut down (data survives)
pnpm supabase:reset     # rebuild from migrations + seed — destroys local data
```

| Service | URL |
| --- | --- |
| API gateway | http://127.0.0.1:54321 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| **Studio** (table editor, SQL, auth admin) | http://127.0.0.1:54323 |
| Mailpit (catches all outbound email) | http://127.0.0.1:54324 |

### Seeded staff logins

Staff signup happens on the **edge** only (see [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md)). On first boot, edge-engine's `StaffSeedService` creates these accounts directly in its SQLite `Staff` table and pushes them to the local Supabase project through the normal outbox sync loop. [`supabase/seed.sql`](../supabase/seed.sql) also inserts the **same** fixed UUIDs directly (belt-and-suspenders, so `pnpm dev` cloud-mode testing works even before the edge has synced) — the two are idempotent against each other:

| Email | Password | Role | Job title | Can sign into the **cloud** app? |
| --- | --- | --- | --- | --- |
| `admin@draxhall.local` | `password123` | admin — staff registry at `/staff`, full authorizer powers | admin staff | ✅ |
| `authorizer@draxhall.local` | `password123` | authorizer — can release results | — | ✅ |
| `tech@draxhall.local` | `password123` | tech — accession / bench | phlebotomist (Marlon Reid) | ❌ blocked by the Auth Hook |
| `phleb@draxhall.local` | `password123` | tech — accession / bench | lab technologist (Jordan Blake) | ❌ |
| `karen@draxhall.local` | `password123` | tech — phlebotomist | phlebotomist (Karen Sinclair) | ❌ |
| `reception@draxhall.local` | `password123` | tech — front desk | receptionist (Tanya Clarke) | ❌ |
| `labtech@draxhall.local` | `password123` | tech — bench | lab technologist (Devon Matthews) | ❌ |

Sign in at http://localhost:3100/login (edge mode). Use **`admin@draxhall.local`** to open **Staff**
(`/staff`) and assign who has authorizer permission — this now writes to the **edge**, not directly to Supabase. If that account or the Staff page is
missing after pulling new migrations, run **`pnpm supabase:reset`** once to re-seed the cloud, and restart edge-engine so it re-seeds its own SQLite (or delete `apps/edge-engine/dev.db` and `pnpm db:push`).

To try the cloud login + device enrollment flow locally: run a `VITE_LIS_MODE=cloud` build/tab, sign in as `authorizer@draxhall.local` or `admin@draxhall.local` (tech accounts will correctly fail here), then use the **Issue cloud device** button on the edge Staff page to generate a code and enroll that browser.

Staff sign-in/out and **Profile** live in the sidebar; sessions work in edge or cloud mode.
The dev-role shortcut (“Continue as admin (dev)”) still exists for when Supabase is not
running.

### Edge vs cloud session (default `pnpm dev:local`)

The web app runs in **edge mode** (`VITE_LIS_MODE=edge`). Sign-in at `/login` uses the **edge** API (`POST :3101/auth/login`) — that is what the sidebar shows (your name in the lower left).

Two sessions can exist at once:

| Session | Used for | How you get it |
| --- | --- | --- |
| **Edge** | Bench, accession, staff registry, sync drain | Always — normal sign-in at `/login` |
| **Cloud (Supabase)** | Release queue, review-request alerts, cloud-only APIs | Automatically for **admin** and **authorizer** after edge sign-in (same email/password). Tech accounts are edge-only — the Auth Hook blocks their cloud login. |

Cloud API calls send the **Supabase JWT**, not the edge JWT. A cloud 401 no longer wipes your edge login (so the sidebar stays signed in).

**Release / sign-off from the edge tab:** after signing in as admin or authorizer, the release queue **loads** once the Supabase session is established. **Release** (`POST /results/release-accession`) works in local dev without lab device enrollment — production still requires enrolling the browser via **Staff → Issue cloud device**.

Release queue: http://localhost:3100/release — admins and authorizers release cloud
`pending_authorization` accessions (`POST /results/release-accession`).

**Messages:** http://localhost:3100/messages — LAN DMs + channels over Socket.IO `/messaging` (edge JWT). Cloud Realtime inbox for admin/authorizer when using cloud mode. See [MESSAGING.md](./MESSAGING.md).

### Changing the schema

The schema is version-controlled in [`supabase/migrations/`](../supabase/migrations). **Never
paste SQL into a dashboard SQL editor** — that is what caused the schema to drift before.

```bash
pnpm supabase:migration add_qc_table   # creates supabase/migrations/<ts>_add_qc_table.sql
# edit the file, then:
pnpm supabase:reset                    # rebuild locally and confirm it applies clean
```

Regenerate DB types after a schema change: `pnpm supabase:types`.

### Promoting to a cloud project

When the hosted project exists (staging, or production on Pro):

```bash
pnpm exec supabase link --project-ref <ref>
pnpm exec supabase db push      # applies pending migrations to the remote
```

Then set the **hosted** `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `VITE_SUPABASE_*`
in Doppler and run `pnpm dev` instead of `pnpm dev:local`. Never put a hosted
service_role key in `supabase/local.env`.

### Why `supabase/local.env` is committed

The CLI's local `anon` and `service_role` keys are fixed demo credentials — byte-identical
on every machine, signed with the public well-known local JWT secret, and only valid
against Postgres in Docker on `127.0.0.1`. They are not secrets. Real credentials stay in
Doppler.

### Running without Docker

`pnpm dev:bare` (or any run where `SUPABASE_URL` is unset) makes the API fall back to an
**in-memory** sync store — fine for a quick demo, lost on restart, and it cannot exercise
Auth or RLS.

## Docker Compose

```bash
cd infra
docker compose up --build
# with simulators:
docker compose --profile sim up --build
```

## Serial PTYs with socat (ProLyte / RS-232 stand-in)

Fake a null-modem cable between edge and the ProLyte simulator:

```bash
socat -d -d pty,raw,echo=0 pty,raw,echo=0
# Example output:
# N PTY is /dev/ttys003
# N PTY is /dev/ttys004
```

In two terminals (or `.env` + simulator env):

```bash
# Terminal A — edge listens on one PTY
export PROLYTE_SERIAL_PATH=/dev/ttys003
pnpm --filter @drax-lis/edge-engine dev

# Terminal B — simulator writes a multi-line ASCII block to the peer PTY
export PROLYTE_SERIAL_PATH=/dev/ttys004
pnpm --filter @drax-lis/simulators send:prolyte -- --barcode ACC-ELYTE-001
```

Block shape (real ProLyte RS-232):

```
DATE: …  TIME: …
SAMPLE: ACC-ELYTE-001
Na+:  140.2  mmol/L
K+:     4.15 mmol/L
Cl-:  102.0  mmol/L
Li+:    0.85 mmol/L
```

Edge flushes the block after ~400ms idle (`PROLYTE_BLOCK_IDLE_MS`). Serial open is 9600 8N1 (set `PROLYTE_BAUD=1200` if the unit UI still uses legacy baud).

Optional: `SYSMEX_SERIAL_PATH` opens an ASTM E1381 serial listener on a second PTY pair.

## Env

**Source of truth: Doppler** (`drax-lis` / `dev`). See [Environment (Doppler)](#environment-doppler) above.

Per-app `.env.example` files list keys for reference. Optional local `.env` files are fallbacks only (`dotenv` does not override Doppler).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Web can’t load results | Edge on :3101? CORS? `VITE_LIS_API_URL` |
| Simulator “timeout” | Edge TCP listeners started? Ports free? |
| Sync stuck pending | Cloud API on :3102? `CLOUD_API_URL` |
| Prisma errors | `pnpm db:generate && pnpm db:push` |
| Workspace import fails | Build `contracts` / `protocols` first |
| `EADDRINUSE` on 3000–3002 | Those ports are often other apps; LIS defaults are 3100–3102 |
| API logs "using in-memory sync store" | Stack down (`pnpm supabase:start`), or the env key is missing from `globalPassThroughEnv` in [`turbo.json`](../turbo.json) |
| Env var reads as `undefined` in an app | Turborepo strict mode — add the key to `globalPassThroughEnv` in [`turbo.json`](../turbo.json) |
| `supabase start` cannot reach the Docker daemon | Start Docker Desktop and wait for it to report running |
| `permission denied for table …` (42501) | Missing `grant` for that role — add one in a new migration, RLS policies alone are not enough |
| `infinite recursion detected in policy` (42P17) | A policy is querying its own table; resolve the role through `public.current_user_role()` instead |
| Sign-in fails with "Database error querying schema" | A hand-inserted `auth.users` row left token columns NULL; they must be `''` (see [`supabase/seed.sql`](../supabase/seed.sql)) |
| Stale servers hold 3100–3102 after a crash | `lsof -nP -iTCP:3101 -sTCP:LISTEN` then kill that PID |

## Suggested first demo script

1. `pnpm dev` + simulators  
2. Register a seeded patient (e.g. Alice Brown) / CBC — or create a provisional patient then register
3. Watch Sync pending → acked  
4. `send:sysmex` with matching barcode (or wait for loop)  
5. Bench shows WBC/RBC/HGB/PLT with flags and `pending_review`  
6. Unplug network / stop `api` → sync stays pending → restart api → drains  
7. (Optional) socat ProLyte PTY → `send:prolyte` → NA/K/CL/LI on Bench  
