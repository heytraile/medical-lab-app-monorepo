# Specimen collection guide (plain English)

**Who this is for:** Anyone working at the front desk, accession bench, draw station, or analyzer workstation who is **not** a doctor or nurse — reception, phlebotomy trainees, IT, admin.

**Why it exists:** Different tests need different **physical samples** (specimens). If you put the wrong test on the wrong tube, the lab cannot run it — or the result is wrong. This guide explains **what you collect**, **how our app labels and tracks tubes**, and **how scanning at the machines ties back to the right patient and order**.

---

## The big idea in one sentence

**A specimen is whatever you actually collect from the patient** (blood in a tube, urine in a cup, etc.) **so the lab can run the ordered tests** — and our app tracks each tube with a **specimen ID** while keeping every tube from the same doctor form under one **accession number**.

---

## Quick reference — specimen types

| Specimen | Plain English | Usually drawn as | Common tube / container | In our catalog? |
| --- | --- | --- | --- | --- |
| **Whole blood** | Blood with all cells and liquid still mixed | Needle → blood flows into tube | Lavender (purple), light blue, red (depends on test) | Yes — `blood` |
| **Serum** | The **clear yellow liquid** left after blood clots and is spun | Needle → special tube → clot → centrifuge | Gold / red “tiger top” (SST), plain red | Yes — `serum` |
| **Urine** | Pee | Patient urinates into cup (or 24 h jug) | Sterile urine cup / 24 h container | Yes — `urine` |
| **Stool** | Poop | Patient passes stool into hat or container | Stool cup with spoon | In app as `stool` (future tests) |
| **Other** | Swabs, fluid, tissue, etc. | Varies by test | Swab kit, sterile jar | In app as `other` |

---

## Three numbers you must understand

Our app uses **three different identifiers**. They are not interchangeable.

| ID | What it means | Example | Where you see it |
| --- | --- | --- | --- |
| **MRN** | Patient chart number (stable for life of chart) | `MRN7001` | Patient registry, label beside name |
| **Accession number** | **One doctor form / one visit** — every tube from that form shares this | `DH202609100001` | Top line on every label; Bench groups results here |
| **Specimen ID** | **One physical tube** — unique barcode for that container | `DH202609100001-01` | Second line on label; **Code 128 barcode** on the tube |

```text
Patient (MRN7001)
  └── Accession DH202609100001  ← one requisition / one form
        ├── Specimen DH202609100001-01  ← Haematology tube (e.g. CBC)
        ├── Specimen DH202609100001-02  ← Blood Chemistry tube
        └── Specimen DH202609100001-03  ← Urine cup
```

**Important:** We no longer give each tube its own accession number. One form → **one accession** → **one or more specimen IDs** (one label per **routing department**).

At Drax Hall, routing departments are **Hematology**, **Chemistry**, and **Microbiology**. Chemistry may split again by collection type (blood vs urine), so an Executive-style order can produce three or four labels under one accession. Each label lists abbreviated test codes for **that tube only**. See [ROUTING_DEPARTMENTS.md](./ROUTING_DEPARTMENTS.md).

More detail: [REQUISITION.md](./REQUISITION.md) (identifiers section).

---

## Whole blood (`blood`)

### What is it?

Blood **as it comes out of the vein**, with **red cells, white cells, platelets, and plasma** all still together. Nothing has been spun or separated yet.

### What is it used for?

Tests that need to **count or look at the cells**, or need **whole blood chemistry**:

- **CBC** (complete blood count) — how many red/white cells, platelets, etc.
- **ESR**, **Hb / PCV**, **platelets**, **PT/INR**, **PTT** — bleeding/clotting and blood disorders
- **Blood type**, **cross-match** — transfusion work
- Many **haematology** tests in our catalog

### How do you collect it?

1. Identify the patient (name, DOB, order).
2. Wash hands, gloves, tourniquet above the draw site.
3. Clean the skin (alcohol), let it dry.
4. Insert needle, attach tube(s) that the order requires.
5. Fill tube to the line, **mix gently** if the tube requires it (lavender tubes for CBC must be inverted 8–10 times — don’t shake hard).
6. Release tourniquet, remove needle, pressure + bandage.
7. Apply the **printed label from Accession** at the bedside (or immediately after).

### Tube colors (typical — always follow your lab’s SOP)

