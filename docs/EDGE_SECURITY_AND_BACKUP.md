# Edge security and backup — plain-English guide

**Who this is for:** lab owner, IT staff, and developers preparing the Drax Hall mini PC for go-live. Every acronym is explained here or in [GLOSSARY.md](./GLOSSARY.md).

**Related docs:** [ARCHITECTURE.md](./ARCHITECTURE.md) (Security / PHI), [ROADMAP.md](./ROADMAP.md) (Phase 4), [GLOSSARY.md](./GLOSSARY.md), [LAB_MINI_PC_SETUP.md](./LAB_MINI_PC_SETUP.md) (full install runbook), [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md) (staff sign-in, cloud login, device enrollment — the "who can log in" half of this story).

---

## Plain summary

The lab mini PC runs **edge-engine** — a local NestJS app that:

- Talks to analyzers (TCP/serial)
- Stores today’s bench work in **SQLite** (`/data/edge.db`)
- Serves the staff UI on port **3101**
- Syncs selected events to the **cloud API** (Supabase) when online

That local database holds **PHI** (patient names, accessions, results). Cloud sync is **not** a full disaster-recovery backup. If the PC dies without local backups, you can lose same-day work that has not synced yet, pending outbox rows, and raw instrument context.

**“Secure enough” before go-live** means:

1. Staff must **log in** to reach patient/specimen/label/sync routes on the lab PC.
2. Dev-only routes (`/demo`, `POST /ingest`, `POST /patients/seed`) are **hidden** in production.
3. Browser and Socket.IO connections are limited to **known origins** (your lab UI URL).
4. Basic **security headers** and **rate limits** protect against casual abuse on the LAN.
5. **Automated SQLite backups** land on `/backups` (ideally a separate disk/partition), with a tested restore path.

HTTPS on the lab LAN, disk encryption, and a formal pentest are documented as follow-up tasks — not fully automated in code yet.

---

## Glossary (security & backup)

| Term | What it means | Why we care | How we use it here |
| --- | --- | --- | --- |
| **PHI** | Protected Health Information — anything that identifies a patient | Legal and clinical duty; breach harms patients and the lab | Patient lists, labels, local results, audit rows |
| **HTTPS** | HTTP Secure — web traffic encrypted with TLS | Stops LAN snooping on login tokens and PHI in transit | Target for lab UI in Phase 4; cloud sync already uses TLS |
| **TLS** | Transport Layer Security — the encryption behind HTTPS | Same as HTTPS | Edge → cloud API calls |
| **LAN** | Local Area Network — wired/wifi inside the clinic | Primary attack surface for the mini PC | Only staff VLAN should reach `:3101` |
| **VLAN** | Virtual LAN — network segment isolation | Keeps guest Wi‑Fi off lab devices | Recommended: lab PC on staff VLAN only |
| **LUKS** | Linux Unified Key Setup — full-disk encryption | Stolen PC or removed drive does not expose SQLite | OS-level setup on Ubuntu mini PC (documented, not automated) |
| **RLS** | Row Level Security — database rules per user role | Cloud Postgres enforces who sees which rows | Supabase `profiles.role` → tech / authorizer / admin |
| **JWT** | JSON Web Token — signed login session blob | Bearer token issued at login | Edge issues its **own** JWT at `/auth/login` (offline); sent as `Authorization: Bearer …` — see [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md) |
| **CORS** | Cross-Origin Resource Sharing — browser rule for which sites may call an API | Without it, random websites could call your lab API if a staff browser is compromised | `CORS_ORIGINS` env — comma-separated staff UI URLs |
| **Socket.IO** | Real-time WebSocket library for bench live updates | Same origin policy as HTTP | `/bench` namespace uses the same allowlist as CORS |
| **OWASP** | Open Web Application Security Project — common web risk list | Checklist for hardening | Rate limits, auth, no dev routes in prod |
| **Pentest** | Penetration test — hired security review | Validates LAN + app controls before external exposure | Phase 4 / go-live sign-off (out of scope for this code pass) |
| **WAL** | Write-Ahead Log — SQLite journal mode | Safer concurrent writes while backing up live | Enabled at startup via Prisma |
| **SQLite** | Embedded file database | Whole lab day on one file | `/data/edge.db` |
| **3-2-1** | Backup rule: 3 copies, 2 media types, 1 off-site | Survives fire/theft/disk failure | Local `/backups` is copy 2; NAS/off-site is Phase 4 |
| **NAS** | Network Attached Storage — file server on LAN | Off-site-ish second copy | Optional later; mount and rsync `/backups` |
| **SSH** | Secure Shell — encrypted remote admin | Patch Ubuntu, inspect logs | IT access to mini PC; disable password auth |
| **API** | Application Programming Interface | Staff UI and sync call edge HTTP routes | NestJS on `:3101` |
| **NestJS** | Node.js server framework | Edge and cloud backends | `apps/edge-engine` |
| **Supabase** | Hosted Postgres + Auth | Cloud system of record | Login + profiles; edge validates JWT |
| **Outbox** | Local queue of sync events | Offline-safe upload | `pending` → `acked` after cloud accepts |
| **Acked** | Acknowledged — cloud confirmed receipt | Safe to prune old transport rows | `POST /sync/prune-acked` (auth required when hardened) |
| **Helmet** | Express middleware for security HTTP headers | Reduces XSS/clickjacking risk | Enabled when `EDGE_HARDENING=true` |
| **Rate limiting** | Cap requests per IP per minute | Slows password guessing and scraping | `@nestjs/throttler` — 100 req/min when hardened |

