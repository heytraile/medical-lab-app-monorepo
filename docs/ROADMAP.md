# Roadmap — Medical Lab App (LIS) Monorepo

Build the complete product in phases. Each phase should leave the lab demoable.

First customer: **Drax Hall Clinical Laboratory**. Architecture stays multi-lab-ready (tenancy/product packaging later).

## Phase 0 — Monorepo scaffold (done)

- Turborepo + pnpm workspaces
- `edge-engine`, `api`, `web`, `simulators`
- Shared `contracts` + `protocols` (ASTM checksum, MLLP)
- Prisma SQLite WAL + outbox tables
- TCP listeners + canned simulators
- TanStack Start Bench / Register / Sync shells
- Architecture docs

**Exit:** `pnpm install && pnpm dev`; simulator dumps a CBC into SQLite; sync status visible.

## Phase 1 — Real protocol engines + accessioning

- Full ASTM E1381 state machine (ENQ/ACK/NAK/EOT, retries, timeouts) ✅
- ASTM E1394 record parser → canonical results with units/flags ✅
- HL7 ORU^R01 / ACK and QRY^Q02 host query by barcode ✅
- ProLyte multi-line ASCII (`SAMPLE:` + Na/K/Cl/Li), RS-232 9600 8N1, idle-timeout block assembly ✅
- Registration form → accession series rules (Drax Hall first; configurable later) — partial
- ZPL templates (patient, DOB, tests, tube type) — basic label exists
- Serial port driver (`serialport`) behind same ingest interface ✅
- Results stored as `pending_review`; Bench shows flags/status; `GET /analyzers/status` ✅

**Bridge exit (this phase):** register → sim analyze (ACK-aware TCP / socat ProLyte) → correct codes/flags on Bench from protocol engines.

**Exit:** end-to-end register → print → simulated analyze → bench row with correct codes.

## Phase 2 — Reliable cloud sync

- Supabase schema: patients, specimens, results (**with clinical `status`**), sync_events, profiles — migrations in `supabase/migrations/` ✅
- Edge `EDGE_SYNC_TOKEN`; ordered drain; project outbox → clinical tables ✅
- Cloud `GET /cloud/results`, `GET /cloud/specimens` (JWT / dev role) ✅
- In-memory fallback when Supabase unset ✅
- Conflict rules / poison-queue UI / exponential backoff — later

**Exit (partial):** with keys set, register+ingest → drain → rows in Supabase; local demo works in-memory.

## Phase 3 — Bench Review, release authority, critical STAT *(in progress)*

- **Bench Review gallery** for techs (filters, live) ✅ (edge)
- Roles: tech vs **authorizer** via Supabase Auth `profiles.role` ✅
- Authorizer-only **Release queue** + `POST /results/:id/release` audit ✅
- Critical / STAT email notifications — later
- Doctor/report path — later

## Phase 4 — Lab hardware deployment

- Production Docker Compose on Ubuntu mini PC
- `/dev/ttyUSB*` device maps + udev rules
- Real Zebra on LAN; wedge scanner validation
- Watchdog / auto-restart; disk health alerts
- Runbook for Drax Hall cutover

**Exit:** 24h soak test next to real analyzers (shadow mode).

## Phase 5 — Full LIS product surface

- Auth, roles, multi-site / multi-lab packaging
- PDF reports, cumulative history
- QC lots / Westgard (incremental)
- Configurable critical ranges UI per lab
- Inventory / reagents (optional)
- Billing / order codes export (optional)
- Admin: analyzer config UI, reference ranges

**Exit:** production go-live checklist signed off; second-lab packaging path clear.

## Non-goals (for now)

- Replacing hospital EMR (HL7 ADT/ORM inbound is a later integration)
- AI auto-interpretation of results
- Auto-releasing criticals to the doctor without an authorizer
