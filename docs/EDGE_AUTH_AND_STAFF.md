# Edge-first staff login and cloud device access — plain-English guide

**Who this is for:** lab owner, IT staff, and developers. Every acronym is explained here or in [GLOSSARY.md](./GLOSSARY.md).

**Related docs:** [EDGE_SECURITY_AND_BACKUP.md](./EDGE_SECURITY_AND_BACKUP.md) (network/app/physical hardening), [ARCHITECTURE.md](./ARCHITECTURE.md) (Security / PHI), [LAB_MINI_PC_SETUP.md](./LAB_MINI_PC_SETUP.md) (first admin + first cloud device, step by step), [LOCAL_DEV.md](./LOCAL_DEV.md) (dev accounts), [AUDIT.md](./AUDIT.md) (audit log fields).

---

## Plain summary

Three rules drive everything in this doc:

1. **Every staff account is created on the lab PC (the "edge"), never in the cloud.** The mini PC in the lab keeps its own little staff list in **SQLite** and can check a password and log someone in **with no internet connection at all**.
2. **Only admin and authorizer accounts can ever sign into the cloud app.** Techs still exist in the cloud (so their name shows up correctly on old results, and so the system can prove who did what), but the cloud will **refuse** to log them in — even if they somehow had the right password.
3. **The cloud app also refuses to run on a computer it doesn't recognize.** The very first time an admin or authorizer signs into the cloud from a given laptop/computer, that computer has to be "enrolled" with a one-time code from the lab PC. After that, the browser remembers it, and day-to-day sign-in is just email + password.

Why this design, in one paragraph: the **lab PC must never depend on the internet** to let staff log in and do their job, so it owns sign-in for everyone. But the **cloud app** is where an authorizer might sign off on a result from home, or an admin might check on the lab remotely — and that is exactly the kind of remote access that needs the strongest protection, so it gets an extra layer (device enrollment) that the always-on-site lab PC does not need.

---

## Glossary (auth & devices)

