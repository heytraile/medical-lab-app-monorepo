# Medical Lab App Monorepo

A laboratory information system for **Drax Hall Clinical Laboratory** first, built so the same design can serve other labs later.

The barcode on the tube is the spine: every label, machine result, pending copy to the cloud, and signed-off report hangs off that ID. Staff use three names — **MRN** (who), **accession number** (this visit), **specimen ID** (this physical tube).

The **lab PC** next to the instruments works with no internet (accession, labels, machines, Bench). The **cloud** is the official copy for authorizer sign-off and reports. Labels print even if the internet is down.

Full plain-English map, including how security works: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Architecture at a glance

| Layer | Where | Role |
| --- | --- | --- |
| Lab PC | `apps/edge-engine` | Talks to machines and the printer; local database; staff screens in production |
| Cloud API | `apps/api` | Receives the lab PC’s copy; release, reports, notifications |
| Staff screens | `apps/web` | Accession, Bench, Connection, Release — pointed at the lab PC or the cloud |
| Fake machines | `apps/simulators` | Local testing without real analyzers |
| Shared rules | `packages/catalog`, `contracts`, `protocols` | Test list, message shapes, machine dialects |

```
Lab machines
     │
     ▼
Lab PC (save first, print labels, Bench)
     │  copy when the line is up
     ▼
Cloud (authorizer release, doctor reports)
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

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — whole system in plain English (visit flow, two computers, security)
- [docs/WORKFLOW.md](docs/WORKFLOW.md) — Bench Review, authorizer release, critical STAT alerts
- [docs/IDENTITY.md](docs/IDENTITY.md) — local patient registry, duplicates, Register confirmation gate
- [docs/DATA_INTEGRITY.md](docs/DATA_INTEGRITY.md) — accession vs specimen uniqueness, duplicates vs repeats, offline-first
- [docs/SECURITY.md](docs/SECURITY.md) — vulnerability reporting, dependency audit, CI gates
- [docs/EDGE_AUTH_AND_STAFF.md](docs/EDGE_AUTH_AND_STAFF.md) — who can log in on the lab PC vs the cloud
- [docs/GLOSSARY.md](docs/GLOSSARY.md) — acronyms, protocols, and lab test codes (living)
- [docs/ROADMAP.md](docs/ROADMAP.md) — phased build order
- [docs/ANALYZERS.md](docs/ANALYZERS.md) — four instruments in English, then protocols
- [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) — run the simulated lab on this machine

## Analyzers

| Machine | Protocol |
| --- | --- |
| Sysmex XS-1000i | ASTM E1381 / E1394 |
| Diamond ProLyte | Network LIS HTTP POST (LAN :5002) or RS-232 ASCII (Na/K/Cl/Li) |
| Mindray BS-240 | ASTM E1394 |
| YHLO iFlash 1200 | HL7 v2.3.1 over MLLP |

## License

Private — Traile / lab product source (Drax Hall first customer).
