# Lab routing departments

How the app decides **how many tubes / labels** to print and which **routing line** appears on each label.

---

## Two layers

| Layer | Stored on | Purpose |
| --- | --- | --- |
| **Catalog category** | Each test in `test_catalog_items.category` | Fixed taxonomy (12 keys). Used for requisition tabs, fulfillment, and reporting. |
| **Routing policy** | `labs.settings.routing` | Per-lab: separate accession vs label grouping. |

```text
test.category (granular, fixed)
  → labs.settings.routing (accession + labels scopes)
  → N specimen rows in DB (accession scope)
  → N labels printed (one per specimen ID)
  → consolidated routing text on each label (labels scope)
```

---

## Routing policy

```json
{
  "consolidated": { "mode": "consolidated", "splitByCollectionType": true, "departments": [...] },
  "accession": { "mode": "granular" },
  "labels": { "mode": "consolidated", "splitByCollectionType": true }
}
```

| Scope | Default (Drax Hall) | Effect |
| --- | --- | --- |
| **Accession** | Granular | Specimen info + register batch match the lab form (12 categories). |
| **Labels** | Consolidated | Same label count as specimens; routing line shows short dept (`Chem · Bld · DOB`). |
| **Requisition tabs** | Always granular | `catalogCategories` — never consolidated in the test picker. |

Configure in **Admin → Lab settings** (`/settings`) or `labs.settings.routing` in Supabase.

---

## Consolidated departments (Drax Hall)

| Routing key | Label | Short | Catalog categories |
| --- | --- | --- | --- |
| `hematology` | Hematology | Hema | `haematology`, `anaemia` |
| `chemistry` | Chemistry | Chem | blood/urine chemistry, enzymes, endo, immuno, special chem, DOA, TDM |
| `microbiology` | Microbiology | Micro B | `bacteriology`, `faeces_misc` |

---

## Label output

| Field | Source |
| --- | --- |
| Routing line | `{labelShort} · {collectionShort} · {DOB}` when split-by-collection is on |
| Test lines | Abbreviated per-tube test codes, wrapped 1–3 lines |
| Granular category → consolidated short | `resolveRoutingDepartment(category, labelRouting)` |

Shared builder: `buildSpecimenLabelInput()` in `packages/catalog/src/specimen-label-input.ts`.

Label count: **one ZPL job per specimen ID**. `groupSpecimensForLabelPrint()` maps each DB row to one print entry; consolidated labels scope only affects routing-line shorthand via `resolveRoutingDepartment(catalogCategory, labelRouting)`.

---

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /catalog` | `catalogCategories`, `accessionRouting`, `labelRouting`, `routingPolicy` |
| `GET /labs/settings` | Admin: current routing policy |
| `PATCH /labs/settings/routing` | Admin: update accession/labels scope toggles |

---

## Related docs

- [SPECIMEN_COLLECTION_GUIDE.md](./SPECIMEN_COLLECTION_GUIDE.md)
- [REQUISITION.md](./REQUISITION.md)
- [GLOSSARY.md](./GLOSSARY.md)