| Color | Additive | Often used for |
| --- | --- | --- |
| **Lavender / purple** | EDTA | CBC, blood smears |
| **Light blue** | Citrate | Coagulation (PT, PTT) |
| **Red** (no gel) | None | Some chemistry if lab accepts whole blood |
| **Green** | Heparin | Some chemistry / blood gas (site-specific) |

### Common mistakes

- Under-filling a tube (especially light blue for coag).
- Not mixing EDTA tube → CBC can be wrong.
- Using serum tube when the order needs **whole blood** (CBC on a gold top = problem).

---

## Serum (`serum`)

### What is it?

**Serum is the yellowish liquid part of blood *after* the blood has clotted and the solid clot has been removed.**

1. You draw blood into a tube.
2. The blood **clots** (thickens) in the tube.
3. The tube goes in a **centrifuge** (spin machine).
4. The heavy cells and clot pack at the bottom.
5. The **clear/yellow liquid on top** = **serum**.

**Serum is NOT the same as whole blood.**  
**Serum is NOT the same as plasma** (plasma is the liquid *before* clotting).

### What is it used for?

Most **blood chemistry**, **hormones**, and **immunology** in our catalog, for example:

- **Glucose**, **creatinine**, **electrolytes**, **liver enzymes** (ALT, AST), **lipids/cholesterol**
- **TSH**, **PSA**, **pregnancy blood tests** (BHCG)
- **HIV**, **hepatitis**, **RA**, **CRP**, and many other **antibody** tests

### How do you collect it?

1. Same vein draw as blood — patient experience is identical (“they’re taking my blood”).
2. Use the tube type your lab specifies for serum — usually **gold/tiger top (SST)** or **plain red**.
3. Fill to the line, invert gently if required.
4. Let clot and **centrifuge** per lab SOP.
5. Label with the app’s **department label** (e.g. Blood Chemistry, Immunology) — specimen ID on barcode.

### Why separate tubes for CBC vs chemistry?

Machines that run **CBC** need **cells intact in EDTA**.  
Machines that run **chemistry** need **cell-free liquid** (serum).  
If you mix them on one tube type, **one side of the order loses**.

In our app, **CBC + creatinine** on one order → often **two labels** (Haematology + Blood Chemistry), **same accession**, **two specimen IDs**.

### Common mistakes

- Running chemistry on lavender EDTA blood (many chem analyzers reject it).
- Hemolysis from rough handling.
- Delaying centrifuge too long on some orders.

---

## Urine (`urine`)

### What is it?

**Urine** — fluid filtered by the kidneys. Collected from the patient urinating into a container.

### What is it used for?

- **Urinalysis (UA)** — infection, blood in urine, sugar, protein, etc.
- **Pregnancy test (urine)** — BHCG in urine
- **24-hour** collections — total protein, creatinine clearance
- **Microalbumin** — kidney damage screening

### How do you collect it?

**Random / clean-catch (most common for UA):**

1. Give patient a **clean cup** and instructions.
2. **Clean-catch:** clean genital area, start urinating, mid-stream into cup.
3. Cap tightly; note **collection time** on Accession (Specimen Information).
4. Label with printed specimen ID.

**24-hour urine:** follow lab SOP for discard void, collection window, and volume.

### Common mistakes

- Unlabeled cup (never acceptable).
- Bacterial contamination from non clean-catch when culture is ordered.
- Wrong 24 h start/stop.

---

## Stool (`stool`) and other specimens

See prior sections in lab SOP. Our app uses `stool` and `other` when tests do not fit standard blood/urine buckets. Collection is manual; **no analyzer feed** for most of these.

---

## How accession works in our app

When you select tests on the **Accession** page (`/accession`):

1. Staff pick **patient** + **panels/tests** from the digital request form catalog.
2. The app groups tests by **lab department** (Haematology, Blood Chemistry, Immunology, Urine Chemistry, etc.) — not by “serum vs blood” alone.
3. **One accession number** is assigned for the whole form (e.g. `DH202609100001`).
4. **One label per department** that needs a separate tube → each gets a **specimen ID** (`-01`, `-02`, …).
5. Each label shows:
   - Accession number (top)
   - Specimen ID (second line)
   - Patient name · MRN
   - Department · DOB
   - **Code 128 barcode = specimen ID**
6. If signed in, a **cloud requisition** is created and linked; edge stores the specimen and **syncs to Supabase** via the outbox.

**Example order:** CBC + creatinine + TSH + urinalysis