---

## Cloud sync vs local backup

### What cloud sync does

- Copies **outbox events** (results, escalations, etc.) to the hosted cloud API.
- Cloud writes to **Supabase** with RLS and audit.
- Authorizers work from cloud-backed release queue when sync is healthy.

### What cloud sync does **not** do

- It is **not** a byte-for-byte copy of `edge.db`.
- It does **not** guarantee recovery of:
  - Unsynced same-day accessions
  - Pending outbox rows after prolonged outage
  - Local-only audit detail
  - Analyzer raw frames not modeled in sync payloads

### Why local backup matters

If the SSD fails at 4 PM, cloud may have yesterday’s released results but **not** today’s bench gallery, labels reprinted locally, or specimens registered after the last successful sync.

**Local backup** = scheduled `sqlite3 .backup` to `/backups/edge-YYYYMMDD-HHMMSS.db`, kept for `BACKUP_RETENTION_DAYS` (default 7).

---

## Network security

| Control | What | Why | How |
| --- | --- | --- | --- |
| Firewall | Only required ports open | Shrinks attack surface | Ubuntu `ufw`: allow 3101 from staff subnet only; block WAN |
| VLAN | Lab PC not on guest Wi‑Fi | Prevents casual LAN access | IT network design |
| HTTPS (goal) | Encrypt UI + API on LAN | Protects JWT and PHI on wire | Reverse proxy (Caddy/nginx) — Phase 4 runbook |
| CORS / Socket.IO | Allowlist staff UI origin | Blocks drive-by browser abuse | Set `CORS_ORIGINS` to e.g. `http://192.168.1.50:3101` or future HTTPS URL |

**Who can reach port 3101?** Only devices on the lab/staff network segment. The internet should **not** port-forward 3101.

---

## Application security

| Control | What | Why | How |
| --- | --- | --- | --- |
| Login required | Edge JWT on PHI routes | Anonymous LAN client cannot list patients | `HardenedAuthGuard` when `EDGE_HARDENING=true` or `NODE_ENV=production` — see [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md) for how staff accounts and login work |
| Dev routes off | No fake ingest/demo in prod | Prevents data injection | `DemoModule` omitted; `DevOnlyGuard` on `/ingest`, `/patients/seed` |
| Dev tokens blocked | `dev:tech` bearer disabled | Stops shortcut auth in prod | `auth.guard.ts` rejects `dev:*` when hardened |
| Rate limits | 100 requests/min/IP | Slows brute force | `@nestjs/throttler` global guard |
| Security headers | Helmet defaults | Browser-side protections | `main.ts` when hardened |
| Audit trail | Who did what | Accountability | SQLite audit + cloud audit on release |

**Public when hardened:** `GET /health`, `GET /print/status` (printer connectivity only — no PHI).

**Admin only:** `POST /sync/backup` — manual SQLite backup trigger.

---

## Physical security

| Control | What | Why | How |
| --- | --- | --- | --- |
| Locked location | PC in lab office or rack | Prevents USB theft | Cable lock / locked room |
| LUKS encryption | Encrypted disk | Drive removal does not leak DB | Ubuntu installer or `cryptsetup` — IT runbook |
| USB policy | Restrict removable media | Reduces malware/exfil | Group policy or udev disable (optional) |

---

## Backup plan

### Schedule

- **Every 30 minutes** (configurable via `BACKUP_INTERVAL_MINUTES`): hot backup via `sqlite3 .backup` (safe with WAL).
- Files: `/backups/edge-YYYYMMDD-HHMMSS.db`
- **Retention:** delete files older than `BACKUP_RETENTION_DAYS` (default 7).

### Host setup (recommended)

1. Mount `/backups` to a **different physical disk or partition** than `/data` when possible.
2. In Compose, volume `edge-backups` maps to `/backups` inside the container.
3. Optionally rsync `/backups` to NAS nightly (Phase 4).

### Manual backup (admin)

