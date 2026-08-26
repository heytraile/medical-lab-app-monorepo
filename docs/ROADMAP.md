# Roadmap — Drax Hall LIS

Build the complete product in phases. Each phase should leave the lab demoable.

## Phase 0 — Monorepo scaffold (current)

- Turborepo + pnpm workspaces
- `edge-engine`, `api`, `web`, `simulators`
- Shared `contracts` + `protocols` (ASTM checksum, MLLP)
- Prisma SQLite WAL + outbox tables
- TCP listeners + canned simulators
- TanStack Start Bench / Register / Sync shells
- Architecture docs

**Exit:** `pnpm install && pnpm dev`; simulator dumps a CBC into SQLite; sync status visible.

## Phase 1 — Real protocol engines + accessioning

- Full ASTM E1381 state machine (ENQ/ACK/NAK/EOT, retries, timeouts)
- ASTM E1394 record parser → canonical results with units/flags
- HL7 ORU^R01 / ACK and QRY^Q02 host query by barcode
- ProLyte ASCII field map (from vendor sheet)
- Registration form → accession series rules for Drax Hall
- ZPL templates (patient, DOB, tests, tube type)
- Serial port driver (`serialport`) behind same ingest interface

**Exit:** end-to-end register → print → simulated analyze → bench row with correct codes.

## Phase 2 — Reliable cloud sync

- Supabase schema: patients, specimens, results, sync_events, audit
- Edge auth token; signed sync batches
- Ordered drain, exponential backoff, poison-queue UI
- Conflict rules documented and tested
- Cloud API CRUD for specimens/results (web cloud mode)

**Exit:** kill Wi‑Fi mid-run; restore; outbox drains without duplicates.

## Phase 3 — Bench review + worklists

- TanStack Table with filters, panic highlighting, delta checks (stub)
- Tech review / release workflow
- Instrument host-query: analyzer asks “what tests for barcode X?”
- Live Socket.IO (edge) + optional Supabase Realtime (cloud)

**Exit:** tech can release a panel; analyzer can pull orders.

## Phase 4 — Lab hardware deployment

- Production Docker Compose on Ubuntu mini PC
- `/dev/ttyUSB*` device maps + udev rules
- Real Zebra on LAN; wedge scanner validation
- Watchdog / auto-restart; disk health alerts
- Runbook for Drax Hall cutover

**Exit:** 24h soak test next to real analyzers (shadow mode).

## Phase 5 — Full LIS product surface

- Auth, roles, sites
- PDF reports, cumulative history
- QC lots / Westgard (incremental)
- Inventory / reagents (optional)
- Billing / order codes export (optional)
- Admin: analyzer config UI, reference ranges

**Exit:** production go-live checklist signed off.

## Non-goals (for now)

- Replacing hospital EMR (HL7 ADT/ORM inbound is a later integration)
- AI auto-interpretation of results
- Multi-tenant SaaS packaging beyond Drax Hall
