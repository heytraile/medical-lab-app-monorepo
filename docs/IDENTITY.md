# Patient identity hygiene (edge)

Local patient registry for Drax Hall edge. **Not FHIR yet** — identity is MRN-backed. Upstream registry may be messy; we keep **our** SQLite clean. Specimens always link to a `patientId` (no free-text walk-in).

## Goals

- Prefer **picker by MRN** over inventing demographics at accession time.
- If the person is not on file (or registry is offline), **create a provisional local patient** with a TEMP MRN, then accession.
- Never silently merge people.
- Quarantine hard identity conflicts so they are not selectable.
- Force a human decision when demographics collide across MRNs.

## Import rules (upstream → local)

Upstream records upsert by **normalized MRN** (trim, upper-case, strip spaces/`._-`).

| Situation | Local behavior |
| --- | --- |
| New MRN | Create `status=active`, `identityOrigin=upstream`, `syncStatus=n_a` |
| Same MRN, compatible demographics | Update fields; set `active` |
| Same MRN, incompatible name/DOB/sex | Set row `status=quarantined` — **not selectable** in Register |
| Same first+middle+last+DOB+sex, **different** MRNs | Soft **suspect group** (`suspectGroupId` shared); still selectable |

Fixture: [`apps/edge-engine/fixtures/patients-messy.json`](../apps/edge-engine/fixtures/patients-messy.json)

Seed runs automatically when the Patient table is empty. Re-run: `POST /patients/seed`.

## Provisional local create

When reception cannot find the patient:

1. `POST /patients` with demographics → allocates normalized MRN like `TEMP202608261234` (from `TEMP-YYYYMMDD-####`).
2. Sets `identityOrigin=local_provisional`, `syncStatus=pending_upstream`, `source=local_provisional`.
3. Enqueues outbox event `patient.provisional_created` (same drain path as specimens) for **future** push into their registry app.
4. Returns the patient for immediate specimen registration.

**Later (not built yet):** upstream assigns a real MRN; edge reconciles local row (`externalId` / MRN swap, `syncStatus=synced`). No reconcile UI this pass.

## Register gate

Happy path: `POST /specimens` with **required** `patientId`.

If the patient is in a suspect group with other active MRNs and the body has **no** valid `identityConfirmation`:

- HTTP **409**
- `error: "IDENTITY_CONFIRMATION_REQUIRED"`
- Includes selected patient + sibling MRNs

Allowed decisions (audited on `Specimen.identityConfirmationJson`):

- `distinct_people` — proceed with chosen MRN (selected or switched sibling)
- `possible_duplicate_acknowledged` — proceed with chosen MRN **and** upsert a pending **Identity review** queue item (`IdentityReviewItem`) for Patients → Identity review

Accession UI: continue with selected, switch to a sibling, or cancel; optional **Flag as possible duplicate** checkbox. **No chart merge from Accession.**

Quarantined patients → **400**, cannot register.

## Identity review + merge (Patients)

- `GET /patients/identity-reviews` — pending (default) / resolved / merged queue
- `POST /patients/identity-reviews/:id/resolve-distinct` — **admin**; clear pending without merge
- `POST /patients/merge` — **admin**; body `{ survivorPatientId, loserPatientId, reviewItemId?, reason? }`
  - Re-points `Specimen.patientId` loser → survivor
  - Quarantines loser (keeps MRN row); recomputes suspect groups
  - Outbox `patient.merged` for cloud projector
  - Does **not** rewrite historical `patientJson` / confirmation snapshots

UI: Patients page tabs **Registry | Identity review**.

## APIs

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/patients?q=` | Active patients (default); `includeQuarantined=true` optional |
| `POST` | `/patients` | Create provisional patient |
| `GET` | `/patients/:id` | One patient (+ suspect siblings when listed) |
| `GET` | `/patients/identity-reviews` | Flagged possible-duplicate queue |
| `POST` | `/patients/identity-reviews/:id/resolve-distinct` | Admin: mark distinct |
| `POST` | `/patients/merge` | Admin: merge charts |
| `POST` | `/patients/seed` | Re-import messy fixture |
| `POST` | `/specimens` | **Requires** `patientId` + optional `identityConfirmation` |

## UI

Register → single patient search. Select a hit, or **Register new patient** (provisional TEMP MRN). Suspect patients still open a **blocking** confirmation dialog before specimen register (choose chart; optional flag for review).

Patients → **Identity review** tab: open detail, mark distinct, or **Merge charts** (admin).

## Later

- Live push to their registry / FHIR
- Automatic MRN reconcile when upstream replies
- Formal identity officer workflow for quarantine resolution beyond merge/distinct
