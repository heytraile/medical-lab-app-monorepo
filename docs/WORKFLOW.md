# Clinical workflow — Bench Review, release authority, critical alerts

Living product requirements. First customer: Drax Hall Clinical Laboratory. Designed so the same model sells to other labs later.

Terms and assay codes: [GLOSSARY.md](./GLOSSARY.md).
Build this **very soon** after protocol/sync foundations — see [ROADMAP.md](./ROADMAP.md) Phase 3 (elevated).

---

## Roles (minimum)

| Role | What they do | What they must not do |
| --- | --- | --- |
| **Bench tech** | Run analyzers, see results in Bench Review, soft-check, escalate criticals | Finalize / release to the doctor |
| **Authorizer** (1–2 people) | Review pending results, sign off / release, respond to STAT critical alerts | N/A — they are the release gate |
| **Reception / phleb** | Register specimens via patient picker (MRN) or provisional local patient create; labels; confirm suspect identities when prompted | Release results |
| **Doctor / external** (later) | Receive **released** reports only | See `pending_review` results |

Exact role names can map to Supabase Auth + RLS later (`tech`, `authorizer`, `admin`).

---

## Core rule: one cloud database, status — not two databases

**Do not** invent a separate “holding” Supabase project/DB and a “final” DB.

Sync results to cloud **early**, on the **same** tables, with a clinical status:

| Status | Meaning |
| --- | --- |
| `pending_review` | Instrument (or tech) produced data; not yet authorized for the doctor |
| `released` | Authorizer signed off; eligible for doctor / report / EMR |
| `amended` / `cancelled` (later) | Corrected or voided after release — full audit |

**Edge SQLite keeps local copies** after sync (outbox goes `acked`; clinical rows remain). Local Bench Review keeps working offline.

```
Machine → Edge SQLite (always)
            ↓ outbox push
         Cloud Nest API → Supabase (same rows, status=pending_review)
            ↓
         Authorizer releases → status=released (+ releasedBy, releasedAt)
            ↓
         Doctor / PDF / EMR only consume released
```

### Why sync before sign-off

- Authorizer may not sit at the mini PC (office, remote, second site).
- Mini PC failure must not strand unreleased results only on local disk.
- Product path: multi-lab cloud review from day one of this feature.

---

## Bench Review (“gallery”)

The **Bench Review** screen is the tech’s day board:

- Live list of today’s accessions / results (edge Socket.IO + cloud query).
- Filters: instrument, pending vs released, flagged/critical, accession search.
- Tech can open a result, review analytically, add tech notes (later).
- Tech **cannot** flip status to `released`.

This is the “gallery of tests for the day” described with the lab team.

---

## Release / authorization flow

1. Result arrives from analyzer → stored on edge as `pending_review` (or equivalent).
2. Outbox syncs to cloud with the same status (when online).
3. Authorizer sees it in a **Release queue** (cloud LIS), sorted with STAT/critical first.
4. Authorizer reviews → **Release** (e-sign / password re-auth later).
5. Persist audit: `releasedBy`, `releasedAt`, optional comment.
6. Only then: doctor-facing report, printouts marked final, future EMR outbound.

**Critical ≠ auto-release.** Urgency escalates notification; it does **not** skip the authorizer.

---

## Critical / panic-value escalation (STAT)

When a result is life-threatening (e.g. extreme potassium):

### Detection

- **Automatic:** compare value to configurable critical low/high per test code (reference/critical tables).
- **Manual:** tech taps **Escalate / STAT alert** on Bench Review if something looks wrong even when not auto-flagged.

### Effect

- Result marked `urgency: stat` (and/or `flag: critical_*`), `escalatedAt`, `escalatedBy`.
- Sync that state to cloud immediately (priority outbox if we add priorities later).
- **High-urgency notifications** to all users with the authorizer role:
  - In-app (cloud sign-in: badge, queue pin, optional sound)
  - Email (required for v1 of this feature)
  - SMS / WhatsApp — optional later

### Notification intent (example)

> **STAT critical K+ — release required**  
> Accession DH… / Patient … / Value …  
> Open Release queue now.

Authorizer still must open, review, and **release** before the doctor path.

### Audit

Log: who escalated, who was notified, notification channels, who released, timestamps. Labs will ask for this.

---

## Data model sketch (implement soon)

On **Result** (edge + cloud):

- `status`: `pending_review` | `released` | …
- `flag`: `normal` | `low` | `high` | `critical_low` | `critical_high` | …
- `urgency`: `routine` | `stat`
- `escalatedAt`, `escalatedBy` (optional)
- `releasedAt`, `releasedBy` (optional until released)
- `techNotes` (optional)

On **notifications** (cloud):

- `userId`, `type` (`release_pending` | `critical_stat`), `resultId`, `sentAt`, `channel` (`in_app` | `email`)

Critical ranges: admin-configurable table per `testCode` (lab-specific; Drax Hall values first).

---

## Nest / storage reminder (so we don’t confuse layers)

| Component | Role |
| --- | --- |
| `apps/edge-engine` | Bridge on mini PC — ingest, SQLite, outbox **push** |
| `apps/api` | Cloud Nest — receives pushes, writes Supabase, release APIs, trigger notifications |
| Supabase | **One** Postgres system of record (+ Auth) |
| `apps/web` | Bench Review (tech) + Release queue (authorizer) |

Edge does **not** write Supabase directly. Cloud Nest does not poll the mini PC; the edge **pushes** HTTPS JSON when online.

---

## Specimen registration identity (edge)

Reception uses the **patient picker** (local MRN registry). If the person is missing, they **register a provisional patient** (TEMP MRN) in the LIS, then accession — never free-text name-only specimens.

- Soft suspects (same name+DOB+sex, different MRNs) require a **blocking confirmation** before register; decision is audited on the specimen.
- Hard MRN conflicts are **quarantined** and not selectable.
- Provisional patients enqueue `patient.provisional_created` for later upstream registry sync.

Details: [IDENTITY.md](./IDENTITY.md).

---

## UX surfaces to build

1. **Bench Review** — tech gallery (edge-first, also cloud).
2. **Escalate STAT** control on a result row/detail.
3. **Release queue** — authorizer-only; STAT on top.
4. **Release / sign-off** action + audit display.
5. **Notification center** (in-app) for new results and critical/high flags; email for pending release and STAT — later.
6. **Doctor/report view** — filter `status === released` only (when reports land).

---

## Acceptance criteria (when this phase ships)

- [ ] Tech sees new analyzer results on Bench Review without being able to release.
- [ ] Result syncs to cloud as `pending_review` while still visible locally after `acked`.
- [ ] Only authorizer role can set `released`.
- [ ] Auto critical flag for at least one configured analyte (e.g. K+).
- [ ] Manual STAT escalate sends in-app + email to authorizers.
- [x] In-app notification center for incoming results (bell + critical toasts).
- [ ] STAT items sort above routine in Release queue.
- [ ] Released-only path is enforced for any doctor-facing output.
- [ ] Audit trail for escalate + release is queryable.