| Label | Specimen ID | Department | Tests on this tube (examples) |
| --- | --- | --- | --- |
| 1 | `DH202609100001-01` | Haematology | CBC |
| 2 | `DH202609100001-02` | Blood Chemistry | Creatinine |
| 3 | `DH202609100001-03` | Immunology | TSH |
| 4 | `DH202609100001-04` | Urine Chemistry | Urinalysis |

**One patient. One accession. Four specimen IDs. Four physical containers.**

Phlebotomy may draw **one lavender + one gold + urine cup** — route each labeled tube to the correct bench.

---

## Scanning — two different places

### 1) Accession desk (our web app)

| What you scan | Scanner | Purpose |
| --- | --- | --- |
| Patient **MRN** barcode | Honeywell USB wedge ([HARDWARE.md](./HARDWARE.md)) | Pull up patient chart quickly |
| (Optional) Typed accession / specimen ID | Keyboard or wedge | Find prior work on Labels, Orders, Bench search |

You **do not** scan the tube at accession unless you are reprinting a label on the **Labels** page.

### 2) Analyzer workstation (Sysmex IPU, Mindray PC, iFlash, ProLyte)

Each instrument line has its **own software PC** (or loader with a barcode reader). Staff **scan or type the sample ID** to tell that machine **which tube this is** before or when results are sent to the lab computer.

**What ID should be scanned at the machine?**

| On the printed label | What the barcode encodes | What many sites type/scan at the analyzer |
| --- | --- | --- |
| Specimen ID (e.g. `DH202609100001-01`) | **Specimen ID** — preferred, unique per tube | Same specimen ID if the scanner reads the tube label |
| Accession line (e.g. `DH202609100001`) | Not in the barcode — shown for humans | **Accession number** — still works; our edge accepts it |

**How our app handles both:**

When a machine sends results, the **edge engine** looks up the scanned ID in this order:

1. **Specimen ID / tube barcode** (`DH202609100001-01`) → finds the tube, parent accession, **and tests ordered for that department**
2. **Accession number** (`DH202609100001`) → finds the whole visit, **all tests on the form**
3. If neither exists yet → results still store under that ID, but Bench may show **“—”** for patient until the specimen is registered

So in daily practice: **machines often receive the accession number** (especially if staff type from the top line of the label), and that is **supported**. The **barcode on the tube** is the **specimen ID** for precise tube-level tracking.

---

## How results get from the machine to the patient on Bench

End-to-end path (same in dev and production):

```text
 1. REGISTER     Accession → print label(s) → patient + order stored on edge (SQLite)
       │
       ▼
 2. COLLECT      Phlebotomy draws tube(s), applies labels, routes to benches
       │
       ▼
 3. SCAN AT      Staff scan/type sample ID at analyzer software (not usually on our web app)
    MACHINE
       │
       ▼
 4. RUN          Instrument measures sample (cells, chemistry, ions, hormone, etc.)
       │
       ▼
 5. SEND         Machine transmits result message to edge engine (accession/specimen ID inside)
       │
       ▼
 6. MATCH        Edge resolves ID → accession → patient (MRN, name from registration)
       │
       ▼
 7. REMAP        Machine codes (WBC, GLU, NA…) → request-form names (CBC, CREATININE…)
       │
       ▼
 8. BENCH        Web app shows results under patient + accession; authorizer releases
       │
       ▼
 9. SYNC         Outbox pushes to cloud Supabase when online
```

**Golden rule:** The ID in the machine message must match **either** the **specimen ID** or **accession number** we registered. Otherwise the result is orphaned.

Full remap table and examples: [MACHINE_TO_REQUEST_FORM.md](./MACHINE_TO_REQUEST_FORM.md).  
Instrument ports and protocols: [ANALYZERS.md](./ANALYZERS.md).

---

## Our four analyzers — what they scan and what they send

None of these boxes typically has a scanner **built into the analyzer face**. Scanning happens at the **LIS workstation, IPU, or loader** wired to that line.

| Machine | Discipline | Sample type (typical) | How ID appears in the message | Edge receives on |
| --- | --- | --- | --- | --- |
| **Sysmex XS-1000i** | Haematology / **CBC** | Whole blood (lavender EDTA) | ASTM `O` record, sample ID field (e.g. `DH202609100001` or `DH202609100001-01`) | TCP **5001** |
| **Mindray BS-240** | **Blood chemistry** | Serum (gold/red after spin) | ASTM `O` record, same sample ID field | TCP **5003** |
| **Diamond ProLyte** | **Electrolytes** (Na, K, Cl, Li) | Serum / plasma | Network LIS: JSON `pId`; Serial: `SAMPLE:` line | HTTP **5002** or serial |
| **YHLO iFlash 1200** | **Immunoassay** (TSH, etc.) | Serum / plasma | HL7 `OBR-2` / `OBR-3` placer/filler ID | TCP **5004** (MLLP) |

