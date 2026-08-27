# Medical Lab App Monorepo

Hybrid **Edge–Cloud** Laboratory Information System (LIS).

First deployment: **Drax Hall Clinical Laboratory**. Product direction: the same stack for many labs.

Barcode / accession number is the spine of the system: every tube, analyzer result, pending sync row, and cloud report hangs off that ID.

## Architecture at a glance

| Layer | App / package | Role |
| --- | --- | --- |
| Edge mini PC | `apps/edge-engine` | NestJS **bridge**: serial/TCP ingest, SQLite WAL, outbox push, ZPL, Socket.IO |
| Cloud API | `apps/api` | NestJS in front of **Supabase** (sync, release, notifications) |
| Workbench | `apps/web` | TanStack Start UI — Bench Review, Register, Sync, Release queue |
| Simulators | `apps/simulators` | Fake analyzers + fake Zebra for local testing |
| Contracts | `packages/contracts` | Zod schemas for specimen, results, sync events |
| Protocols | `packages/protocols` | ASTM E1381/E1394, MLLP HL7 framing helpers |

```
Analyzers (RS-232 / TCP)
        │
        ▼
  edge-engine (SQLite + outbox)  ──push──►  api → Supabase
        ▲                                      ▲
        │                                      │
   web (edge mode)                      web (cloud mode)
   Bench Review                         Release queue
```

## Quick start

Requires Node 20+, pnpm 11, and Docker Desktop running.

```bash
pnpm install
pnpm db:generate        # edge database (SQLite)
pnpm db:push
pnpm supabase:start     # cloud database (local Supabase in Docker; first run pulls images)
pnpm dev:local
```

- Edge API: http://localhost:3101  
- Cloud API: http://localhost:3102  
- Web workbench: http://localhost:3100  
- Supabase Studio: http://127.0.0.1:54323  

Sign in with `authorizer@draxhall.local` / `password123` (seeded, local only).

`pnpm dev:local` needs no accounts or shared secrets. Use `pnpm dev` to point the same
apps at a **hosted** Supabase project via Doppler instead.

See [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) for the Supabase workflow, migrations, Doppler keys, simulators, Docker, and socat serial PTYs.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system map, Nest↔Nest sync, offline rules
- [docs/WORKFLOW.md](docs/WORKFLOW.md) — Bench Review, authorizer release, critical STAT alerts
- [docs/IDENTITY.md](docs/IDENTITY.md) — local patient registry, duplicates, Register confirmation gate
- [docs/GLOSSARY.md](docs/GLOSSARY.md) — acronyms, protocols, and lab test codes (living)
- [docs/ROADMAP.md](docs/ROADMAP.md) — phased build order
- [docs/ANALYZERS.md](docs/ANALYZERS.md) — four instruments, ports, protocols
- [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) — run the simulated lab on this machine

## Analyzers

| Machine | Protocol |
| --- | --- |
| Sysmex XS-1000i | ASTM E1381 / E1394 |
| Diamond ProLyte | RS-232 multi-line ASCII (Na/K/Cl/Li) |
| Mindray BS-240 | ASTM E1394 |
| YHLO iFlash 1200 | HL7 v2.3.1 over MLLP |

## License

Private — Traile / lab product source (Drax Hall first customer).
