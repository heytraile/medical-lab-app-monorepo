# Manual result entry — field reference for lab review

> **Lab-friendly PDF:** Share [MANUAL_RESULT_ENTRY_LAB_GUIDE.pdf](./MANUAL_RESULT_ENTRY_LAB_GUIDE.pdf) with non-technical reviewers (plain language, checkboxes, sign-off section). Regenerate with `node scripts/generate-manual-entry-pdf.mjs`.

> **Purpose:** This document lists every test that requires a **manual result** on the Bench, the **fields staff see** when entering that result, and how the system **stores and displays** the value. Please review each section and mark corrections so we can align the software with Drax Hall SOPs.
>
> **Status:** Provisional — structured forms were built from common lab practice and demo needs. Generic forms are placeholders until the lab confirms per-test fields.
>
> **Related:** Workflow assignments (instrument vs manual vs hybrid) are in [TEST_RESULT_REQUIREMENTS.md](./TEST_RESULT_REQUIREMENTS.md).

---

## How manual entry works on the Bench

1. Staff open an accession on **Bench** that has ordered tests not fulfilled by the four integrated analyzers (Sysmex XS-1000i, Mindray BS-240, YHLO iFlash 1200, Diamond ProLyte).
2. Pending manual observations appear in the manual-results area. Staff click **Enter** (or **Edit**) to open a dialog.
3. The dialog shows either:
   - a **structured form** (fixed fields, dropdowns, etc.), or
   - a **generic form** (single value + optional units, flag, reference range).
4. On save, structured fields are stored individually (`manualPayloadJson`) and a **composed display value** is shown on reports and release views.

### Generic form fields (default)

Used for any manual test **without** a structured schema below.

| Field | Required | Notes |
| --- | --- | --- |
| **Value** | Yes | Free text — e.g. `12`, `O Positive`, `No growth`, `Non-Reactive` |
| **Units** | No | e.g. `mm/hr`, `%`, `mg/dL` |
| **Flag** | No | Unknown / Normal / High / Low / Critical |
| **Ref low** | No | Numeric reference range low |
| **Ref high** | No | Numeric reference range high |

---

## Structured entry forms (lab must confirm)

These tests have **custom fields** in the application today. Please verify labels, options, required fields, units, and reference ranges match your bench worksheets.

### ESR (`ESR`)

| Field ID | Label | Type | Required | Options / placeholder | Units | Reference |
| --- | --- | --- | --- | --- | --- | --- |
| `rate` | ESR | Number | **Yes** | e.g. 12 | mm/hr (fixed) | 0 – 20 |

**Stored display value:** numeric rate only (e.g. `12`).

**Flag:** Auto-calculated from reference range (Low / Normal / High). Staff cannot override flag on this form.

---

### Group & Rh (`GROUP_RH`)

| Field ID | Label | Type | Required | Options |
| --- | --- | --- | --- | --- |
| `bloodType` | Blood group | Select | **Yes** | A, B, AB, O |
| `rhFactor` | Rh factor | Select | **Yes** | Rh Positive, Rh Negative |

**Stored display value:** `Group {bloodType}, Rh {rhFactor}` — e.g. `Group A, Rh Positive`.

---

### Sickle test (`SICKLE_TEST`)

| Field ID | Label | Type | Required | Options |
| --- | --- | --- | --- | --- |
| `result` | Sickle solubility | Select | **Yes** | Negative, Positive |

**Stored display value:** selected option (e.g. `Negative`).

---

### Direct Coombs (`COOMBS_DCT`)

| Field ID | Label | Type | Required | Options |
| --- | --- | --- | --- | --- |
| `result` | Direct Coombs | Select | **Yes** | Negative, Positive |

**Stored display value:** selected option.

---

### Indirect Coombs (`COOMBS_ICT`)

| Field ID | Label | Type | Required | Options |
| --- | --- | --- | --- | --- |
| `result` | Indirect Coombs | Select | **Yes** | Negative, Positive |

**Stored display value:** selected option.

---

### Urinalysis — Complete (`URINALYSIS_COMPLETE`)

This test requires **two separate manual observations** before the accession can be released:

#### Component 1: Urine chemistry / strip (`CHEMISTRY`)

