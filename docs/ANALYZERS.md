# Analyzers — Drax Hall Clinical Laboratory

Four physical instruments. Confirm baud rates and LIS host settings against the vendor manuals on site before cutover. Defaults below are for **local simulation**.

Results from these instruments enter as **`pending_review`** until an authorizer releases them — see [WORKFLOW.md](./WORKFLOW.md).

## Matrix

| ID (`analyzerId`) | Model | Discipline | Transport (sim first) | Application protocol | Default port / path |
| --- | --- | --- | --- | --- | --- |
| `sysmex_xs1000i` | Sysmex XS-1000i | Hematology (CBC) | TCP ASTM (+ PTY serial later) | ASTM E1381 + E1394 | TCP `5001` |
| `diamond_prolyte` | Diamond ProLyte | Electrolytes (ISE) | RS-232 serial (PTY sim) | Unidirectional multi-line ASCII | `PROLYTE_SERIAL_PATH` |
| `mindray_bs240` | Mindray BS-240 | Chemistry | TCP ASTM | ASTM E1394 (+ host query) | TCP `5003` |
| `yhlo_iflash1200` | YHLO iFlash 1200 | Immunoassay | TCP MLLP | HL7 v2.3.1 | TCP `5004` |

Printer: **Zebra ZD411** → raw ZPL TCP **9100**. See [HARDWARE.md](./HARDWARE.md) for network setup, label geometry, and Honeywell wedge scanning at registration.

## Barcode / accession join

| Protocol | Field |
| --- | --- |
| ASTM E1394 | `O` record sample ID (field 3; may be `id^tray^cup`) |
| HL7 | `OBR-2` (placer) or `OBR-3` (filler) |
| ProLyte ASCII | `SAMPLE:` line (SEQ-xxx or scanned accession barcode) |

The LIS accession number printed on the tube **must** be what the analyzer sends back.

## Typical serial settings (verify on site)

| Instrument | Baud | Data | Parity | Stop | Flow |
| --- | --- | --- | --- | --- | --- |
| Sysmex XS series | 9600 (common) | 8 | None | 1 | — |
| Diamond ProLyte | **9600** (older firmware may default **1200** — confirm on UI) | 8 | None | 1 | None |
| Mindray BS-240 | 9600 / TCP | 8 | None | 1 | — |
| iFlash | TCP preferred | — | — | — | — |

ProLyte physical: DB9 female (RS-232 DTE). Null-modem or straight cable depending on host adapter gender. **Unidirectional** broadcast on sample complete — no ASTM ENQ/ACK.

## Sample message shapes (simulators)

### Sysmex-like ASTM (E1394 text inside E1381 frames)

```
H|\^&|||XS-1000i^1.0|||||||P|E1394-97|20260125120000
P|1||PAT001||Doe^Jane||19900101|F
O|1|DH20260125001|^1^1|^^^CBC|R|20260125120000|||||N
R|1|^^^WBC|6.5|10*3/uL|4.0-11.0|N||F
R|2|^^^RBC|4.6|10*6/uL|3.8-5.5|N||F
L|1|N
```

### iFlash-like HL7 ORU^R01 (MLLP-wrapped)

```
MSH|^~\&|YHLO|iFlash1200|||20260125120000||ORU^R01|MSG001|P|2.3.1
PID|1||PAT001||Doe^Jane||19900101|F
OBR|1|DH20260125001|DH20260125001|TSH^Thyroid Stimulating Hormone^YHLO
OBX|1|NM|TSH^TSH^YHLO||2.45|mIU/L|0.35-4.94|N|||F
```

### Mindray-like ASTM chemistry

```
H|\^&|||BS-240^Mindray|||||||P|E1394-97|20260125120100
P|1||PAT002||Smith^John||19850505|M
O|1|DH20260125001-CHEM|^1^1|^^^CHEM|R|20260125120100|||||N
R|1|^^^GLU|95|mg/dL|70-100|N||F
R|5|^^^AST|42|U/L|10-40|H||F
L|1|N
```

### Diamond ProLyte ASCII (RS-232 block)

```
DATE: 2026-08-26  TIME: 08:30
SAMPLE: DH20260125001
Na+:  140.2  mmol/L
K+:     4.15 mmol/L
Cl-:  102.0  mmol/L
Li+:    0.85 mmol/L
```

Keys: `Na+/Na`, `K+/K`, `Cl-/Cl`, `Li+/Li` (Li optional). Line ends CRLF. Edge reassembles the block after `PROLYTE_BLOCK_IDLE_MS` quiet time (default 400ms).

## Edge env knobs

See [`apps/edge-engine/.env.example`](../apps/edge-engine/.env.example):

- `SYSMEX_TCP_PORT`, `MINDRAY_TCP_PORT`, `IFLASH_TCP_PORT`
- `PROLYTE_SERIAL_PATH`, `PROLYTE_BAUD` (default 9600), `PROLYTE_BLOCK_IDLE_MS` (default 400)
- `SYSMEX_SERIAL_PATH` (optional ASTM over serial)
- `ZEBRA_PRINTER_HOST`, `ZEBRA_PRINTER_PORT`

Ops: `GET /analyzers/status` for listen / last accession / last parse error.

## On-site checklist

- [ ] Capture vendor LIS interface PDFs for all four instruments
- [ ] Confirm whether each unit is serial, TCP client, or TCP server
- [ ] Note IP addresses / COM ports on the mini PC
- [ ] Capture a raw Wireshark / serial log of one real result each
- [ ] Align test code dictionaries (WBC vs instrument assay numbers)
- [ ] Confirm Zebra IP and label size (2×1 vs 4×2)
