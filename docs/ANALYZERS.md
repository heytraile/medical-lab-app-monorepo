# Analyzers — Drax Hall Clinical Laboratory

This document explains **what each lab machine does**, **how it works in everyday terms**, and **how it connects to our app**. You do not need a medical or lab background to read the first sections. Technical protocol details are at the bottom for implementers.

Results from these instruments arrive as **`pending_review`** until an authorizer releases them — see [WORKFLOW.md](./WORKFLOW.md).

---

## The big picture (how a tube becomes a result)

1. **Accession** — Staff register the patient and print a **barcode label** on the blood tube (Zebra printer at the desk).
2. **Collect & route** — The tube goes to the right bench (hematology, chemistry, etc.).
3. **Identify the sample** — Someone tells the machine **which tube this is**, usually by **scanning the barcode** at a computer or loader connected to that instrument (not always on the machine itself — see below).
4. **Run the test** — The machine processes the sample and measures things in the blood (cell counts, chemicals, hormones, etc.).
5. **Send results** — The machine sends numbers back to our **edge engine** over a cable or network, tagged with the **same accession/barcode** that was on the label.
6. **Review & release** — Results show on **Bench**; an authorizer releases them when appropriate.

If the barcode the machine sends does not match a specimen we registered, Bench may show **“—”** for patient name until that accession exists in the system.

---

## Our four analyzers — plain English

### Sysmex XS-1000i (`sysmex_xs1000i`) — **Blood cell counter (CBC)**

**What it does**  
Counts and sizes the **cells in your blood** — the Complete Blood Count (CBC). Think of it as answering: “How many white cells, red cells, and platelets are there, and are they in a normal range?”

**Typical tests it reports (in our simulator)**

| Code | Plain English |
| --- | --- |
| **WBC** | White blood cells — part of the immune system |
| **RBC** | Red blood cells — carry oxygen |
| **HGB** | Hemoglobin — the oxygen-carrying protein inside red cells |
| **HCT** | Hematocrit — what fraction of blood volume is red cells |
| **PLT** | Platelets — help blood clot |

**Sample type**  
Usually **whole blood** in a **lavender/purple top** tube (EDTA), common for routine blood work.

**How it works (simplified)**  
A small amount of blood is drawn into the analyzer. The machine dilutes the blood and passes it through sensors that **count and classify cells** (often using laser light scatter). When finished, its control software builds a result message and sends it to the lab computer.

**Does the Sysmex have a built-in barcode scanner?**  
**Usually no — not on the analyzer box itself.** On many installs (including typical XS-series setups):

- The **analyzer** runs the sample.
- A separate **Sysmex IPU** (Information Processing Unit — basically the PC/software that runs the line) is where staff **scan the tube barcode** with a **handheld scanner**, or type the sample ID.
- Some sites use an **auto loader / rack system** with a **barcode reader on the loader**, still not “inside” the main analyzer.

So if you do not see a scanner on the Sysmex, that is **normal**. Scanning happens at the **workstation, loader, or optional side scanner** wired to Sysmex software — not necessarily on the instrument face.

**In our dev simulator**  
We skip physical scanning. The simulator sends fake CBC results over TCP with your accession number already filled in (e.g. `DHDEMO0001`).

---

### Diamond ProLyte (`diamond_prolyte`) — **Electrolytes (salts in blood)**

**What it does**  
Measures **electrolytes** — important minerals dissolved in blood that affect nerves, muscles, and fluid balance.

**Typical tests (in our simulator)**

| Code | Plain English |
| --- | --- |
| **Na+** | Sodium |
| **K+** | Potassium (often flagged quickly if very high/low) |
| **Cl-** | Chloride |
| **Li+** | Lithium (optional channel on this model) |

**Sample type**  
Usually **serum or plasma** (blood after the liquid part is separated from cells), often from the same draw as other chemistry tests.

