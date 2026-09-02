# Glossary — acronyms, protocols, and lab test codes

Living document for the **Medical Lab App** monorepo.  
First customer: Drax Hall Clinical Laboratory. Product intent: multi-lab LIS.

**Rule for the team / agents:** when a new acronym, protocol, hardware term, or assay code is introduced in docs or code, **add it here** in the same change.

---

## How to use this file

| Section | What’s in it |
| --- | --- |
| [Product & architecture](#product--architecture) | LIS, edge, cloud, sync concepts |
| [Clinical workflow](#clinical-workflow) | Bench Review, release, STAT |
| [Hardware & links](#hardware--links) | RS-232, TCP, printers, serial |
| [Analyzer protocols](#analyzer-protocols) | ASTM, HL7, MLLP, record types |
| [Our software stack](#our-software-stack) | Nest, Prisma, Supabase, web tools |
| [Common lab test / analyte codes](#common-lab-test--analyte-codes) | What instruments print in `R` / `OBX` fields |
| [Machine → discipline map](#machine--discipline-map-drax-hall) | Which analyzer tends to produce which codes |

Codes below are **common clinical abbreviations**. Exact strings from Sysmex / Mindray / YHLO / ProLyte may differ slightly (e.g. `WBC` vs `^^^WBC` vs assay numbers). Always confirm against the vendor LIS manual and map in config when we harden parsers.

---

## Product & architecture

| Term | Meaning | Why it matters here |
| --- | --- | --- |
| **LIS** | Laboratory Information System | App that manages orders, results, review, release, reporting |
| **Edge** | Local bridge on the lab mini PC (`apps/edge-engine`) | Talks to analyzers; SQLite + outbox; works offline |
| **Cloud API** | NestJS backend in the cloud (`apps/api`) | Receives edge pushes; writes Supabase; release/notify APIs |
| **Supabase** | Hosted Postgres + Auth (+ optional Realtime) | Cloud system of record — **not** the UI |
| **UI** | User interface | `apps/web` — Bench Review, Accession, Release queue |
| **API** | Application Programming Interface | HTTP/JSON contracts between web, edge, and cloud |
| **REST** | Representational State Transfer | Style of HTTP APIs (`GET /results`, `POST /sync/events`) |
| **CRUD** | Create, Read, Update, Delete | Basic data operations |
| **Outbox** | Local queue of events waiting to sync | Edge store-and-forward; status `pending` → `acked` |
| **Idempotent** | Safe to retry the same request | Same `eventId` twice does not double-insert in cloud |
| **UUID** | Universally Unique Identifier | Used as sync `eventId` |
| **JSON** | JavaScript Object Notation | Payload format edge → cloud |
| **PHI** | Protected Health Information | Patient-identifiable data — minimize exposure |
| **WAL** | Write-Ahead Logging | SQLite mode for concurrent offline writes |
| **ORM** | Object-Relational Mapper | Prisma maps tables ↔ TypeScript |
| **RLS** | Row Level Security | Postgres/Supabase rules per role |
| **SDK** | Software Development Kit | Client libraries (e.g. Supabase JS) |
| **CLI** | Command-Line Interface | `pnpm`, simulator `send:sysmex`, etc. |
| **SSH** | Secure Shell | Secure remote/git access |
| **HTTPS** | HTTP Secure | Encrypted HTTP for sync |
| **CI** | Continuous Integration | Automated test/build on push (later) |
| **Monorepo** | One git repo with many apps/packages | This repository |
| **PTY** | Pseudo-Terminal | Fake serial ports via `socat` for home testing |

---

## Clinical workflow

| Term | Meaning | Why it matters here |
| --- | --- | --- |
| **Bench Review** | Tech “gallery” of today’s results | See results; soft-check; escalate; **cannot** release |
| **Authorizer** | Person (often 1–2) who may finalize results | Only role that sets `released` for the doctor |
| **pending_review** | Result not yet signed off | Synced to cloud early; not doctor-visible as final |
| **released** | Authorizer signed off | Eligible for doctor / report / EMR |
| **STAT** | Immediately (from Latin *statim*) | Urgent critical escalation path |
| **Panic / critical value** | Life-threatening out-of-range result | Auto-flag and/or manual escalate → notify authorizer |
| **Accession (number)** | Lab’s unique ID for a specimen | Spine of our system; usually = tube barcode |
| **Barcode** | Scannable specimen ID on the tube | Must match what the analyzer sends back |
| **MRN** | Medical Record Number | Patient identifier in clinic/hospital |
| **DOB** | Date of Birth | Demographics / labels |
| **QC** | Quality Control | Known samples to verify instruments (later) |
| **EMR / EHR** | Electronic Medical / Health Record | Doctor’s system; outbound later |
| **Delta check** | Compare to patient’s prior result | Soft safety check on Bench Review (later) |
| **Aliquot** | Portion of a specimen split into another tube | Labeling / routing later |
| **Phlebotomy / phleb** | Blood draw | Collectors are staff with job title phlebotomist or lab technologist |
| **Job title** | What someone does at the bench (phlebotomist, lab technologist, …) | Stored on `profiles.job_title`; separate from permission **role** |
| **Permission role** | What the app lets you do (`tech`, `authorizer`, `admin`) | Supabase Auth + RLS; see Staff page for job title assignment |

| **Requisition** | Doctor/reception test order before or at draw | Cloud `requisitions` row with `ordered_selections` + expanded `ordered_tests` |
| **Test panel** | Bundle of tests ordered as one profile (e.g. Anaemia I) | Expands to member analyte codes at register |
| **Test catalog** | Lab’s orderable test + panel list | `test_catalog_items` / `test_panels` in Supabase; bundled in `@drax-lis/catalog` |
| **Ordered vs received** | Work requested vs results on the bench | v1 shows ordered list; reconciliation (pending/received) is follow-up |

Full workflow rules: [WORKFLOW.md](./WORKFLOW.md). Requisition & catalog: [REQUISITION.md](./REQUISITION.md).

---

## Hardware & links

| Term | Meaning | Why it matters here |
| --- | --- | --- |
| **RS-232** | Serial communication standard (“RS2” in casual speech) | Physical cable from many analyzers to the mini PC |
| **TCP/IP** | Transmission Control Protocol / Internet Protocol | Ethernet/network sockets for analyzers & printers |
| **LAN** | Local Area Network | Lab network |
| **USB** | Universal Serial Bus | USB–serial adapters → `/dev/ttyUSB*` on Linux |
| **COM port** | Windows serial port name | Same idea as Linux `ttyUSB` / `ttyS` |
| **Baud rate** | Serial bits per second (e.g. 9600) | Must match instrument settings |
| **ZPL** | Zebra Programming Language | Raw label commands to Zebra printers |
| **Port 9100** | Common raw print port | Zebra TCP listener |
| **IPU** | Information Processing Unit (Sysmex term) | Analyzer’s PC/controller that speaks ASTM |

---

## Analyzer protocols

| Term | Meaning | Why it matters here |
| --- | --- | --- |
| **ASTM** | Standards body / lab messaging family | How many analyzers talk to a host LIS |
| **ASTM E1381** | Low-level link layer | ENQ/ACK/NAK/STX/ETX/EOT + checksums |
| **ASTM E1394** | High-level records | H, P, O, R, L text records |
| **LIS2-A2 / CLSI LIS02** | Related modern lab instrument messaging names | Same neighborhood as ASTM-style host interfaces |
| **HL7** | Health Level Seven | Healthcare messaging (iFlash uses v2.3.1) |
| **MLLP** | Minimal Lower Layer Protocol | Frames HL7 with `VT` … `FS` + `CR` |
| **ORU^R01** | HL7 Observation Result | Analyzer → host unsolicited results |
| **ACK^R01** | HL7 acknowledgment | Edge ACKs ORU after accept |
| **QRY^Q02** | HL7 query | Analyzer asks host for orders by barcode |
| **DSR^Q03** | HL7 display response | Host reply listing ordered tests for a barcode |
| **Host query** | Instrument asks LIS for worklist | Edge `HostQueryService` looks up Specimen by barcode |
| **ENQ** | Enquiry | ASTM: “may I send?” |
| **ACK** | Acknowledge | Positive ack (link or application) |
| **NAK** | Negative Acknowledge | Reject / please resend |
| **EOT** | End of Transmission | ASTM: session finished |
| **STX** | Start of Text | Start of an ASTM frame |
| **ETX** | End of Text | Last frame of a message |
| **ETB** | End of Transmission Block | Intermediate ASTM frame |
| **CR / LF** | Carriage Return / Line Feed | Line endings in frames/records |
| **Checksum** | Integrity byte(s) on a frame | Detect corruption on the wire |
| **H / P / O / R / L** | Header / Patient / Order / Result / Terminator | ASTM E1394 record type IDs |
| **MSH** | Message Header (HL7) | Start of HL7 message |
| **PID** | Patient Identification (HL7) | Patient segment |
| **OBR** | Observation Request (HL7) | Order / specimen segment (barcode often here) |
| **OBX** | Observation/Result (HL7) | One analyte value per segment |
| **Unidirectional** | Instrument only sends results | Simpler; no order download |

---

## Our software stack

| Term | Meaning | Why it matters here |
| --- | --- | --- |
| **NestJS** | Node.js backend framework | `edge-engine` and `api` |
| **Prisma** | ORM + migrations tooling | Edge SQLite schema |
| **SQLite** | File-based SQL database | Offline buffer on mini PC |
| **Postgres / PostgreSQL** | Server SQL database | Supabase backend |
| **TanStack Start** | Full-stack React framework | `apps/web` |
| **TanStack Query** | Async server-state for React | Fetches results; invalidated on live events |
| **TanStack Table** | Headless table toolkit | Bench Review grid |
| **Socket.IO** | Real-time WebSocket library | Live bench events on edge |
| **Zod** | Schema validation library | `packages/contracts` |
| **Vite** | Frontend bundler / dev server | Web app tooling |
| **Tailwind CSS** | Utility-first CSS | Styling |
| **Turborepo** | Monorepo task runner | `pnpm dev` / build pipeline |
| **pnpm** | Package manager | Workspaces in this repo |
| **Docker** | Container runtime | Deploy edge stack on Ubuntu mini PC |
| **Vitest** | Test runner | Protocol unit tests |

---

## Common lab test / analyte codes

Instruments usually send short codes in ASTM `R` records or HL7 `OBX-3`. Below are widely used abbreviations. **Configure mappings per analyzer** when real dumps arrive.

### Hematology (CBC / Sysmex-class)

| Code | Full name | Notes |
| --- | --- | --- |
| **CBC** | Complete Blood Count | Panel name / order code |
| **WBC** | White Blood Cell count | Leukocytes |
| **RBC** | Red Blood Cell count | Erythrocytes |
| **HGB** / **Hb** | Hemoglobin | |
| **HCT** / **Ht** | Hematocrit | |
| **MCV** | Mean Corpuscular Volume | RBC index |
| **MCH** | Mean Corpuscular Hemoglobin | |
| **MCHC** | Mean Corpuscular Hemoglobin Concentration | |
| **RDW** | Red Cell Distribution Width | |
| **PLT** | Platelet count | |
| **MPV** | Mean Platelet Volume | |
| **NEUT** / **NE%** / **NE#** | Neutrophils | % and absolute (#) variants |
| **LYMPH** / **LY%** / **LY#** | Lymphocytes | |
| **MONO** / **MO%** / **MO#** | Monocytes | |
| **EO** / **EO%** / **EO#** | Eosinophils | |
| **BASO** / **BA%** / **BA#** | Basophils | |
| **IG** | Immature Granulocytes | If reported |
| **NRBC** | Nucleated RBC | If reported |
| **RET** / **RET%** | Reticulocytes | If option enabled |

### Electrolytes / blood gas–adjacent (ProLyte / ISE-class)

| Code | Full name | Notes |
| --- | --- | --- |
| **Na** / **NA** | Sodium | |
| **K** / **K+** | Potassium | Frequent **critical** analyte |
| **Cl** / **CL** | Chloride | |
| **iCa** / **Ca** | Ionized / calcium | Analyzer-dependent |
| **Li** | Lithium | ProLyte optional ISE channel (`Li+`) |
| **TCO2** / **HCO3** | Total CO₂ / Bicarbonate | If on panel |

### Chemistry (Mindray BS-class / general)

| Code | Full name | Notes |
| --- | --- | --- |
| **GLU** / **GLUC** / **GLUCOSE** | Glucose | |
| **BUN** / **UREA** | Blood urea nitrogen / urea | Naming varies by region |
| **CREA** / **CREAT** / **CR** | Creatinine | |
| **UA** / **URIC** | Uric acid | |
| **TP** | Total protein | |
| **ALB** | Albumin | |
| **GLOB** | Globulin | Often calculated |
| **TBIL** / **BILT** | Total bilirubin | |
| **DBIL** / **BILD** | Direct bilirubin | |
| **AST** / **GOT** | Aspartate aminotransferase | |
| **ALT** / **GPT** | Alanine aminotransferase | |
| **ALP** / **ALKP** | Alkaline phosphatase | |
| **GGT** / **GGTP** | Gamma-glutamyl transferase | |
| **LDH** | Lactate dehydrogenase | |
| **CK** / **CPK** | Creatine kinase | |
| **CKMB** | CK-MB fraction | |
| **AMY** / **AMYL** | Amylase | |
| **LIP** / **LIPA** | Lipase | |
| **CHOL** / **TC** | Total cholesterol | |
| **TRIG** / **TG** | Triglycerides | |
| **HDL** | High-density lipoprotein cholesterol | |
| **LDL** | Low-density lipoprotein cholesterol | Often calculated |
| **VLDL** | Very-low-density lipoprotein | Often calculated |
| **Ca** / **CA** | Calcium | |
| **PHOS** / **P** / **PO4** | Phosphorus / phosphate | |
| **MG** / **Mg** | Magnesium | |
| **FE** / **IRON** | Iron | |
| **TIBC** | Total iron-binding capacity | |
| **FER** / **FERR** | Ferritin | Sometimes immunoassay |
| **CRP** | C-reactive protein | |
| **HbA1c** / **A1C** | Glycated hemoglobin | Chemistry or dedicated analyzer |
| **BMP** | Basic Metabolic Panel | **Order/panel** code, not one analyte |
| **CMP** | Comprehensive Metabolic Panel | Order/panel code |
| **LFT** | Liver Function Tests | Order/panel code |
| **LIPID** | Lipid panel | Order/panel code |

### Immunoassay / serology (YHLO iFlash-class / general)

| Code | Full name | Notes |
| --- | --- | --- |
| **TSH** | Thyroid-stimulating hormone | |
| **FT3** / **T3** | Free / total triiodothyronine | |
| **FT4** / **T4** | Free / total thyroxine | |
| **TPOAb** / **Anti-TPO** | Thyroid peroxidase antibody | |
| **TgAb** | Thyroglobulin antibody | |
| **FSH** | Follicle-stimulating hormone | |
| **LH** | Luteinizing hormone | |
| **PRL** / **PROL** | Prolactin | |
| **E2** / **ESTR** | Estradiol | |
| **PROG** / **P4** | Progesterone | |
| **TESTO** / **TES** | Testosterone | |
| **β-HCG** / **HCG** / **BHCG** | Human chorionic gonadotropin | |
| **PSA** | Prostate-specific antigen | |
| **AFP** | Alpha-fetoprotein | |
| **CEA** | Carcinoembryonic antigen | |
| **CA125** / **CA15-3** / **CA19-9** | Cancer antigens | Exact code per kit |
| **INS** / **INSULIN** | Insulin | |
| **VITD** / **25OHD** | Vitamin D (25-OH) | |
| **B12** / **VB12** | Vitamin B12 | |
| **FOL** / **FOLATE** | Folate | |
| **HIV** / **HBsAg** / **HCV** | Infectious markers | Kit-specific codes |
| **IgE** / **IgG** / **IgM** / **IgA** | Immunoglobulins | |

### Coagulation (if added later)

| Code | Full name |
| --- | --- |
| **PT** | Prothrombin time |
| **INR** | International Normalized Ratio |
| **APTT** / **PTT** | Activated partial thromboplastin time |
| **FIB** | Fibrinogen |
| **D-DIMER** / **DD** | D-dimer |

### Urinalysis (if added later)

| Code | Full name |
| --- | --- |
| **UA** | Urinalysis (panel) — context-dependent vs uric acid |
| **LEU** | Leukocyte esterase |
| **NIT** | Nitrite |
| **PRO** | Protein (urine) |
| **BLO** | Blood (urine) |
| **SG** | Specific gravity |
| **PH** | pH |
| **KET** | Ketones |
| **URO** | Urobilinogen |
| **BIL** | Bilirubin (urine) |

---

## Machine → discipline map (Drax Hall)

| Analyzer | Typical codes you’ll see first |
| --- | --- |
| **Sysmex XS-1000i** | CBC family: WBC, RBC, HGB, HCT, PLT, differentials |
| **Diamond ProLyte** | Na, K, Cl, Li (Li optional channel) |
| **Mindray BS-240** | Chemistry: GLU, CREA, LFT/lipid enzymes, electrolytes if configured |
| **YHLO iFlash 1200** | Immunoassay: TSH, hormones, serology kits installed at the site |

When we capture real dumps on site, paste example `R` / `OBX` lines into [ANALYZERS.md](./ANALYZERS.md) and extend this glossary with **vendor-exact** codes.

---

## Units you’ll see next to codes

Not acronyms of tests, but common on the wire:

| Unit | Typical use |
| --- | --- |
| **10³/µL** / **10*3/uL** | WBC, PLT counts |
| **10⁶/µL** / **10*6/uL** | RBC |
| **g/dL** | HGB, proteins |
| **%** | HCT, differentials, RDW |
| **fL** | MCV, MPV |
| **pg** | MCH |
| **g/dL** or **g/L** | MCHC (lab-dependent) |
| **mmol/L** | Electrolytes, glucose (SI) |
| **mg/dL** | Glucose, creatinine (US conventional) |
| **U/L** / **IU/L** | Enzymes |
| **mIU/L** / **µIU/mL** | TSH and many hormones |
| **ng/mL** / **pg/mL** | Many immunoassays |

---

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system map
- [WORKFLOW.md](./WORKFLOW.md) — Bench Review / release / STAT
- [ANALYZERS.md](./ANALYZERS.md) — four instruments & ports
- [ROADMAP.md](./ROADMAP.md) — build phases
- [LOCAL_DEV.md](./LOCAL_DEV.md) — run simulators at home
