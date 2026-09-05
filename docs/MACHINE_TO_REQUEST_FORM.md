# How machine results match the request form (remapping)

This document explains **in plain English** how we connect what the lab machines report back to what was ordered on the DHMS request form in the app. You can use it when explaining the system to staff, auditors, or future developers — without needing a software background.

For instrument basics, see [ANALYZERS.md](./ANALYZERS.md). For ordering flow, see [REQUISITION.md](./REQUISITION.md).

---

## The problem we are solving

When reception accession a patient, they pick tests from our **digital copy of the paper request form** — names like **CBC**, **CREATININE**, **ELECTROLYTES**, **TSH**, and so on. That list is the **order**.

When a machine finishes work, it does **not** send those same words. It sends **its own short codes** — things like **WBC**, **GLU**, **BUN**, **NA**, **TSH**. Those codes come from the machine vendor’s software, not from our PDF form.

So we have **two vocabularies**:

| Side | Who uses it | Example |
| --- | --- | --- |
| **Request form (order)** | Staff at accession, requisitions, labels | `CBC`, `UREA_BUN`, `ELECTROLYTES` |
| **Machine output (result)** | Sysmex, Mindray, ProLyte, iFlash | `WBC`, `BUN`, `NA`, `TSH` |

**Remapping** is the step where we say: *“When this machine sends code X, that corresponds to test Y on the request form.”* Without remapping, results and orders look unrelated even when they are the same test.

---

## Why we need remapping (real examples)

### Example 1 — Same test, different name

- **Ordered on form:** `CREATININE` (kidney function)
- **Mindray sends:** `CREA`

Same test. Different label. Remapping links `CREA` → `CREATININE`.

### Example 2 — One line on the form, several results from the machine

- **Ordered on form:** `CBC` (one checkbox)
- **Sysmex sends:** `WBC`, `RBC`, `HGB`, `HCT`, `PLT` (five separate results)

The form treats CBC as **one ordered item**. The machine reports **parts** of that panel. Remapping says: *“These five machine codes all belong to the CBC order.”*

### Example 3 — One line on the form, several results (electrolytes)

- **Ordered on form:** `ELECTROLYTES` (one line)
- **ProLyte sends:** sodium (`NA`), potassium (`K`), chloride (`CL`)

Remapping links those ions back to the single **ELECTROLYTES** line on the order.

### Example 4 — Tests that never come from these four machines

- **Ordered on form:** `PAP SMEAR`, `CULTURE & SENSITIVITY`, `URINALYSIS - COMPLETE`, `GROUP & Rh`

These are often done **by hand**, on a different bench, or at a reference lab. **No result message** will arrive from Sysmex, Mindray, ProLyte, or iFlash. That is **normal**. The order still exists; staff enter those results on **Bench Review** (patient focus panel → **Awaiting manual result** → **Enter result**).

---

## The end-to-end workflow (how it should work)

```text
1. ORDER          Staff pick tests on Accession (from PDF-based catalog)
       │
       ▼
2. STORE ORDER    Saved on the specimen / requisition
                  (what we expect to run)
       │
       ▼
3. RUN SAMPLE     Tube goes to the right machine(s)
       │
       ▼
4. MACHINE SENDS  Machine transmits its own codes + values
       │
       ▼
5. REMAP          System translates machine codes → request-form codes
       │
       ▼
6. MATCH          Compare remapped results to the order
                  • Expected — was ordered, machine reported it
                  • Manual pending — was ordered, no machine handles it
                  • Unexpected — machine reported something not on order
                    (sometimes OK, e.g. reflex testing)
       │
       ▼
7. BENCH / RELEASE  Staff review and authorizer releases
```

Today, steps **5 and 6 are only partly built**. Machines still send results, and we store them — but we do **not yet** consistently rename them to match the form or hide results that were not ordered. The plan below fixes that.

---

## What each machine outputs today (simulator / dev)

These are the codes our **development simulators** send. Real machines on site may use slightly different spellings; we will confirm against vendor manuals and adjust the remap table.

### Sysmex XS-1000i (blood cell counter)

**What it is for:** Complete blood count — counting blood cells.

**What it sends:**

| Machine code | Plain English |
| --- | --- |
| WBC | White blood cells |
| RBC | Red blood cells |
| HGB | Hemoglobin |
| HCT | Hematocrit |
| PLT | Platelets |

**Usually matches form items like:** `CBC`, and related haematology lines (not blood bank tests like `GROUP & Rh`).

---

### Mindray BS-240 (blood chemistry)

**What it is for:** Chemical tests in blood serum — sugar, kidney markers, liver enzymes, etc.

**What it sends (simulator today):**

| Machine code | Remaps to form code | Plain English |
| --- | --- | --- |
| GLU | `GLUCOSE_RAND` or similar glucose line | Blood sugar |
| BUN | `UREA_BUN` | Kidney waste marker |
| CREA | `CREATININE` | Kidney function |
| ALT | `ALT_SGPT` | Liver enzyme |
| AST | `AST_SGOT` | Liver enzyme |

Many other **blood chemistry** lines on the form (lipids, HbA1c, etc.) can run on this class of machine **if** that assay is installed — the exact menu must be confirmed at Drax Hall.

---

### Diamond ProLyte (electrolytes)

**What it is for:** Salts in blood — sodium, potassium, chloride; lithium on some setups.

**What it sends:**

| Machine code | Remaps to form code | Plain English |
| --- | --- | --- |
| NA | Part of `ELECTROLYTES` | Sodium |
| K | Part of `ELECTROLYTES` | Potassium |
| CL | Part of `ELECTROLYTES` | Chloride |
| LI | `LITHIUM` (therapeutic drug monitoring) | Lithium |