**How it works (simplified)**  
The ProLyte uses **Ion Selective Electrodes (ISE)** — sensors that respond to each ion type. When a sample completes, it **broadcasts** a simple text block over **RS-232 serial** (one-way; it does not use the same back-and-forth “handshake” as Sysmex/Mindray). The message includes a `SAMPLE:` line with either a **scanned accession** or an internal sequence number.

**Barcode scanning**  
Depends on site setup — often a small serial-linked workflow or manual sample ID entry on the ProLyte side. The result message must still carry the ID that matches our tube label.

**In our dev simulator**  
Writes a fake ProLyte text block to a serial path (`PROLYTE_SERIAL_PATH`); see [LOCAL_DEV.md](./LOCAL_DEV.md) for the socat recipe.

---

### Mindray BS-240 (`mindray_bs240`) — **Blood chemistry**

**What it does**  
Runs **chemistry panels** on blood serum — common “metabolic” tests: sugar, kidney markers, liver enzymes, etc.

**Typical tests (in our simulator)**

| Code | Plain English |
| --- | --- |
| **GLU** | Glucose (blood sugar) |
| **BUN** | Blood urea nitrogen — kidney-related waste marker |
| **CREA** | Creatinine — kidney function marker |
| **ALT** | Liver enzyme |
| **AST** | Liver enzyme (simulator may flag high) |

**Sample type**  
Usually **serum** from a **red or gold top** tube after centrifuging (spinning) to separate liquid from cells.

**How it works (simplified)**  
The BS-240 is a **clinical chemistry analyzer**: it pipettes tiny amounts of serum into reaction wells, mixes with reagents, and measures color or light change to calculate concentrations. It talks to the LIS using **ASTM** over TCP (same family of messages as Sysmex, but different test menu).

**Host query (optional)**  
The Mindray can **ask the lab computer** “what tests did the doctor order for barcode X?” before or while running. Our edge engine can answer that lookup when enabled.

**Barcode scanning**  
Often at the Mindray **software PC or sample track** — model and configuration vary. Same rule: whatever ID is scanned must match the label we printed at accession.

**In our dev simulator**  
Sends a fake chemistry panel over TCP port **5003** with your accession embedded in the order record.

---

### YHLO iFlash 1200 (`yhlo_iflash1200`) — **Immunoassay (hormones & similar)**

**What it does**  
Runs **immunoassays** — tests that use antibodies to measure hormones, markers, and similar targets at very low concentrations. Good for things like thyroid tests.

**Typical test (in our simulator)**

| Code | Plain English |
| --- | --- |
| **TSH** | Thyroid Stimulating Hormone — common thyroid screen |

**Sample type**  
Usually **serum or plasma**.

**How it works (simplified)**  
The iFlash uses **chemiluminescence immunoassay**: sample + reagents + light measurement to detect how much of a target molecule is present. It sends results using **HL7** messages wrapped in **MLLP** (a healthcare industry standard for lab interfaces), not ASTM.

**Host query (optional)**  
Like Mindray, it can send a **QRY** (“what orders exist for this barcode?”) and wait for a reply before reporting results. Simulator flag: `--query`.

**Barcode scanning**  
Typically at the iFlash **control software / rack loader**, not something our web app drives directly.

**In our dev simulator**  
Sends a fake TSH result over TCP port **5004**.

---

## Barcodes and scanners — who scans what?

| Location | Scanner? | Purpose |
| --- | --- | --- |
| **Accession desk** (our web app) | **Honeywell 1900G-HD** USB wedge | Scan patient MRN or accession when registering — see [HARDWARE.md](./HARDWARE.md) |
| **Label printer** (Zebra ZD411) | N/A — **prints** barcodes | Puts Code 128 + Data Matrix on the tube |
| **Sysmex XS-1000i** | **Usually no built-in scanner on the analyzer** | Scan at IPU PC or loader; see above |
| **Mindray BS-240** | Optional / at workstation | Links physical tube to order in Mindray software |
| **YHLO iFlash 1200** | Optional / at workstation | Same idea |
| **Diamond ProLyte** | Site-dependent | Sample ID in `SAMPLE:` line of result block |

