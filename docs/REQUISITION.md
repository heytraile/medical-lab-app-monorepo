# Requisition & test catalog

DHMS-style ordering: panels from the [MedLab requisition form](https://draxhall.local) digitized into a cloud catalog, expanded at the counter, and linked to edge accession.

## Instrument vs manual fulfillment

Not every catalog test runs on the four bench analyzers. `@drax-lis/catalog` exposes `getFulfillment(code)`:

| Value | Meaning |
| --- | --- |
| `instrument` | Expected from Sysmex, Mindray, ProLyte, or iFlash when ordered |
| `manual` | Performed by tech (microscopy, ESR, blood bank, etc.) |
| `send_out` | Referral / external lab |

Machine output is **remapped** to request-form codes at ingestion (`packages/catalog/src/test-fulfillment.ts`). Plain-English reference: [MACHINE_TO_REQUEST_FORM.md](./MACHINE_TO_REQUEST_FORM.md).

## Flow (unified register)

1. Reception selects **patient** + **panels/tests** on Accession (`/accession`).
2. When signed in, cloud API creates a **requisition** with expanded `ordered_tests`.
3. Edge **accessions** the specimen (`POST /specimens`) with the same list + `requisitionId`.
4. Label prints; outbox syncs specimen to cloud as today.
5. Phlebotomy / bench read ordered work from specimen JSON or cloud requisition (`/orders?accession=`).

```text
Accession UI → POST /requisitions (cloud) → POST /specimens (edge) → PATCH /requisitions/:id/link
```

## Catalog

- **Source:** `packages/catalog/src/dhms-catalog.ts` + `dhms-catalog-items.ts` — full PDF page 1 individual tests (12 categories, ~180 items) and 38 panels.
- **Storage:** Supabase `test_catalog_items`, `test_panels`, `test_panel_members` (seeded on first `GET /catalog` when empty).
- **API:** `GET /catalog` (no auth) returns categories, items, panels with members.
- **Offline:** Web falls back to the bundled catalog package if cloud is unreachable.

## Individual test categories (PDF labels)

Blood Chemistry, Haematology, Endocrinology, Urine Chemistry, Immunology, Anaemia, Special Chemistry, Cardiac Enzymes, Bacteriology, Faeces / Miscellaneous, Drugs of Abuse, Therapeutic Drug.

Panels are ordered separately in the **Test Profiles & Panels** column.

## Specimen information

Accession captures the PDF **Specimen Information** block:

| Field | Storage |
| --- | --- |
| Specimen types (blood, urine, stool, other) | `requisitions.specimen_info` + edge `specimenType` (primary type) |
| Date & time collected | `specimen_info.collectedAt` + edge `collectedAt` — manual `datetime-local` or **Use now** (workstation clock) |
| Collected by | `specimen_info.collectedByStaffId` + display snapshot `collectedBy` — dropdown of active **phlebotomists** and **lab technologists** registered under **Staff** (admin) |

Staff are registered in `profiles` with a **job title** (what they do) separate from permission **role** (`tech`, `authorizer`, `admin`). Collectors API: `GET /lab/staff/collectors`.

## Panel expansion

`packages/catalog/src/expand-selection.ts`:

- Panel selection adds all member tests.
- Individual tests can be added on top.
- Deduplicate by normalized `code`.
- `sourcePanel` preserved for display ("CBC via Anaemia I").

## Requisition row

Table `requisitions`:

| Field | Purpose |
| --- | --- |
| `ordered_selections` | What the user clicked: `[{ kind, code }]` |
| `ordered_tests` | Expanded deduplicated `[{ code, name, sourcePanel? }]` |
| `accession_number` / `edge_specimen_id` | Linked after edge register |

## Roles

| Role | Accession | Orders lookup | Bench ordered list |
| --- | --- | --- | --- |
| tech | yes | yes | yes |
| authorizer | yes | yes | yes |

v1 uses **tech** for phlebotomy-style lookup; collectors are chosen by **job title** (`phlebotomist`, `lab_technologist`), not permission role. Admin manages staff at `/staff`.

## Fasting

Panels/tests with `fasting_required` or the **Hypertension** panel surface a fasting callout on Accession (10–14 hr per DHMS form).

## Multi-lab

Every catalog and requisition row has `lab_id`. v1 seeds one lab (Drax Hall). Staff `profiles.lab_id` defaults to that lab.

## Verification checklist

1. `GET /catalog` returns panels + items.
2. Anaemia I + ESR → no duplicate CBC.
3. Accession with sign-in → requisition in Supabase + specimen on edge.
4. Bench patient panel shows ordered tests.
5. `/orders?accession=DH…` shows the same list.

See also [GLOSSARY.md](./GLOSSARY.md) — Requisition, Test panel, Test catalog, Ordered vs received.
