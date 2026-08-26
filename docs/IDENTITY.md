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

- `distinct_people` — tech asserts different people; proceed with selected MRN
- `possible_duplicate_acknowledged` — possible duplicate; still proceed with selected MRN (no auto-merge)

Quarantined patients → **400**, cannot register.

## APIs

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/patients?q=` | Active patients (default); `includeQuarantined=true` optional |
| `POST` | `/patients` | Create provisional patient |
| `GET` | `/patients/:id` | One patient (+ suspect siblings when listed) |
| `POST` | `/patients/seed` | Re-import messy fixture |
| `POST` | `/specimens` | **Requires** `patientId` + optional `identityConfirmation` |

## UI

Register → single patient search. Select a hit, or **Register new patient** (provisional TEMP MRN). Suspect patients still open a **blocking** confirmation dialog before specimen register.

## Later

- Live push to their registry / FHIR
- Automatic MRN reconcile when upstream replies
- Cloud patient table + merge tooling
- Formal identity officer workflow for quarantine resolution