After ingest, every result row is stored under the **accession number** (for Bench grouping) while keeping the **barcode/specimen ID** that the machine sent.

Check listeners: `GET http://localhost:3101/analyzers/status` (last accession seen, errors).

---

## Worked example — one big order, all four machines

**Scenario:** Dr. orders a “full workup” panel: **CBC**, **creatinine**, **electrolytes**, **TSH**, plus **urinalysis** (manual).

### Step A — Accession (desk)

1. Select patient **Anika S Henry** (`MRN7004`).
2. Tick CBC, CREATININE, ELECTROLYTES, TSH, URINALYSIS COMPLETE.
3. Submit → accession **`DH202609100005`** (example).
4. App prints **four labels**:

| Specimen ID | Goes on | Routed to |
| --- | --- | --- |
| `DH202609100005-01` | Lavender tube | Haematology → **Sysmex** |
| `DH202609100005-02` | Gold top (serum) | Blood Chemistry → **Mindray** |
| `DH202609100005-03` | Same or second serum aliquot | Chemistry bench → **ProLyte** |
| `DH202609100005-04` | Urine cup | Manual UA bench |

*(Exact number of blood tubes depends on draw SOP — the app splits by **department**, not every possible physical tube.)*

### Step B — Sysmex (CBC)

1. Tech runs lavender tube on Sysmex line.
2. At Sysmex **IPU PC**, scans **`DH202609100005`** (accession) **or** **`DH202609100005-01`** (specimen ID).
3. Sysmex sends ASTM results: **WBC, RBC, HGB, HCT, PLT** (machine shorthand).
4. Edge resolves ID → patient **Anika S Henry**, accession **`DH202609100005`**.
5. Edge **remaps** WBC/RBC/… → ordered test **CBC** on the form.
6. Bench shows CBC components under Anika’s name.

**Sysmex does not know** about creatinine, TSH, or urine. It only runs **cell counts**. It never sends chemistry results.

### Step C — Mindray (creatinine)

1. Serum from gold top on BS-240.
2. Scan **`DH202609100005`** or **`DH202609100005-02`** at Mindray software.
3. Mindray sends **CREA** (and other chemistry codes if that assay menu runs).
4. Edge remaps **CREA → CREATININE** on the form.

Mindray **does not** run CBC or TSH. If the instrument sends a test that was **not ordered**, Bench can flag **“Not on order”**.

### Step D — ProLyte (electrolytes)

1. Serum on ProLyte.
2. Sample ID in **`pId`** (network) or **`SAMPLE:`** (serial) = accession or specimen ID.
3. Sends **NA, K, CL** (and optional **LI**).
4. Edge remaps to **ELECTROLYTES** on the form.

### Step E — iFlash (TSH)

1. Serum on iFlash.
2. ID in HL7 **OBR** fields.
3. Sends **TSH**.
4. Edge remaps to **TSH** on the form.

### Step F — Urinalysis (manual)

- **No machine message.** Tech enters result on **Bench** → patient panel → **Enter result** (`analyzerId: manual`).
- Shows as **awaiting manual result** until entered.

### What ties it all to one patient?

| Link | How |
| --- | --- |
| Machine scan → accession | Edge `resolveScannedBarcode()` lookup |
| Accession → patient | Stored at registration (`patientId`, `patientJson`, MRN) |
| Accession → order | `orderedTestsJson` on accession (full form) and each specimen (department subset) |
| Results → Bench | All rows share **`accessionNumber`**; web loads patient from specimen/registry |

One accession, one patient story on Bench — even though **four machines** and **manual entry** contributed results.

---

## Do machines know the full order?

**Short answer: No — each machine only runs tests it is built for.**

| Question | Answer |
| --- | --- |
| Does Sysmex know we also ordered TSH? | **No.** It counts blood cells only. |
| Does Mindray know we ordered CBC? | **No.** It runs chemistry assays on serum. |
| Does the **app** know the full order? | **Yes.** Stored at accession on edge + cloud requisition. |
| What if a machine sends something **not ordered**? | Result still appears; Bench may show **“Not on order”** (`expectedOnOrder: false`). |
| What if something **was ordered** but no machine runs it? | Shows **awaiting manual result** (e.g. urinalysis, Pap smear, blood type). |
| Development simulators | **Order-aware** — they ask edge what was ordered and **skip** analyzers with nothing to do. Set `SIM_STRICT=1` to send nothing until the accession exists. |

