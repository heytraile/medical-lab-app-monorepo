# Local development — simulated lab

Run the full edge loop on this Mac **without** the four physical analyzers.

## Prerequisites

- Node.js ≥ 20 (`nvm use` if you have `.nvmrc`)
- pnpm 11 (`corepack enable`)
- Optional: Docker Desktop, `socat` (for serial PTY pairs)

## Ports

Defaults avoid clashing with common Next.js apps on `:3000`–`:3002`:

| Service | Default port |
| --- | --- |
| Web workbench | `3100` |
| Edge engine | `3101` |
| Cloud API | `3102` |
| Sysmex TCP | `5001` |
| Mindray TCP | `5003` |
| iFlash TCP | `5004` |
| Zebra ZPL | `9100` |

Override with env vars (`PORT`, `VITE_LIS_API_URL`, `SYSMEX_TCP_PORT`, etc.) if needed.

## Install & database

```bash
cd medical-lab-app-monorepo
pnpm install
pnpm --filter @drax-lis/contracts build
pnpm --filter @drax-lis/protocols build
pnpm db:generate
pnpm db:push
```

## Run everything (dev)

```bash
pnpm dev
```

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

Or one-shot:

```bash
pnpm --filter @drax-lis/simulators send:sysmex
pnpm --filter @drax-lis/simulators send:iflash
```

Then open **Bench** — CBC / TSH rows should appear. **Sync** shows outbox counters draining to the cloud API (in-memory if Supabase env is empty).

## Manual ingest (no simulator)

```bash
curl -s http://localhost:3101/ingest -H 'content-type: application/json' -d '{
  "analyzerId": "sysmex_xs1000i",
  "protocol": "astm_e1394",
  "payload": "H|\\^&|||HOST\rP|1\rO|1|DHDEMO001\rR|1|^^^WBC|7.1|10*3/uL\rL|1|N"
}'
```

## Register + print

1. Open http://localhost:3100/register  
2. Enter a patient name → **Register & Print Label**  
3. If the Zebra simulator is running, ZPL appears in that terminal  

## Docker Compose

```bash
cd infra
docker compose up --build
# with simulators:
docker compose --profile sim up --build
```

## Serial PTYs with socat (Phase 1 preview)

Fake a null-modem cable between edge and a future serial simulator:

```bash
socat -d -d pty,raw,echo=0 pty,raw,echo=0
# Example output:
# N PTY is /dev/ttys003
# N PTY is /dev/ttys004
```

Point `PROLYTE_SERIAL_PATH` at one end; the simulator opens the other.

## Env files

| App | File |
| --- | --- |
| Edge | `apps/edge-engine/.env` |
| API | `apps/api/.env` |
| Web | `apps/web/.env` |

Supabase is optional for Phase 0. Leave `SUPABASE_URL` empty to use the API in-memory store.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Web can’t load results | Edge on :3101? CORS? `VITE_LIS_API_URL` |
| Simulator “timeout” | Edge TCP listeners started? Ports free? |
| Sync stuck pending | Cloud API on :3102? `CLOUD_API_URL` |
| Prisma errors | `pnpm db:generate && pnpm db:push` |
| Workspace import fails | Build `contracts` / `protocols` first |
| `EADDRINUSE` on 3000–3002 | Those ports are often other apps; LIS defaults are 3100–3102 |

## Suggested first demo script

1. `pnpm dev` + simulators  
2. Register “Jane Doe” / CBC  
3. Watch Sync pending → acked  
4. `send:sysmex` with matching barcode (or wait for loop)  
5. Bench shows WBC/RBC/HGB/PLT  
6. Unplug network / stop `api` → sync stays pending → restart api → drains  
