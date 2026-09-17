# Data integrity — uniqueness, duplicates, offline, and order fidelity

How Drax LIS keeps **the right patient, the right tube, and the right result** — and what is *not* a duplicate.

**Related:** [IDENTITY.md](./IDENTITY.md), [REQUISITION.md](./REQUISITION.md), [WORKFLOW.md](./WORKFLOW.md), [SECURITY.md](./SECURITY.md), [GLOSSARY.md](./GLOSSARY.md).

---

## Three layers (do not mix them)

| Layer | ID staff use | Question |
| --- | --- | --- |
| Patient chart | **MRN** | Who is this person? |
| Visit / order | **Accession number** | Which lab encounter is this? |
| Physical tube | **Specimen ID** (barcode) | Which tube is this? |

There is **no staff-facing “request ID.”** A **requisition** is an internal cloud UUID for the digital order record. It is not printed on labels.

```text
Patient (MRN)
  └── Accession number (this visit — DH{YYYYMMDD}{####})
        └── Specimen IDs (DH…-01, -02, … — one label per tube)
```

A **session** in Labels/Orders is a UI grouping key, not a stored unique ID. Do not use it for integrity checks.

---

## Lab rules

1. Accession numbers are never reused. Same tests next year → **new accession**.
2. Specimen IDs are never reused. Every redraw gets new barcodes.
3. “Duplicate” means **the same encounter entered twice**, not the same panel ordered twice in a lifetime.
4. Repeats are normal. History is for context, not to block a new visit.
5. The accession UI **is** the doctor form. Paper forms are not OCR’d.
6. Labels always print **one per specimen ID**. Department consolidation only changes routing-line text.
7. Edge owns clinical operations when the internet is down. Cloud catches up via the outbox.

---

## Identifier uniqueness

| ID | Format | Enforced |
| --- | --- | --- |
| Accession | `DH{YYYYMMDD}{####}` | Unique on edge `Accession.accessionNumber`; counter increments **inside** the register transaction |
| Specimen ID | `{accession}-{NN}` | Unique on `Specimen.specimenNumber` |
| Barcode | Defaults to specimen ID | Unique on `Specimen.barcode` |
| MRN | Chart ID | Unique on `Patient.mrn` |

Caller-supplied accession numbers are rejected in production (`EDGE_HARDENING` or `NODE_ENV=production`) unless `EDGE_ALLOW_ACCESSION_OVERRIDE=true`.

---

## Duplicate vs repeat

| Scenario | Duplicate? | Behavior |
| --- | --- | --- |
| Same patient, same tests, **new visit later** | No | New accession + new specimen IDs |
| Same patient + overlapping tests **within ~48 hours** | Operational | Soft **409 `SIMILAR_ACCESSION_EXISTS`** — confirm to continue |
| Double-click Accession & Print | Accidental | Similar-accession warning + unique IDs if they proceed |
| Same requisition UUID already linked | Data bug | **409** — one requisition → one accession |
| Analyzer retransmit | No | Updates the existing result row |
| Unexpected instrument test (reflex) | Maybe | Stored, flagged, audited; not silently treated as ordered |

---

## Offline-first accession

```text
1. POST /specimens/batch  → edge (accession #, specimen IDs, labels)
2. Print immediately
3. Best-effort POST /requisitions + PATCH link (cloud) — does not block labels
4. Outbox specimen.registered → cloud upserts specimen + reconciles requisition
```

If cloud is down, staff still accession. When the network returns, sync creates or links the cloud requisition from `orderedSelections` if none exists for that accession number.

**Intentionally cloud-only** (must not block the bench): authorizer release, report email, lab-settings save, device enrollment.

---

## Order → result

| Path | Strictness |
| --- | --- |
| Manual entry | Hard reject if the test is not on the accession order |
| Instrument ingest | Remaps using **that tube’s** `orderedTestsJson` when the barcode matches a specimen; unexpected codes are stored, flagged, and audited |
| Submit for release | Blocks missing manual components unless acknowledged |
| Released accession | New instrument results ignored; manual entry blocked |

---

## Cloud vs edge tubes

Edge stores **N specimen rows** per accession. Cloud keeps one accession-level `specimens` row (release queue, reports) plus `containers` JSON for per-tube barcodes (`-01`, `-02`, …). Edge remains source of truth for print and ingest.

---

## Offline capability

| Workflow | Needs internet? | Notes |
| --- | --- | --- |
| Staff login (tech) | No | Edge JWT |
| Patient search/create | No | Provisional patients supported |
| Catalog / test picker | No* | Bundled fallback; banner when cloud routing is unreachable |
| Accession + print labels | No | Edge first; cloud requisition is best-effort |
| Bench / manual entry / ingest | No | Local SQLite |
| Submit for release | No | Authorizer queue waits for sync |
| Release / report email / lab settings save | Yes | Fail with a clear message; do not block the bench |

\*Degraded but functional.

---

## Audit

`clinical_audit_log` records identity confirmations (`identity.confirmed`), similar-accession overrides (`accession.similar_acknowledged`), and unexpected instrument results (`result.unexpected_on_order`). Accession History and Orders show identity confirmation and linked cloud order when present.