| Field ID | Label | Type | Required | Options / placeholder |
| --- | --- | --- | --- | --- |
| `appearance` | Appearance | Text | No | e.g. Clear, yellow |
| `protein` | Protein | Select | No | Negative, Trace, 1+, 2+, 3+, 4+ |
| `glucose` | Glucose | Select | No | Negative, Trace, 1+, 2+, 3+, 4+ |
| `ketones` | Ketones | Select | No | Negative, Trace, 1+, 2+, 3+, 4+ |
| `blood` | Blood | Select | No | Negative, Trace, 1+, 2+, 3+, 4+ |
| `leukocytes` | Leukocytes | Select | No | Negative, Trace, 1+, 2+, 3+, 4+ |
| `nitrite` | Nitrite | Select | No | Negative, Positive |
| `notes` | Additional chemistry notes | Textarea | No | Optional strip or dipstick observations |

**Stored display value:** non-empty fields joined with ` · ` (e.g. `Clear, yellow · Protein: Negative · Glucose: Negative`).

#### Component 2: Urine microscopy (`MICROSCOPY`)

| Field ID | Label | Type | Required | Options / placeholder |
| --- | --- | --- | --- | --- |
| `wbc` | WBC / hpf | Text | No | e.g. 0-2 |
| `rbc` | RBC / hpf | Text | No | e.g. 0-1 |
| `epithelial` | Epithelial cells | Text | No | e.g. Few |
| `bacteria` | Bacteria | Text | No | e.g. None seen |
| `casts` | Casts | Text | No | e.g. None |
| `crystals` | Crystals | Text | No | e.g. None |
| `notes` | Microscopy notes | Textarea | No | Other sediment findings |

**Stored display value:** non-empty fields joined with ` · `.

> **Lab note:** Confirm whether pH, specific gravity, urobilinogen, bilirubin, or other strip parameters should be added to the chemistry form.

---

### WBC / Diff — blood film review (`WBC_DIFF` + component `BLOOD_FILM_REVIEW`)

**Workflow:** Hybrid — instrument CBC/diff from Sysmex **plus** this manual observation.

| Field ID | Label | Type | Required | Options / placeholder |
| --- | --- | --- | --- | --- |
| `finding` | Film review | Select | **Yes** | No significant abnormality; Left shift; Toxic granulation; Atypical lymphocytes; Blasts present; Other (see comment) |
| `comment` | Comment | Textarea | No | Optional morphology comment |

**Stored display value:** film review finding (comment stored separately in payload; not appended to display template today).

> **Lab note:** Confirm whether film review is required on every WBC/Diff order or only by reflex criteria.

---

## Review checklist — structured forms

| Confirm | Test code | Component | Correct as shown? | Changes needed |
| --- | --- | --- | --- | --- |
| [ ] | `ESR` | RESULT | | |
| [ ] | `GROUP_RH` | RESULT | | |
| [ ] | `SICKLE_TEST` | RESULT | | |
| [ ] | `COOMBS_DCT` | RESULT | | |
| [ ] | `COOMBS_ICT` | RESULT | | |
| [ ] | `URINALYSIS_COMPLETE` | CHEMISTRY | | |
| [ ] | `URINALYSIS_COMPLETE` | MICROSCOPY | | |
| [ ] | `WBC_DIFF` | BLOOD_FILM_REVIEW | | |

---

## All other manual tests — generic form today

The tests below use the **generic form** (Value, Units, Flag, Ref low, Ref high). If any test needs a structured form like those above, note the desired fields in the checklist at the end.

### Haematology

- **CROSS_MATCH** — CROSS MATCH
- **FIBRINOGEN** — FIBRINOGEN
- **INDICES** — INDICES
- **LUPUS_ANTICOAG** — LUPUS ANTICOAG.
- **MONO** — MONO
- **PT_INR** — PT / INR
- **PTT** — PTT

### Blood Chemistry