---

### YHLO iFlash 1200 (immunoassay)

**What it is for:** Hormones, antibodies, and similar tests that need immunoassay chemistry.

**What it sends (simulator today):**

| Machine code | Remaps to form code | Plain English |
| --- | --- | --- |
| TSH | `TSH` | Thyroid stimulating hormone |

On a real lab, this machine also runs many **endocrinology** and **immunology** lines from the form (FSH, LH, HIV screen, etc.) — each needs its own row in the remap table once we know the exact codes the iFlash uses.

---

## Which form tests are **not** from these four machines

Rough guide based on the PDF catalog and how hospital labs usually work. **Confirm with the lab director** before treating this as final policy.

| Form section | Typical handling | Examples |
| --- | --- | --- |
| **Bacteriology** | Manual culture / microscopy | Gram stain, culture & sensitivity |
| **Faeces / miscellaneous** | Manual | Stool ova & parasites, Pap smear, semen analysis |
| **Many urine tests** | Manual bench or urine strip / separate analyzer | 24-hour urine collections, many chemistry-on-urine tests |
| **Blood bank** | Manual / blood bank system | Group & Rh, cross match |
| **Some anaemia tests** | Manual or special bench | Sickle test, Coombs, G6PD, haemoglobin electrophoresis |
| **Electrophoresis panels** | Different equipment | Protein electrophoresis, lipoprotein electrophoresis |
| **Some special chemistry** | Send-out or manual | Blood lead, some tumour markers |

**About 100 of the 168 individual tests on the form** fall into manual, send-out, or “other equipment” categories. The app should **not** expect a machine message for every line on the form.

---

## Why we chose this direction

1. **One source of truth for orders**  
   Staff already order using the PDF-based catalog. Results should **speak the same language** on Bench, release, and reports.

2. **Machines will never match the form word-for-word**  
   Vendors standardize on their own codes. Remapping is industry-normal for any lab computer system (LIS).

3. **Panels vs parts**  
   The form often has **one line** (CBC, ELECTROLYTES, LIPIDS) while machines report **components**. Remapping must understand both “whole panel ordered” and “piece came back.”

4. **Only run what was ordered (in demo and eventually production)**  
   Today our simulators blast every machine’s demo results every 30 seconds **whether or not** that test was ordered — confusing for training. We will tie simulators to the actual order so behaviour matches real life.

5. **Clear status for manual work**  
   Ordered tests with no machine should show as **“awaiting manual result”**, not look like something is broken.

6. **Room to grow**  
   A written remap table can be updated when Drax Hall adds an assay, buys a new machine, or sends a test to a reference lab — without rewriting the whole app.

---

## The remap table (concept)

We will maintain a **lookup table** (in the catalog package) that answers:

- For each **form test code**: Which machine (if any) runs it? What **machine codes** come back?
- For each **machine code** from a given machine: Which **form test code(s)** does it satisfy?

Examples (draft — subject to lab sign-off):

| Form code (order) | Machine | Machine output codes |
| --- | --- | --- |
| CBC | Sysmex | WBC, RBC, HGB, HCT, PLT |
| CREATININE | Mindray | CREA |
| UREA_BUN | Mindray | BUN |
| ELECTROLYTES | ProLyte | NA, K, CL |
| TSH | iFlash | TSH |
| PAP SMEAR | *(none — manual)* | — |

When a result arrives, the system uses this table to **rename for display** and to **check** whether that result was expected on the order.

---

## What is built today vs what is planned

| Capability | Today | Planned |
| --- | --- | --- |
| Order tests from PDF catalog on Accession | Yes | — |
| Machines send results to Bench | Yes | — |
| Remap machine codes → form codes | Yes | — |
| Simulators only send ordered tests | Yes | — |
| Show “manual test pending” on order | Yes (Bench patient panel) | — |
| Manual result entry for non-instrument tests | Yes (`POST /results/manual`, `analyzerId: manual`) | — |
| Flag unexpected machine results | Partial (`expectedOnOrder` on list) | Stronger Bench UX |

---

## Questions to confirm with the lab (before final remap)

1. Which **Mindray** tests are actually on the menu at Drax Hall? (Lipids? HbA1c? Full liver panel?)
2. Is **ESR** or **reticulocyte** on Sysmex or done manually?
3. How is **urinalysis** done — dip stick, microscope, separate urine analyzer?
4. Which **immunology** and **drug screen** tests run on iFlash vs send-out?
5. For any ambiguous form line, is it **machine**, **manual**, or **reference lab**?

Until confirmed, we mark uncertain lines as **manual** in the table rather than guess.

---

## How to explain this in one minute

> “The request form uses our lab’s test names. The machines use the manufacturer’s shorthand. We built a **remap table** that translates machine output into the same names as the form, so staff see one consistent story from order to result. Not every form test comes from our four analyzers — cultures, Pap smears, and many urine tests are manual — and that’s expected. The system will show those as still pending instead of pretending a machine will send them.”

---

## Related documents

- [ANALYZERS.md](./ANALYZERS.md) — what each machine does, ports, scanners
- [REQUISITION.md](./REQUISITION.md) — ordering and accession flow
- [GLOSSARY.md](./GLOSSARY.md) — test abbreviations
- [DATABASES_AND_COMMANDS.md](./DATABASES_AND_COMMANDS.md) — where orders and results are stored

**Implementation plan (for the dev team):** [plans/analyzer-catalog-alignment.md](./plans/analyzer-catalog-alignment.md)
