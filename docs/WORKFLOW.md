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
| **Reception / phleb** | Accession specimens via patient picker (MRN); register new patients on **Patients**; labels; confirm suspect identities when prompted | Release results |
| **Doctor / external** (later) | Receive **released** reports only | See `pending_review` results |

Exact role names can map to Supabase Auth + RLS later (`tech`, `authorizer`, `admin`).

---

## Core rule: one cloud database, status — not two databases

**Do not** invent a separate “holding” Supabase project/DB and a “final” DB.

Sync results to cloud **early**, on the **same** tables, with a clinical status:

| Status | Meaning |
| --- | --- |
| `pending_review` | Instrument (or tech) produced data; not yet submitted for authorization |
| `pending_authorization` | Bench tech submitted; awaiting authorizer sign-off |
| `released` | Authorizer signed off; eligible for doctor / report / EMR |
| `amended` / `cancelled` (later) | Corrected or voided after release — full audit |

**Edge SQLite keeps local copies** after sync (outbox goes `acked`; clinical rows remain). Local Bench Review keeps working offline.

```
Machine → Edge SQLite (always)
            ↓ outbox push
         Cloud Nest API → Supabase (same rows, status=pending_review)
            ↓
         Bench tech submits for release → pending_authorization (+ audit)
            ↓
         Authorizer releases → status=released (+ releasedBy, releasedAt, audit)
            ↓
         Doctor / PDF / email only consume released
```

### Submit vs notify

| Action | Effect |
| --- | --- |
| **Submit for release** (Bench) | Moves results to `pending_authorization`, enqueues sync event, audit trail |
| **Notify authorizer** (Bench) | Creates a review-request alert only — does **not** submit results |

See [AUDIT.md](./AUDIT.md) for immutable audit log details.

### Patient report export (PDF / JSON)

After release, staff can export a **patient report** from:

- **Bench** → patient focus panel → **Export report**
- **Patients** → patient detail dialog → **Export report**

The export reads **released results only** from cloud (`GET /cloud/patients/:edgePatientId/report`). Formats:

| Format | Notes |
| --- | --- |
| PDF (Letter 8.5×11) | Branded header, logo placeholder, patient block, results by accession |
| PDF (Legal 8.5×14) | Same layout, taller page |
| JSON | Same payload as the API — for integrations / archival |
| Email | JSON attachment via cloud API — choose **Email to doctor** or **Email to patient**; sender name, job title, and short reference included automatically. **Production uses [Resend](./EMAIL.md)**; local dev uses [Mailpit](http://127.0.0.1:54324) |

Requires sign-in (cloud JWT). Lab branding (address, phone, logo URL) lives in `labs.settings.report` — seeded for Drax Hall in [`supabase/seed.sql`](../supabase/seed.sql).

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

### Manual / visual tests (non-instrument)

Not every ordered test comes from the four bench analyzers. The catalog assigns each order line an explicit `instrument_only`, `manual_only`, `hybrid`, or `send_out` requirement. Hybrid tests can require named manual observations in addition to an equipment-produced portion.

These assignments are **provisional** until Drax Hall confirms them against the installed analyzer menus and bench SOPs. The review checklist is [TEST_RESULT_REQUIREMENTS.md](./TEST_RESULT_REQUIREMENTS.md); laboratory SOP always overrides a general default.

When a patient is opened on Bench:

1. **Ordered tests** lists everything on the requisition (with **Manual** / **Send-out** badges at accession and on Bench).
2. **Awaiting manual result** lists every required manual component that does not yet have a result row.
3. The tech taps **Enter result**, types the observed value (numeric or qualitative), optional units/flag, and saves.
4. The result is stored with `analyzerId: manual` and status `pending_review` — same submit → authorize → release path as machine results.

Mixed accessions are normal: e.g. **CREATININE** from Mindray plus **ESR** and **GROUP_RH** entered manually. A hybrid test can show its automated portion as complete while a named visual component remains pending.

If manual components are missing, **Submit for release** first shows a warning with the exact tests. The tech can return to data entry or choose **Submit anyway**. The edge API recalculates completeness and requires that explicit acknowledgment. The release queue then shows **Incomplete order** and the same point-in-time missing-component list so the authorizer can release or **Return to bench**.

Accession shows **Manual** / **Send-out** badges on individual tests and panel members so staff know at order time which lines will not auto-populate from analyzers.

---

## Release / authorization flow

1. Result arrives from analyzer **or** tech enters a manual result → stored on edge as `pending_review`.
2. Bench tech reviews on **Bench** → **Submit for release**. Missing manual components require an explicit **Submit anyway** acknowledgment → `pending_authorization` (+ audit).
3. Outbox syncs submit event to cloud; authorizer opens **Release queue** (`GET /cloud/release-queue`).
4. **While awaiting authorization** (before release):
   - **Tech recall** (Bench): returns accession to `pending_review` — removes from release queue; tech can fix and re-submit.
   - **Authorizer return to bench** (Release queue): same state transition; optional reason recorded in audit.
5. **Authorization queue** tab — grouped by **patient + accession**. Each group shows:
   - Patient name, MRN, DOB/sex
   - Accession number
   - **Submitted by** (bench tech) and submitted time
   - **Accessioned by** (phleb/reception) when signed in at accession
   - Expandable read-only test list (one row per analyte — normal LIS storage)
   - **One Release button per accession** — authorizer signs off the whole requisition at once
   - **Return to bench** — sends the accession back to the tech (confirmation required)
   - **Incomplete order** warning — lists manual/hybrid components missing when the tech submitted
6. Authorizer releases → all pending results on that accession move to `released`; audit: `result.accession_released` with result IDs. The accession **stays in the release queue** on the **Ready to send** tab (clinical release ≠ leaving the queue).
7. **Ready to send** tab — released accessions remain until dismissed:
   - **Send report** menu — same PDF (Letter/Legal), JSON download, and email to doctor/patient as Bench patient panel (`PatientReportExportMenu`)
   - **Remove from queue** — hides the accession from Ready to send; results stay `released`
   - **Clear queue** — dismiss all released rows at once (confirmation required)
8. Dismissal is tracked on cloud `specimens.release_queue_dismissed_at` — it does not undo release. Recall/return to bench resets dismiss so a re-submitted accession can re-enter the queue normally.

**After release:** recall/return is not available — use amend/correct workflow (future). Bench mirrors cloud release on edge (`POST /results/mark-released` after authorizer release): the group shows a **Released** badge, submit/recall are hidden, and the **Released** tab lists completed accessions. Authorizers can send reports from **Ready to send** without opening Bench.

**Report scope:** export/email is **patient-scoped** (all released results for that patient), same as Bench — not limited to a single accession row.

**Storage vs authorization:** the cloud database stores **one row per analyte** (WBC, HGB, etc.) because analyzers emit per-test results. **Authorization is per accession** — one sign-off covers every test on that request form. **Recall and return are also per accession.**

Groups sort with critical/STAT flags first, then newest submit time.

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
