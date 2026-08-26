# Architecture — Drax Hall Clinical Laboratory LIS

Living document. Barcode / accession number is the **spine** of the system.

## Why hybrid Edge + Cloud?

The four analyzers live on the lab floor and speak serial/TCP protocols. Internet drops. We still need to:

1. Accept instrument data **immediately** into local storage.
2. Print labels and run the bench UI offline.
3. Push everything to the cloud LIS **in order** when the link returns.

So we run an **edge gateway** on an Ubuntu mini PC next to the instruments, and a **cloud LIS** for the system of record.

```
┌─────────────────────────────────────────────────────────────┐
│ Lab floor                                                   │
│  Sysmex │ ProLyte │ Mindray │ iFlash │ Zebra │ scanners     │
└────┬────────┬─────────┬─────────┬──────────┬────────────────┘
     │ RS-232 │ RS-232  │ TCP/ASTM│ HL7/MLLP │ ZPL :9100
     ▼        ▼         ▼         ▼          ▲
┌────────────────────────────────────────────┴────────────────┐
│ Ubuntu Mini PC (Docker)                                     │
│  apps/edge-engine  →  SQLite WAL  →  outbox worker          │
│  apps/web (LIS_MODE=edge)  ← Socket.IO bench events         │
│  apps/simulators (dev only)                                 │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS JSON (idempotent events)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ Cloud                                                       │
│  apps/api (NestJS)  →  Supabase Postgres (+ Auth later)     │
│  apps/web (LIS_MODE=cloud)                                  │
└─────────────────────────────────────────────────────────────┘
```

## Where everything lives

| Path | Responsibility |
| --- | --- |
| [`apps/edge-engine`](../apps/edge-engine) | NestJS: TCP/serial ingest, Prisma+SQLite, ZPL printer, outbox sync, Socket.IO |
| [`apps/api`](../apps/api) | NestJS cloud API: idempotent `/sync/events`, Supabase client |
| [`apps/web`](../apps/web) | TanStack Start workbench: Bench, Register, Sync |
| [`apps/simulators`](../apps/simulators) | Fake Sysmex ASTM, iFlash MLLP, Zebra :9100 |
| [`packages/contracts`](../packages/contracts) | Zod schemas: Specimen, CanonicalResult, OutboxEvent |
| [`packages/protocols`](../packages/protocols) | ASTM frame checksum, MLLP wrap/unwrap, ASCII helpers |
| [`packages/tsconfig`](../packages/tsconfig) | Shared TS configs |
| [`packages/tailwind-config`](../packages/tailwind-config) | Shared Tailwind v4 theme |
| [`packages/eslint-config`](../packages/eslint-config) | Shared ESLint base |
| [`infra/`](../infra) | Docker Compose + Dockerfiles |
| [`docs/`](../docs) | This map, roadmap, analyzer matrix, local-dev guide |

## Specimen journey (happy path)

1. **Register** — Reception enters patient + ordered tests in the workbench (`POST /specimens` on edge).
2. **Accession** — Edge issues `accessionNumber` (= barcode) and stores a `Specimen` row.
3. **Label** — Edge builds ZPL and sends it to Zebra TCP 9100.
4. **Analyze** — Instrument scans the barcode, runs assays, emits ASTM or HL7.
5. **Ingest** — `edge-engine` TCP listeners (or serial drivers later) receive bytes → `RawMessage` → parsed `Result` rows.
6. **Outbox** — Every accepted event becomes an `OutboxEvent` with status `pending` and a monotonic `sequence`.
7. **Sync** — Cron worker POSTs batches to `api` `/sync/events`. Cloud acks by `eventId` (idempotent). Status → `acked`.
8. **Bench** — Socket.IO `bench.event` invalidates TanStack Query so the Live Bench table refreshes.

## Offline / store-and-forward

```
pending ──(worker picks up)──► syncing ──(cloud 2xx + acked)──► acked
   ▲                              │
   │                              └──(network / 5xx)──► pending (retry)
   │
 failed ◄──(explicit reject / poison)── (manual review later)
```

Rules:

- **Never drop** an accepted instrument payload. Write SQLite first.
- Sync **in `sequence` order** so the cloud sees chronological truth.
- Idempotency key = `eventId` (UUID). Replays are `duplicateEventIds`, still treated as success for the edge.
- Conflict policy (later): cloud wins demographics; edge wins raw instrument payload.

SQLite is opened with:

- `PRAGMA journal_mode=WAL`
- `PRAGMA busy_timeout=5000`
- `PRAGMA synchronous=NORMAL`

## Protocols (application layer)

| Instrument | Transport | Framing | Records |
| --- | --- | --- | --- |
| Sysmex XS-1000i | RS-232 or TCP | ASTM E1381 (ENQ/ACK/STX/ETX/EOT) | ASTM E1394 H/P/O/R/L |
| Diamond ProLyte | RS-232 | line-based | ASCII delimited (confirm with vendor sheet) |
| Mindray BS-240 | Serial or TCP | ASTM | E1394 + host query |
| YHLO iFlash 1200 | TCP | MLLP (`VT`…`FS CR`) | HL7 v2.3.1 ORU^R01 / QRY^Q02 |

Barcode join fields:

- ASTM `O` record sample ID
- HL7 `OBR-2` / `OBR-3`

Parsers live in `packages/protocols` (pure TS, unit-tested). Nest drivers only move bytes and call ingest.

## API boundaries

**Edge (default port 3101)**

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness |
| GET | `/results` | Bench feed |
| GET/POST | `/specimens` | List / register |
| POST | `/ingest` | Dev inject raw frame |
| POST | `/print/label` | ZPL print |
| GET/POST | `/sync/status`, `/sync/drain` | Outbox status / force drain |
| WS | `/bench` | `bench.event` |

**Cloud API (default port 3102)**

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness |
| POST | `/sync/events` | Idempotent edge outbox ingest |
| GET | `/sync/events` | Dev peek (in-memory when Supabase unset) |

The browser **does not** write clinical data directly to Supabase. Nest owns validation, accession uniqueness, matching, audit, and release.

## Web modes

Same `apps/web` binary:

| Env | Meaning |
| --- | --- |
| `VITE_LIS_MODE=edge` | Talk to mini PC edge-engine |
| `VITE_LIS_MODE=cloud` | Talk to cloud `apps/api` (future endpoints) |
| `VITE_LIS_API_URL` | Base URL for REST |
| `VITE_WS_URL` | Socket.IO base (edge) |

## Security / PHI (later phases, designed in)

- Edge disk encryption + physical access control on the mini PC
- TLS to cloud; edge node auth token on sync
- Supabase Auth + RLS for multi-user roles (phleb, tech, supervisor, admin)
- Audit log on release / amend
- No PHI in simulator defaults beyond fake demographics

## What Phase 0 is / is not

**Is:** runnable monorepo skeleton, docs, TCP ingest + SQLite + outbox stub, simulators, workbench shell.

**Is not:** full ASTM state machine, host-query worklists, auth, QC, PDF reports, production Ubuntu device maps — see [ROADMAP.md](./ROADMAP.md).
