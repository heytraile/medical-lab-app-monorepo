# Drax Hall Clinical Laboratory LIS

Hybrid **Edge–Cloud** Laboratory Information System for Drax Hall Clinical Laboratory.

Barcode / accession number is the spine of the system: every tube, analyzer result, pending sync row, and cloud report hangs off that ID.

## Architecture at a glance

| Layer | App / package | Role |
| --- | --- | --- |
| Edge mini PC | `apps/edge-engine` | NestJS: serial/TCP ingest, SQLite WAL, outbox sync, ZPL, Socket.IO |
| Cloud API | `apps/api` | NestJS: LIS HTTP API → Supabase Postgres |
| Workbench | `apps/web` | TanStack Start UI (edge or cloud mode) |
| Simulators | `apps/simulators` | Fake analyzers + fake Zebra for local testing |
| Contracts | `packages/contracts` | Zod schemas for specimen, results, sync events |
| Protocols | `packages/protocols` | ASTM E1381/E1394, MLLP HL7 framing helpers |

```
Analyzers (RS-232 / TCP)
        │
        ▼
  edge-engine (SQLite + outbox)
        │  HTTPS when online
        ▼
     api → Supabase
        ▲
        │
       web (bench / register / sync)
```

## Quick start

```bash
pnpm install
pnpm db:generate
pnpm db:push
pnpm dev
```

- Edge API: http://localhost:3101  
- Cloud API: http://localhost:3102  
- Web workbench: http://localhost:3100  

See [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) for simulators, Docker, and socat serial PTYs.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system map, data flow, offline rules
- [docs/ROADMAP.md](docs/ROADMAP.md) — phased build order
- [docs/ANALYZERS.md](docs/ANALYZERS.md) — four instruments, ports, protocols
- [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) — run the simulated lab on this machine

## Analyzers

| Machine | Protocol |
| --- | --- |
| Sysmex XS-1000i | ASTM E1381 / E1394 |
| Diamond ProLyte | ASCII delimited (ASTM fallback) |
| Mindray BS-240 | ASTM E1394 |
| YHLO iFlash 1200 | HL7 v2.3.1 over MLLP |

## License

Private — Drax Hall Clinical Laboratory.