**Golden rule:** The **accession number on the printed tube label** must be the same ID the analyzer sends back in its result message. Our edge engine matches on that ID.

| Protocol | Where the barcode appears in the message |
| --- | --- |
| ASTM E1394 (Sysmex, Mindray) | `O` record, sample ID field (field 3; may look like `DH20260125001^1^1`) |
| HL7 (iFlash) | `OBR-2` (placer) or `OBR-3` (filler) |
| ProLyte ASCII | `SAMPLE:` line |

---

## How results reach our app (dev vs production)

```text
  [Analyzer or simulator]
           │
           │  ASTM / HL7 / ASCII over TCP or serial
           ▼
  [Edge engine on lab PC]  ← listens on ports 5001, 5003, 5004, serial for ProLyte
           │
           │  stores in SQLite, syncs to cloud when online
           ▼
  [Web app Bench page]     ← you see results; authorizer releases
```

**Check analyzers are connected:** `GET http://localhost:3101/analyzers/status` (last accession, parse errors, listeners up).

**Manual test sends:**

```bash
pnpm --filter @drax-lis/simulators send:sysmex -- --barcode YOUR_ACCESSION
pnpm --filter @drax-lis/simulators send:mindray -- --barcode YOUR_ACCESSION
pnpm --filter @drax-lis/simulators send:iflash -- --barcode YOUR_ACCESSION
```

Default loop barcode: `DHDEMO0001` (demo patient Marlon Campbell if seeded).

Printer: **Zebra ZD411** → raw ZPL TCP **9100**. See [HARDWARE.md](./HARDWARE.md).

---

## Technical reference (implementers)

Confirm baud rates and LIS host settings against vendor manuals on site before cutover. Defaults below are for **local simulation**.

### Matrix

| ID (`analyzerId`) | Model | Discipline | Transport (sim first) | Application protocol | Default port / path |
| --- | --- | --- | --- | --- | --- |
| `sysmex_xs1000i` | Sysmex XS-1000i | Hematology (CBC) | TCP ASTM (+ PTY serial later) | ASTM E1381 + E1394 | TCP `5001` |
| `diamond_prolyte` | Diamond ProLyte | Electrolytes (ISE) | RS-232 serial (PTY sim) | Unidirectional multi-line ASCII | `PROLYTE_SERIAL_PATH` |
| `mindray_bs240` | Mindray BS-240 | Chemistry | TCP ASTM | ASTM E1394 (+ host query) | TCP `5003` |
| `yhlo_iflash1200` | YHLO iFlash 1200 | Immunoassay | TCP MLLP | HL7 v2.3.1 | TCP `5004` |

### Typical serial settings (verify on site)

| Instrument | Baud | Data | Parity | Stop | Flow |
| --- | --- | --- | --- | --- | --- |
| Sysmex XS series | 9600 (common) | 8 | None | 1 | — |
| Diamond ProLyte | **9600** (older firmware may default **1200** — confirm on UI) | 8 | None | 1 | None |
| Mindray BS-240 | 9600 / TCP | 8 | None | 1 | — |
| iFlash | TCP preferred | — | — | — | — |

ProLyte physical: DB9 female (RS-232 DTE). Null-modem or straight cable depending on host adapter gender. **Unidirectional** broadcast on sample complete — no ASTM ENQ/ACK.

### Sample message shapes (simulators)

#### Sysmex-like ASTM (E1394 text inside E1381 frames)

```
H|\^&|||XS-1000i^1.0|||||||P|E1394-97|20260125120000
P|1||PAT001||Doe^Jane||19900101|F
O|1|DH20260125001|^1^1|^^^CBC|R|20260125120000|||||N
R|1|^^^WBC|6.5|10*3/uL|4.0-11.0|N||F
R|2|^^^RBC|4.6|10*6/uL|3.8-5.5|N||F
L|1|N
```

