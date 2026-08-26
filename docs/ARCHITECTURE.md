# Architecture — Medical Lab App (LIS) Monorepo

Living document. First deployment: **Drax Hall Clinical Laboratory**. Product intent: sell the same hybrid Edge–Cloud LIS to many labs.

Barcode / accession number is the **spine** of the system. Acronyms and assay codes: [GLOSSARY.md](./GLOSSARY.md).

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
│  apps/edge-engine (Nest #1 = bridge)                        │
│       → SQLite WAL → outbox worker (PUSH upstream)          │
│  apps/web (LIS_MODE=edge)  ← Socket.IO bench events         │
│  apps/simulators (dev only)                                 │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS JSON POST /sync/events
                             │ (edge pushes; cloud does not poll)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ Cloud                                                       │
│  apps/api (Nest #2)  →  Supabase Postgres (+ Auth)          │
│  apps/web (LIS_MODE=cloud) — Bench Review + Release queue   │
└─────────────────────────────────────────────────────────────┘
```

**Two Nest apps, not one:** the mini PC bridge is `edge-engine`; the cloud backend is `api`. Supabase is the database, not the LIS UI. The browser does not write clinical data straight to Supabase.

## Where everything lives

| Path | Responsibility |
| --- | --- |
| [`apps/edge-engine`](../apps/edge-engine) | NestJS bridge: TCP/serial ingest, Prisma+SQLite, ZPL, outbox **push**, Socket.IO |
| [`apps/api`](../apps/api) | NestJS cloud API: sync ingest, release APIs, Supabase, notifications |
| [`apps/web`](../apps/web) | TanStack Start: Bench Review, Register, Sync, Release queue |
| [`apps/simulators`](../apps/simulators) | Fake Sysmex ASTM, iFlash MLLP, Zebra :9100 |
| [`packages/contracts`](../packages/contracts) | Zod schemas: Specimen, CanonicalResult, OutboxEvent |
| [`packages/protocols`](../packages/protocols) | ASTM frame checksum, MLLP wrap/unwrap, ASCII helpers |
| [`packages/tsconfig`](../packages/tsconfig) | Shared TS configs |
| [`packages/tailwind-config`](../packages/tailwind-config) | Shared Tailwind v4 theme |
| [`packages/eslint-config`](../packages/eslint-config) | Shared ESLint base |
| [`infra/`](../infra) | Docker Compose + Dockerfiles |
| [`docs/`](../docs) | System map, workflow, identity hygiene, roadmap, analyzers, local-dev |

## Specimen + result journey

1. **Register** — Reception picks a patient by MRN (`GET /patients`) or creates a **provisional** local patient (`POST /patients`, TEMP MRN) then `POST /specimens` with `patientId`. Suspect demographic clusters require audited `identityConfirmation` (see [IDENTITY.md](./IDENTITY.md)).
2. **Accession** — Edge issues `accessionNumber` (= barcode) and stores a `Specimen` row linked to `patientId`.
3. **Label** — Edge builds ZPL and sends it to Zebra TCP 9100.
4. **Analyze** — Instrument scans the barcode, runs assays, emits ASTM or HL7.
5. **Ingest** — `edge-engine` receives bytes → `RawMessage` → parsed `Result` rows with clinical status **`pending_review`**.
6. **Bench Review** — Tech sees results in the live gallery (local UI). They can review; they **cannot** release to the doctor.
7. **Outbox** — Event queued `pending` with monotonic `sequence`.
8. **Sync** — Edge **pushes** JSON to cloud `api` `/sync/events`. Cloud writes Supabase; acks `eventId`. Edge outbox → `acked`. **SQLite clinical rows remain** on the mini PC.
9. **Authorizer** — Sees the same result in the cloud Release queue (`pending_review`). Sign-off → **`released`** (+ audit).
10. **Doctor path** — Reports / EMR / doctor views only consume **`released`** results.

Critical / STAT escalation (auto panic ranges or tech manual escalate) does **not** skip step 9 — it only prioritizes notification. Full rules: [WORKFLOW.md](./WORKFLOW.md).

## Clinical review & release (summary)

- **One** Supabase database; use **status** (`pending_review` → `released`), not a separate holding DB.
- Sync **before** sign-off so authorizers can work off-site and survive mini PC failure.
- **Bench tech** = gallery + optional STAT escalate.
- **Authorizer** (typically 1–2 people) = only role that finalizes for the doctor.
- **Critical alert** = in-app + email (STAT) to authorizers; still requires release.

See [WORKFLOW.md](./WORKFLOW.md) for roles, data model sketch, UX surfaces, and acceptance criteria.

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
- After successful sync, **keep** local specimen/result/raw rows; only outbox status becomes `acked`.
- Conflict policy (later): cloud wins demographics; edge wins raw instrument payload.
- Clinical release is a **status transition** (often authored in cloud); sync that transition back to edge if local badges need it.

SQLite is opened with:

- `PRAGMA journal_mode=WAL`
- `PRAGMA busy_timeout=5000`
- `PRAGMA synchronous=NORMAL`

## Protocols (application layer)

| Instrument | Transport | Framing | Records |
| --- | --- | --- | --- |
| Sysmex XS-1000i | RS-232 or TCP | ASTM E1381 (ENQ/ACK/STX/ETX/EOT) | ASTM E1394 H/P/O/R/L |
| Diamond ProLyte | RS-232 | unidirectional | Multi-line ASCII (`SAMPLE:` + Na/K/Cl/Li); 9600 8N1; no ASTM handshake |
| Mindray BS-240 | Serial or TCP | ASTM | E1394 + host query |
| YHLO iFlash 1200 | TCP | MLLP (`VT`…`FS CR`) | HL7 v2.3.1 ORU^R01 / QRY^Q02 |

Barcode join fields:

- ASTM `O` record sample ID
- HL7 `OBR-2` / `OBR-3`

Parsers live in `packages/protocols` (pure TS, unit-tested). Nest drivers only move bytes and call ingest.

## API boundaries

**Edge (default port 3101)** — the bridge

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness |
| GET | `/results` | Bench feed |
| GET/POST | `/specimens` | List / register |
| POST | `/ingest` | Dev inject raw frame |
| POST | `/print/label` | ZPL print |
| GET/POST | `/sync/status`, `/sync/drain` | Outbox status / force drain |
| WS | `/bench` | `bench.event` |

**Cloud API (default port 3102)** — Nest in front of Supabase

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness |
| POST | `/sync/events` | Idempotent edge outbox ingest |
| GET | `/sync/events` | Dev peek (in-memory when Supabase unset) |
| *(soon)* | release / escalate / notify | Authorizer workflow — see WORKFLOW.md |

The browser **does not** write clinical data directly to Supabase. Nest owns validation, accession uniqueness, matching, audit, and release.

## Web modes

Same `apps/web` binary:

| Env | Meaning |
| --- | --- |
| `VITE_LIS_MODE=edge` | Talk to mini PC edge-engine (floor Bench Review) |
| `VITE_LIS_MODE=cloud` | Talk to cloud `apps/api` (Release queue, remote review) |
| `VITE_LIS_API_URL` | Base URL for REST |
| `VITE_WS_URL` | Socket.IO base (edge) |

## Security / PHI

- Edge disk encryption + physical access control on the mini PC
- TLS to cloud; edge node auth token on sync
- Supabase Auth + RLS: `tech`, `authorizer`, `admin` (phleb later)
- Audit log on escalate, release, amend
- Doctor-facing outputs: **released only**
- No PHI in simulator defaults beyond fake demographics

## What Phase 0 is / is not

**Is:** runnable monorepo skeleton, docs, TCP ingest + SQLite + outbox stub, simulators, workbench shell.

**Is not:** full ASTM state machine, host-query worklists, auth/release workflow, QC, PDF reports, production Ubuntu device maps — see [ROADMAP.md](./ROADMAP.md) and [WORKFLOW.md](./WORKFLOW.md).