**Remapping** translates vendor codes (WBC, GLU, NA) into **request-form names** (CBC, CREATININE, ELECTROLYTES) so staff see one consistent vocabulary from order → Bench → release.

Not every line on the DHMS form comes from these four analyzers — see [MACHINE_TO_REQUEST_FORM.md](./MACHINE_TO_REQUEST_FORM.md) for manual vs instrument tests.

---

## Bench — where operators see work before results

After Accession prints labels:

1. Open **Bench Review** → **Awaiting run** tab.
2. The **accession list** shows registered orders still missing expected instrument or manual results (accession number, patient, pending count).
3. **Select an accession** to open the detail pane: **specimen IDs** per tube, **ordered tests** with status:
   - **Awaiting instrument** — run on the listed analyzer (Sysmex, Mindray, ProLyte, iFlash)
   - **Awaiting manual** — use **Enter result** on the test card in the detail pane
   - **Hybrid** tests — manual components can be entered from the detail pane even while the instrument result is still pending
   - **Received** — result already posted
4. When analyzers send data, switch to **All** or **Pending review** to see result values.

**Test lookup** (`/orders`) remains a read-only order view for phlebotomy; **Awaiting run** is the bench operator’s active work queue.

---

## Scanning vs specimen ID — quick FAQ

| Question | Answer |
| --- | --- |
| What does the **tube barcode** encode? | **Specimen ID** (e.g. `DH202609100001-01`). |
| Can I scan **accession** at the machine instead? | **Yes.** Edge accepts accession number and links to the same patient and order. |
| Why have specimen IDs if machines use accession? | **Tube-level tracking** — multiple departments, search, label reprint, and future multi-tube same department. Specimen ID is the canonical barcode on the label. |
| Where do I see what to run after accession? | **Bench → Awaiting run** (full queue). **Test lookup** and **Accession history** also list orders. |
| Where do I search specimen ID in the app? | **Bench**, **Labels**, **Test lookup**, **Accession history**, **⌘K command palette** — search accession or specimen ID. |
| Simulator default barcode? | **`DHDEMO0001`** (accession). Tube barcode for demos: **`DHDEMO0001-01`**. Override with `SIM_BARCODE=…`. |

---

## Words you’ll hear (mini glossary)

| Word | Meaning |
| --- | --- |
| **Accession** | Registering a specimen in the lab; also the **visit/form ID** (`DH…`) |
| **Specimen ID** | **One tube’s** ID (`DH…-01`); barcode on label |
| **MRN** | Medical record number — patient chart |
| **Phlebotomy** | Drawing blood from a vein |
| **Centrifuge** | Spin machine to separate serum from cells |
| **ASTM / HL7** | Standard message formats machines use to send results |
| **LIS** | Laboratory Information System — our app + edge engine |
| **Edge engine** | Mini PC service that receives machine data and syncs to cloud |
| **Remap** | Translate machine test codes → request-form test names |
| **EDTA** | Anticoagulant in lavender tubes — keeps blood liquid for cell counts |
| **SST** | Serum separator tube — gold “tiger top” |

More terms: [GLOSSARY.md](./GLOSSARY.md).

---

## Disclaimer

This guide is **education for staff**, not medical advice. **Tube types, draw order, volumes, and timing** must follow **Drax Hall / your lab’s written SOP** and the **test directory** on each order. When in doubt, ask the lab supervisor or pathologist.

---

## Related docs

- [REQUISITION.md](./REQUISITION.md) — accession vs specimen ID, ordering flow  
- [ANALYZERS.md](./ANALYZERS.md) — four machines, ports, protocols, who scans where  
- [MACHINE_TO_REQUEST_FORM.md](./MACHINE_TO_REQUEST_FORM.md) — remapping machine codes to form tests  
- [HARDWARE.md](./HARDWARE.md) — Zebra printer and Honeywell scanner at accession  
- [WORKFLOW.md](./WORKFLOW.md) — Bench review and release after results arrive  
- [LOCAL_DEV.md](./LOCAL_DEV.md) — register → print → simulate analyzer loop  
- [GLOSSARY.md](./GLOSSARY.md) — acronyms and workflow terms