#### iFlash-like HL7 ORU^R01 (MLLP-wrapped)

```
MSH|^~\&|YHLO|iFlash1200|||20260125120000||ORU^R01|MSG001|P|2.3.1
PID|1||PAT001||Doe^Jane||19900101|F
OBR|1|DH20260125001|DH20260125001|TSH^Thyroid Stimulating Hormone^YHLO
OBX|1|NM|TSH^TSH^YHLO||2.45|mIU/L|0.35-4.94|N|||F
```

#### Mindray-like ASTM chemistry

```
H|\^&|||BS-240^Mindray|||||||P|E1394-97|20260125120100
P|1||PAT002||Smith^John||19850505|M
O|1|DH20260125001|^1^1|^^^CHEM|R|20260125120100|||||N
R|1|^^^GLU|95|mg/dL|70-100|N||F
R|5|^^^AST|42|U/L|10-40|H||F
L|1|N
```

#### Diamond ProLyte ASCII (RS-232 block)

```
DATE: 2026-08-26  TIME: 08:30
SAMPLE: DH20260125001
Na+:  140.2  mmol/L
K+:     4.15 mmol/L
Cl-:  102.0  mmol/L
Li+:    0.85 mmol/L
```

Keys: `Na+/Na`, `K+/K`, `Cl-/Cl`, `Li+/Li` (Li optional). Line ends CRLF. Edge reassembles the block after `PROLYTE_BLOCK_IDLE_MS` quiet time (default 400ms).

### Edge env knobs

See [`apps/edge-engine/.env.example`](../apps/edge-engine/.env.example):

- `SYSMEX_TCP_PORT`, `MINDRAY_TCP_PORT`, `IFLASH_TCP_PORT`
- `PROLYTE_SERIAL_PATH`, `PROLYTE_BAUD` (default 9600), `PROLYTE_BLOCK_IDLE_MS` (default 400)
- `SYSMEX_SERIAL_PATH` (optional ASTM over serial)
- `ZEBRA_PRINTER_HOST`, `ZEBRA_PRINTER_PORT`

Ops: `GET /analyzers/status` for listen / last accession / last parse error.

### On-site checklist

- [ ] Capture vendor LIS interface PDFs for all four instruments
- [ ] Confirm whether each unit is serial, TCP client, or TCP server
- [ ] Note IP addresses / COM ports on the mini PC
- [ ] Confirm **where barcodes are scanned** for each line (IPU, loader, handheld — Sysmex rarely on-box)
- [ ] Capture a raw Wireshark / serial log of one real result each
- [ ] Align test code dictionaries (WBC vs instrument assay numbers)
- [ ] Confirm Zebra IP and label size (2×1 vs 4×2)

## Simulators (local dev)

In development, `apps/simulators` sends fake analyzer traffic on a ~30s loop. Simulators are **order-aware**: they fetch `orderedTestsJson` from edge and only emit analytes mapped to those catalog codes. Set `SIM_STRICT=1` to suppress traffic until the accession is registered.

Remap tables and examples: [MACHINE_TO_REQUEST_FORM.md](./MACHINE_TO_REQUEST_FORM.md). Implementation: `packages/catalog/src/test-fulfillment.ts`.

---

## Related docs

- [MACHINE_TO_REQUEST_FORM.md](./MACHINE_TO_REQUEST_FORM.md) — **remapping** machine output to request-form test names (plain English)
- [HARDWARE.md](./HARDWARE.md) — Zebra printer & Honeywell scanner at registration
- [LOCAL_DEV.md](./LOCAL_DEV.md) — register → print → simulate analyzer loop
- [GLOSSARY.md](./GLOSSARY.md) — more test code definitions
- [WORKFLOW.md](./WORKFLOW.md) — pending review and release