| Term | What it means | Why we care | How we use it here |
| --- | --- | --- | --- |
| **Edge** | The app running on the lab's own mini PC | It is "at the edge" of the network, closest to the instruments — works with no internet | `apps/edge-engine`, port `3101` |
| **Cloud** | The hosted app that authorizers/admins can reach from anywhere | Lets an authorizer release a result from home | `apps/api` + `apps/web` (`VITE_LIS_MODE=cloud`) |
| **JWT** | JSON Web Token — a signed, tamper-proof "ticket" that says who you are | Sent with every request after login so the server doesn't need to check your password again | Edge issues its own JWT; cloud uses a Supabase JWT |
| **scrypt** | A slow-on-purpose password-hashing algorithm built into Node.js | Makes stolen password hashes very expensive to crack | Edge stores `scrypt(password)`, never the real password |
| **Outbox** | A local to-do list of "things to tell the cloud" | Lets the edge work offline and catch up later | Staff changes go out as a `staff.upsert` outbox event, same as results |
| **Supabase Auth** | The cloud's login system (part of Supabase) | Issues the JWT that the cloud app trusts | Only admin/authorizer accounts are allowed to actually get a session from it |
| **`profiles` table** | The cloud's list of people, one row per Supabase Auth user | Holds role, name, job title, and `cloud_login_allowed` | Filled in automatically when a staff row syncs from edge |
| **Auth Hook** | A small function Supabase Auth runs *before* handing out a login ticket | Lets us say "no" even to someone with a correct password | `custom_access_token_hook` — rejects anyone with `cloud_login_allowed = false` |
| **Lab device** | One specific enrolled browser/computer, tracked by name and owner | The cloud app requires one of these for every login | Row in `lab_devices`; token stored in that browser's `localStorage` |
| **Device enrollment code** | A one-time, 8-character, 10-minute code | Proves "an admin standing at the lab PC vouches for this new computer" | Generated on the **Staff** page (edge), typed in on the cloud **Enroll device** screen |
| **Device token** | A long random secret saved in the browser after enrollment | So the browser doesn't need a new code every day | Sent as the `X-Lab-Device-Token` header on every cloud request |
| **`device_login_log`** | An append-only list of every cloud sign-in attempt | Answers "who signed in, from which device, and did it work?" | One row per attempt — success or failure |
| **`device_snapshot`** | A frozen copy of "which device, whose device" saved on an audit row | So the record still makes sense even if the device is later renamed, reassigned, or revoked | Column on `clinical_audit_log` |
| **RLS** | Row Level Security — Postgres rule that restricts which rows a request can see | The three new device tables are locked to server-only access | `lab_devices`, `device_enrollment_codes`, `device_login_log` grant nothing to `anon`/`authenticated` |
| **MFA** | Multi-Factor Authentication — a second proof of identity beyond a password | Stronger than device enrollment alone | Not implemented yet — see [Out of scope](#out-of-scope) |

---

## Who can log in where

| Role | Log in on the lab PC (edge) | Log in on the cloud app |
| --- | --- | --- |
| **tech** (phlebotomist, lab technologist, receptionist, etc.) | ✅ Always — offline-capable | ❌ Never — blocked by the Auth Hook even with the right password |
| **authorizer** | ✅ Always | ✅ Yes, from an **enrolled device** |
| **admin** | ✅ Always | ✅ Yes, from an **enrolled device** |

Techs do bench work, accession specimens, and review results — all on the lab PC. They never need to be anywhere else, so they never get cloud access. Authorizers and admins can be **out of the lab** (at another clinic, at home, on call) and still need to sign off on results or manage the lab remotely — that's the entire reason the cloud app and cloud login exist.

---

## Why creating a staff account is not "one table, copied to the cloud"

It would be simplest if the edge `Staff` table were just mirrored byte-for-byte into a cloud table. It isn't, on purpose — the **same person** ends up represented in **two different systems** that speak different languages:

```
Edge SQLite `Staff` row                       Cloud (two places)
──────────────────────                        ──────────────────
id (UUID, made on the edge)      ──same id──▶  Supabase auth.users.id
                                               Supabase profiles.id
email + passwordHash             ──password──▶ auth.admin.createUser / updateUser
                                                (same password, sent once, over HTTPS)
role, fullName, jobTitle,
isActive                          ───────────▶ profiles columns
cloudLoginAllowed (derived)       ───────────▶ profiles.cloud_login_allowed
```

The **edge is the source of truth**. When a staff row is created or changed on the lab PC, the edge:

1. Hashes the password locally (`scrypt`) — the plain password never touches disk.
2. Adds a `staff.upsert` event to the same **outbox** used for specimens and results.
3. When the internet comes back (or immediately, if it's already up), that event reaches the cloud API's sync endpoint, over the same authenticated channel (`EDGE_SYNC_TOKEN`) used for clinical sync.
4. The cloud API's **staff projector** (`StaffProvisioningService`) turns that one event into:
   - A Supabase Auth user (created on first sync, password/metadata updated on later syncs) — via the Supabase **admin** API, using the **same UUID** the edge generated, so the two systems always agree on "who is this."
   - A `profiles` row with role, name, job title, active flag, and `cloud_login_allowed`.

**`cloudLoginAllowed`** is computed automatically from role — `true` for `admin`/`authorizer`, `false` for `tech` — you never set it directly. Techs still get a Supabase Auth user and a `profiles` row (so their name is correct on audit trails and old results), but that flag keeps the door locked for them at the next layer.

The plain password is only ever sent **once per change** (create, or an explicit password change) inside that single sync payload over HTTPS — it is not kept sitting in the outbox queue longer than needed, and it is never logged.

---

## The Auth Hook — a second lock on the cloud login door

Even with `cloud_login_allowed = false` in the `profiles` table, a tech's Supabase Auth account technically still has a valid password. If we relied only on the cloud API to check that flag *after* login, a bug or a bypassed endpoint could let a tech's session token through. So we added a lock at the earliest possible point instead:

- `public.custom_access_token_hook(event)` is a small Postgres function.
- Supabase Auth calls it **every time it is about to hand out a session token** (right after a correct password check).
- The function looks up `profiles.cloud_login_allowed` for that user.
- If it's not `true`, the function **raises an error** — Supabase Auth refuses to issue the token at all. The sign-in fails with a clear message ("cloud login is restricted to admin and authorizer accounts — sign in on the lab PC instead"), even though the password was correct.
- If it is `true`, the function stamps `cloud_login_allowed: true` onto the token's claims and lets it through.

This means a tech is blocked **before** any application code runs — not by a guard that could be forgotten on a new route.

**Local dev:** wired in [`supabase/config.toml`](../supabase/config.toml) under `[auth.hook.custom_access_token]`. **Hosted Supabase:** the same SQL function is created by the migration; you additionally have to flip it on once from the dashboard — see [LAB_MINI_PC_SETUP.md](./LAB_MINI_PC_SETUP.md#hosted-supabase-one-time-setup) and the checklist below.

---

## Lab device enrollment — how the cloud app knows "this is a lab computer"

### Why not just use the MAC address?

A natural first idea: every network card has a unique **MAC address** burned in by the manufacturer, so why not just check that? Because **a web browser cannot see it.** Websites (and the cloud app is just a website) are deliberately not allowed to read a computer's MAC address, IP address, serial number, or any other hardware ID — that's a privacy protection built into every browser, and there's no way around it from application code. So we needed something a browser *can* store and send: a random secret, generated by us, saved in that browser only.

### How it actually tracks "always the same device"

1. **Enrollment (one time per browser):**
   - An **admin**, on the **lab PC**, opens the **Staff** page and clicks **Issue cloud device** next to the admin or authorizer who needs cloud access, and generates a code.
   - This creates a short-lived (10 minute), one-time 8-character code, and records **who it was generated for** (`assignToStaffId`).
   - The edge pushes that code to the cloud immediately (`POST /sync/device-enrollment-codes`), the same way it pushes staff and results.
   - That person signs into the cloud app with their email + password (which must pass the Auth Hook above). If this browser has no saved device token yet, they see an **"Enter lab code"** screen.
   - They type in the code and name the device (e.g. "Dr. Bennett's laptop"). The cloud validates the code (not expired, not already used, and assigned to *this* signed-in person — or to an admin completing setup for someone else), then creates a `lab_devices` row and generates a brand-new random secret: the **device token**.
   - The browser saves `{ deviceId, deviceToken }` in `localStorage`. This is the "memory" — from now on, this specific browser, on this specific computer, has that secret and nothing else does.

2. **Every day after that:**
   - Sign in with email + password only — nothing extra to remember.
   - The browser automatically attaches `X-Lab-Device-Id` and `X-Lab-Device-Token` headers to every request to the cloud API.
   - The server checks the token against the `lab_devices` row: right ID, right token (hashed and compared), not revoked, and it belongs to (or was legitimately assigned for) the person currently signed in. If any of that fails, the request is rejected.

3. **If the laptop is lost or someone leaves:** an admin **revokes** the device from the device registry. The stored token in that browser becomes worthless immediately — the next request fails, and a fresh enrollment code is required to use the cloud app from that computer again.

Clearing browser data (or using a different browser, or incognito mode) deletes the saved token, so that "computer" would need to enroll again with a fresh code — this is expected and matches the "one code per browser" model.

### Device ownership — three questions, answered forever

| Question | Answered by |
| --- | --- |
| Who was this laptop issued to? | `lab_devices.owner_staff_id` (+ name, frozen on later audit rows even if the device is renamed) |
| When did someone sign in on it? | `device_login_log` — one row per attempt, success or failure, with a reason code |
| Who did what, from which device? | `clinical_audit_log.device_id` + `clinical_audit_log.device_snapshot` on every cloud action |

**Owner vs. the person signed in:** normally the same person. If an admin sets up a laptop **for** an authorizer who isn't there yet, the admin picks that authorizer as the "assign to" when generating the code — enrollment checks that the person completing it is either that assignee or an admin. The **owner** field only changes if an admin explicitly **reassigns** the device (which is itself an audited action), so "who does this computer belong to" never silently drifts.

**Edge devices are different on purpose.** The lab PC itself does not use this device-token system — staff already have to be physically at the lab PC (or on its network) to use it, and every edge action is already attributed to the signed-in staff member via the existing audit "actor" fields. Device tokens exist specifically to lock down **remote** cloud access.

---

## What gets logged, and where to look

| Event | Where it lives | What's recorded |
| --- | --- | --- |
| Edge sign-in success/failure | Edge `AuditEvent` (`staff.login` / `staff.login_failed`) | Who, when, and the outcome |
| Cloud sign-in attempt | `device_login_log` | `device_id`, `user_id`, `owner_staff_id`, `outcome` (`success`, `failed_password`, `failed_device`, `failed_role`, `revoked_device`), IP, user agent, timestamp |
| Device enrolled / revoked / reassigned | `clinical_audit_log` (`device.enrolled`, `device.revoked`, `device.reassigned`) | Who did it, which device, new owner if reassigned |
| Any cloud action while a device is attached (release, recall, dismiss, email report, staff edit) | `clinical_audit_log.device_id` + `.device_snapshot` alongside the existing actor fields | e.g. "Dr. Bennett released accession DH2026090001, from **Dr. Bennett's laptop**, owned by Dr. Bennett, at 14:32" |

See [AUDIT.md](./AUDIT.md) for the full audit log schema and how to query it.

---

## Environment variables

### Edge (`apps/edge-engine`)

| Variable | Example | Purpose |
| --- | --- | --- |
| `EDGE_JWT_SECRET` | (32-byte hex, `openssl rand -hex 32`) | Signs/verifies edge login sessions. **Required** when `EDGE_HARDENING=true`. |
| `EDGE_STAFF_SEED` | `true` (default) / `false` | Auto-seed the 7 dev/demo staff accounts on first boot when the `Staff` table is empty. Set to `false` on a real lab PC — the first admin is created via `POST /staff/bootstrap-admin` instead. |
| `EDGE_SYNC_TOKEN` | (secret, shared with cloud) | Same channel used to push `staff.upsert` and device enrollment codes to the cloud |
| `CLOUD_API_URL` | `http://localhost:3102` | Where the edge pushes staff/device sync events |

See [`apps/edge-engine/.env.example`](../apps/edge-engine/.env.example).

### Cloud (`apps/api`)

No new secrets — staff/device sync arrives over the existing `EDGE_SYNC_TOKEN` channel. The Auth Hook is a Postgres function enabled in `supabase/config.toml` (local) or the hosted dashboard (production). See [`apps/api/.env.example`](../apps/api/.env.example).

---

## Bootstrapping a brand-new lab PC

1. Fresh mini PC, `Staff` table is empty.
2. Open the lab UI → first-run screen calls `POST /staff/bootstrap-admin` with a name/email/password. This route works **with no login at all**, but only while the `Staff` table is empty — it locks itself out the instant one row exists, so it can never be used to create a second account.
3. That first admin signs in normally from then on, and can add every other staff member from the **Staff** page.
4. To get that admin (or an authorizer hired later) cloud access: sign in on the lab PC, go to **Staff**, click **Issue cloud device** for that person, and hand them the code.

Full step-by-step (including Docker, network setup, and the physical mini PC) is in [LAB_MINI_PC_SETUP.md](./LAB_MINI_PC_SETUP.md).

---

## Local development

`pnpm dev:local` seeds the **same fixed accounts** on the edge as [`supabase/seed.sql`](../supabase/seed.sql) used to seed directly into Supabase — same emails, same UUIDs, password `password123` for all. On boot, the edge's `StaffSeedService` creates these rows in SQLite (if the table is empty) and enqueues `staff.upsert` events, so the local Supabase project ends up with the exact same people, but arriving through the real sync path instead of a raw SQL insert. `supabase/seed.sql` still inserts them directly too, purely so cloud-mode (`pnpm dev`) testing works immediately without waiting on an edge sync — the two are idempotent against each other (same UUIDs).

| Email | Password | Role | Can sign into cloud dev (`pnpm dev` / `VITE_LIS_MODE=cloud`)? |
| --- | --- | --- | --- |
| `admin@draxhall.local` | `password123` | admin | ✅ |
| `authorizer@draxhall.local` | `password123` | authorizer | ✅ |
| `tech@draxhall.local`, `phleb@draxhall.local`, `karen@draxhall.local`, `reception@draxhall.local`, `labtech@draxhall.local` | `password123` | tech | ❌ (blocked by the Auth Hook, same as production) |

Set `EDGE_STAFF_SEED=false` to skip auto-seeding (e.g. to test the bootstrap-admin flow from a clean slate).

To test the cloud device-enrollment screen locally: sign in on the edge SPA (`VITE_LIS_MODE=edge`, port `3100`) as `admin@draxhall.local`, open **Staff**, click **Issue cloud device** for `authorizer@draxhall.local`, then sign in on a cloud-mode build/tab as that authorizer and enter the code.

More on running the stack: [LOCAL_DEV.md](./LOCAL_DEV.md).

---

## Go-live checklist (staff auth + devices)

- [ ] `EDGE_JWT_SECRET` set to a real random value (not left blank/default)
- [ ] `EDGE_STAFF_SEED=false` on the real lab PC (no demo accounts)
- [ ] First admin created via `POST /staff/bootstrap-admin`, then the route is naturally locked out
- [ ] All other staff added from the **Staff** page on the lab PC — never on the cloud
- [ ] Signing in as a tech on the cloud app fails, even with a correct password
- [ ] `custom_access_token_hook` enabled on the **hosted** Supabase project (Dashboard → Authentication → Hooks), not just local `config.toml`
- [ ] Every admin/authorizer who needs remote access has enrolled at least one device
- [ ] A lost/replaced laptop's device is **revoked** from the device registry the same day
- [ ] Spot-check: release an accession from the cloud app, confirm the audit row shows the correct device + owner

---

## Out of scope (documented for later)

- Multi-Factor Authentication (MFA) for cloud admin/authorizer accounts
- Binding a device to hardware (MAC address, TPM, etc.) — not possible from a browser; the enrollment-code + saved-token model above is the practical equivalent
- Bidirectional staff signup (creating a cloud-first account that flows back to the edge) — the edge is the sole source of truth by design