- **A_G** — A/G Ratio
- **ALCOHOL** — ALCOHOL
- **ALK_PHOS** — ALK PHOS
- **AMYLASE** — AMYLASE
- **BILIRUBIN_TOT_DIRECT** — BILIRUBIN (TOT & DIRECT)
- **CALCIUM** — CALCIUM
- **CHOLINESTERASE** — CHOLINESTERASE
- **GGTP** — GGTP
- **HS_CRP** — hs CRP
- **LDH** — LDH
- **LIPASE** — LIPASE
- **LIPO_ELECTROPHORESIS** — LIPO ELECTROPHORESIS
- **MAGNESIUM** — MAGNESIUM
- **PHOSPHORUS** — PHOSPHORUS
- **PROTEIN_ELECTROPHORESIS** — PROTEIN ELECTROPHORESIS
- **PROTEINS** — PROTEINS (Alb & Glob)
- **URIC_ACID** — URIC ACID

### Cardiac Enzymes

- **LDH_CARDIAC** — LDH

### Endocrinology

- **BHCG_QUAL** — BHCG QUAL.
- **BHCG_QUANT** — BHCG QUANT.
- **CORTISOL_AM** — CORTISOL AM
- **CORTISOL_PM** — CORTISOL PM
- **DHEA_S** — DHEA-S
- **ESTRADIOL** — ESTRADIOL
- **INSULIN_0HR** — INSULIN - 0hr
- **INSULIN_1HR** — INSULIN - 1hr
- **INSULIN_2HR** — INSULIN - 2hr
- **INSULIN_3HR** — INSULIN - 3hr
- **PROGESTERONE** — PROGESTERONE
- **PSA_FREE** — PSA Free
- **PSA_TOTAL** — PSA TOTAL
- **T3_FREE** — T3 Free
- **T3_TOTAL** — T3 Total
- **T3_UPTAKE** — T3 Uptake
- **TESTOSTERONE** — TESTOSTERONE
- **TESTOSTERONE_FREE** — TESTOSTERONE Free

### Immunology

- **ANA** — ANA
- **ANTI_DNA** — Anti-DNA
- **ASLO** — ASLO
- **ASTO** — ASTO
- **C3** — C3
- **C4** — C4
- **CMV_IGG** — CMV IgG
- **CMV_IGM** — CMV IgM
- **CRP** — CRP
- **DENGUE_IGG** — DENGUE IgG
- **DENGUE_IGM** — DENGUE IgM
- **FEBRILE_AGGLUTININS** — FEBRILE AGGLUTININS
- **HAV_IGM** — HAV IgM
- **HB_CORE_AB** — HB Core Ab
- **HBEAG** — HBeAg
- **HBSAB** — HBsAb
- **HBSAG** — HBsAg
- **HCVAB** — HCVAb
- **HERPES_I_IGG** — HERPES I IgG
- **HERPES_I_IGM** — HERPES I IgM
- **HERPES_II_IGG** — HERPES II IgG
- **HERPES_II_IGM** — HERPES II IgM
- **HIV_CONFIRM** — HIV Confirmation
- **HTLV_I_II** — HTLV I/II
- **MHA_TP** — MHA - TP
- **RA** — RA
- **RUBELLA_IGG** — RUBELLA IgG
- **RUBELLA_IGM** — RUBELLA IgM
- **TOXOPLASMA_IGG** — TOXOPLASMA IgG
- **TOXOPLASMA_IGM** — TOXOPLASMA IgM
- **VDRL** — VDRL
- **WIDAL** — WIDAL

### Anaemia

- **B12_FOLATE** — B 12 & FOLATE (F)
- **G6PD** — G6PD
- **HB_ELECTROPHORESIS** — Hb ELECTROPHORESIS
- **IRON_TIBC_SATURATION** — IRON / TIBC / SATURATION

### Special Chemistry

- **BLOOD_LEAD** — BLOOD LEAD
- **CA_125** — CA-125
- **CEA** — CEA

### Urine Chemistry

- **17_KGS_24HR** — 17 KGs - 24 hr
- **17_KS_24HR** — 17 Ks - 24 hr
- **5SHIAA_24HR** — 5SHIAA - 24hr
- **AMYLASE_URINE** — AMYLASE
- **CALCIUM_URINE_24HR** — CALCIUM - 24 hr
- **CREATININE_CLEARANCE_24HR** — CREATININE CLEAR - 24 hr
- **CREATININE_URINE_24HR** — CREATININE - 24 hr
- **CREATININE_URINE_SPOT** — CREATININE - spot
- **MICROALBUMIN_24HR** — MICROALBUMIN 24 hr
- **MICROALBUMIN_CREAT_RATIO** — MICROALBUMIN/CREAT RATIO
- **PHOSPHORUS_URINE_24HR** — PHOSPHORUS - 24 hr
- **PREG_TEST_BHCG** — PREG TEST (BHCG)
- **PROTEIN_URINE_24HR** — PROTEIN 24hr
- **PROTEIN_URINE_SPOT** — PROTEIN - spot
- **VMA_24HR** — VMA - 24 hr

