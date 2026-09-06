# Lab Messenger — LAN + cloud unified inbox

Staff chat for Drax Hall LIS: **1:1 DMs and channels**, LAN-first, synced to Supabase for admin/authorizer remote access.

## Mental model

| Who | Where they chat | How delivery works |
| --- | --- | --- |
| Tech / phlebotomist / receptionist | Lab PC (edge) only | Socket.IO `/messaging` + SQLite — no Supabase session needed |
| Authorizer / admin on-site | Edge SPA | Same LAN WS path (instant) |
| Authorizer / admin remote | Cloud SPA | Supabase Realtime on `messages` + `POST /cloud/messaging/messages` |

Message **UUID is client-generated**. Edge SQLite and cloud Postgres both use that UUID as primary key, so duplicates from sync/Realtime merge into one bubble.

## Architecture

```
LAN client ──JWT──▶ Edge MessagingGateway (/messaging)
                      │
                      ├─▶ SQLite Conversation / Message
                      ├─▶ room broadcast (near-instant)
                      └─▶ outbox message.created / conversation.upsert
                                │
                                ▼
                         Cloud POST /sync/events
                                │
                                ▼
                         Postgres messages (+ Realtime)

Remote authorizer ──▶ POST /cloud/messaging/messages (origin=cloud)
                                │
                                ▼
                         Edge MessagingPullService (cron)
                                │
                                ▼
                         SQLite insert + WS broadcast to LAN
```

## Default channels (seeded on edge boot)

| Slug | Members |
| --- | --- |
| `#general` | All active staff |
| `#bench` | tech + admin |
| `#authorizers` | authorizer + admin |

## Auth

- **Edge REST/WS:** edge JWT (`EdgeAuthGuard` / handshake `auth.token`) — same as bench login.
- **Cloud REST:** Supabase JWT + `cloud_login_allowed` roles (`authorizer`/`admin`). Device guard applies in production (local-dev bypass exists).
- Staff Auth provisioning is **unchanged**: every role still gets `auth.users` + `profiles`; login remains gated by Auth Hook.

## Key files

| Path | Role |
| --- | --- |
| `apps/edge-engine/src/messaging/` | REST, Socket.IO gateway, pull worker |
| `apps/api/src/messaging/` | Cloud REST + outbox projection |
| `apps/web/src/routes/_lab/messages.tsx` | Unified inbox UI |
| `packages/contracts/src/messaging.ts` | Zod schemas / outbox payloads |
| `supabase/migrations/20260906083000_lab_messaging.sql` | Postgres tables + RLS + Realtime |

## Local verification

1. `pnpm supabase db reset` (or migrate) so messaging tables exist.
2. `pnpm dev:local` — sign in as tech and authorizer.
3. Open **Messages** — send in `#bench`; second browser should see it via WS.
4. Wait for outbox drain — row appears in Supabase Studio `messages`.
5. Cloud-mode authorizer tab: Realtime receives new rows; reply via cloud API; edge pull brings it to LAN techs.

## Non-goals (v1)

Attachments, read receipts, accession-linked threads, PowerSync, raw `ws` adapter migration.