```bash
curl -X POST http://localhost:3101/sync/backup \
  -H "Authorization: Bearer <admin-jwt>"
```

Or inside the container:

```bash
docker exec <lab-container> sqlite3 /data/edge.db ".backup '/backups/manual-$(date -u +%Y%m%d-%H%M%S).db'"
```

### Restore drill

1. Stop lab container.
2. Copy a backup file over `/data/edge.db` (or use script below).
3. Start container; verify accession list and latest results.
4. Record date of last successful drill in your runbook.

**Script:** [`infra/scripts/restore-edge-db.sh`](../infra/scripts/restore-edge-db.sh)

```bash
chmod +x infra/scripts/restore-edge-db.sh
./infra/scripts/restore-edge-db.sh /path/to/edge-20260101-120000.db infra-lab-1
```

---

## Environment variables (lab production)

| Variable | Example | Purpose |
| --- | --- | --- |
| `EDGE_HARDENING` | `true` | Enable auth, helmet, throttler, disable demo |
| `NODE_ENV` | `production` | Also enables hardening (Dockerfile.lab sets this) |
| `EDGE_JWT_SECRET` | (secret, `openssl rand -hex 32`) | Signs staff login sessions — **required** when hardened. See [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md) |
| `EDGE_STAFF_SEED` | `false` | Skip auto-creating demo staff accounts on a real lab PC |
| `CORS_ORIGINS` | `http://192.168.1.50:3101` | Staff UI origin(s), comma-separated |
| `BACKUP_DIR` | `/backups` | Where `.db` backups are written |
| `BACKUP_RETENTION_DAYS` | `7` | Auto-delete older backups |
| `BACKUP_INTERVAL_MINUTES` | `30` | Documented interval (cron every 30 min) |
| `EDGE_SYNC_TOKEN` | (secret) | Edge → cloud sync authentication |

See [`apps/edge-engine/.env.example`](../apps/edge-engine/.env.example).

**Local dev:** `pnpm dev:local` does **not** set `EDGE_HARDENING` — routes stay open for fast iteration.

---

## Before go-live checklist (Drax Hall)

- [ ] `EDGE_HARDENING=true` and `CORS_ORIGINS` set to real staff UI URL
- [ ] `EDGE_JWT_SECRET` set to a real random value; `EDGE_STAFF_SEED=false`; no `dev:*` tokens accepted
- [ ] Cloud Auth Hook (`custom_access_token_hook`) enabled on the hosted Supabase project — see [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md)
- [ ] Unauthenticated `GET /patients` returns **401**
- [ ] `POST /demo/bench` returns **404**
- [ ] `POST /ingest` returns **404**
- [ ] Backup file appears in `/backups` within 30 minutes
- [ ] Restore drill completed on a test copy
- [ ] Firewall: port 3101 limited to staff LAN
- [ ] Physical: PC secured; LUKS planned or enabled
- [ ] `EDGE_SYNC_TOKEN` rotated from dev default
- [ ] Cloud API URL points to production hosted API

---

## Verification commands (hardened lab)

```bash
# Should 401 without token
curl -s -o /dev/null -w "%{http_code}" http://localhost:3101/patients

# Should 404 when hardened
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3101/demo/bench

# List backups
docker exec <lab-container> ls -la /backups
```

---

## Implementation log (code changes)

| Area | Files | Behavior |
| --- | --- | --- |
| Hardening flag | `apps/edge-engine/src/config/production-hardening.ts` | `isProductionHardened()` |
| CORS allowlist | `config/cors-origins.ts`, `main.ts`, `realtime/realtime.gateway.ts` | `CORS_ORIGINS` env |
| Auth guards | `auth/hardened-auth.guard.ts`, `auth/dev-only.guard.ts`, controllers | PHI routes require login when hardened |
| Dev routes | `app.module.ts`, `DevOnlyGuard` | Demo module omitted; ingest/seed 404 |
| Dev tokens | `auth/auth.guard.ts` | Reject `dev:*` when hardened |
| Headers + limits | `main.ts`, `app.module.ts` | Helmet + throttler when hardened |
| Backup cron | `backup/backup.service.ts`, `backup/backup.module.ts` | sqlite3 `.backup`, prune, `POST /sync/backup` |
| Docker | `infra/Dockerfile.lab`, `infra/docker-compose.yml` | sqlite3, `/backups` volume, env |
| Restore | `infra/scripts/restore-edge-db.sh` | Interactive restore helper |

---

## Out of scope (documented for Phase 4)

- HTTPS reverse proxy on lab LAN
- NAS / off-site copy automation
- Formal third-party pentest
- LUKS installation steps (OS-level — see Ubuntu docs)

Track these in [ROADMAP.md](./ROADMAP.md) Phase 4.