### Bacteriology

- **AFB_SMEAR_CULTURE** — AFB - SMEAR & CULTURE
- **CHLAMYDIA** — CHLAMYDIA
- **CULT_SENS_FUNGAL** — CULT & SENS: FUNGAL
- **CULT_SENS_ROUTINE** — CULT & SENS: ROUTINE
- **GRAM_SMEAR** — GRAM SMEAR
- **SPECIMEN** — SPECIMEN
- **WET_PREP** — WET PREP

### Faeces / Miscellaneous

- **AMOEBA** — AMOEBA
- **OCCULT_BLOOD** — OCCULT BLOOD
- **OVA_PARASITES** — OVA & PARASITES
- **PAP_SMEAR** — PAP SMEAR
- **SEMEN_ANALYSIS** — SEMEN ANALYSIS
- **STONE_ANALYSIS** — STONE ANALYSIS

### Therapeutic Drug

- **DILANTIN_PHENYTOIN** — DILANTIN / PHENYTOIN
- **PHENOBARBITAL** — PHENOBARBITAL
- **SALICYLATES** — SALICYLATES
- **TEGRETOL_CARBAMAZEPINE** — TEGRETOL / CARBAMAZEPINE
- **THERAPEUTIC_OTHER** — OTHER
- **VALPROIC_ACID** — VALPROIC ACID

---

## Send-out tests (reference lab results)

Drugs-of-abuse panels are **send-out** tests. Staff enter a single **Reference laboratory result** using the generic form (same fields as above). See [TEST_RESULT_REQUIREMENTS.md](./TEST_RESULT_REQUIREMENTS.md) for the full send-out list.

---

## Priority candidates for structured forms

These generic-form tests often have **multi-part results** on paper worksheets. Consider requesting structured forms for them during lab review:

| Test code | Test name | Suggested reason |
| --- | --- | --- |
| `SEMEN_ANALYSIS` | SEMEN ANALYSIS | Volume, count, motility, morphology |
| `CULT_SENS_ROUTINE` | CULT & SENS: ROUTINE | Organism, colony count, sensitivities |
| `CULT_SENS_FUNGAL` | CULT & SENS: FUNGAL | Organism, sensitivities |
| `PT_INR` | PT / INR | PT seconds + INR |
| `BILIRUBIN_TOT_DIRECT` | BILIRUBIN (TOT & DIRECT) | Total + direct |
| `PROTEINS` | PROTEINS (Alb & Glob) | Albumin + globulin |
| `IRON_TIBC_SATURATION` | IRON / TIBC / SATURATION | Iron, TIBC, saturation % |
| `B12_FOLATE` | B 12 & FOLATE (F) | B12 + folate |
| `HB_ELECTROPHORESIS` | Hb ELECTROPHORESIS | Fraction pattern |
| `CROSS_MATCH` | CROSS MATCH | Compatibility result + method |

---

## Lab feedback template

Please return completed feedback using this format:

```
Test: [CODE] — [Name]
Component: [RESULT | CHEMISTRY | MICROSCOPY | BLOOD_FILM_REVIEW | other]

Current form: [Structured | Generic]

Requested changes:
- Field: [label] — [add / remove / rename / change type / change options]
- Required: [yes/no]
- Units: [...]
- Reference range: [...]
- Display format: [...]

Confirmed correct: [yes/no]
Reviewer: [name]
Date: [date]
```

---

## Technical source of truth (for developers)

Structured schemas are defined in:

`packages/catalog/src/manual-entry-schemas.ts`

Workflow and manual-component assignments are in:

`packages/catalog/src/test-fulfillment.ts`

After lab confirmation, update those files and re-run catalog tests.
