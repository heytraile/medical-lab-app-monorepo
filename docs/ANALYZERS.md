# Analyzers — Drax Hall Clinical Laboratory

Four physical instruments. Confirm baud rates and LIS host settings against the vendor manuals on site before cutover. Defaults below are for **local simulation**.

## Matrix

| ID (`analyzerId`) | Model | Discipline | Transport (sim first) | Application protocol | Default port / path |
| --- | --- | --- | --- | --- | --- |
| `sysmex_xs1000i` | Sysmex XS-1000i | Hematology (CBC) | TCP ASTM (+ PTY serial later) | ASTM E1381 + E1394 | TCP `5001` |
| `diamond_prolyte` | Diamond ProLyte | Electrolytes (ISE) | PTY serial | ASCII delimited (ASTM fallback) | `PROLYTE_SERIAL_PATH` |
| `mindray_bs240` | Mindray BS-240 | Chemistry | TCP ASTM | ASTM E1394 (+ host query) | TCP `5003` |
| `yhlo_iflash1200` | YHLO iFlash 1200 | Immunoassay | TCP MLLP | HL7 v2.3.1 | TCP `5004` |

Printer: Zebra thermal → raw ZPL TCP **9100**.

## Barcode / accession join

| Protocol | Field |
| --- | --- |
| ASTM E1394 | `O` record sample ID (field 3; may be `id^tray^cup`) |
| HL7 | `OBR-2` (placer) or `OBR-3` (filler) |

The LIS accession number printed on the tube **must** be what the analyzer sends back.

## Typical serial settings (verify on site)

| Instrument | Baud | Data | Parity | Stop |
| --- | --- | --- | --- | --- |
| Sysmex XS series | 9600 (common) | 8 | None | 1 |
| ProLyte | vendor sheet | — | — | — |
| Mindray BS-240 | 9600 / TCP | 8 | None | 1 |
| iFlash | TCP preferred | — | — | — |

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

## Edge env knobs

See [`apps/edge-engine/.env.example`](../apps/edge-engine/.env.example):

- `SYSMEX_TCP_PORT`, `MINDRAY_TCP_PORT`, `IFLASH_TCP_PORT`
- `PROLYTE_SERIAL_PATH` (empty until Phase 1 serial)
- `ZEBRA_PRINTER_HOST`, `ZEBRA_PRINTER_PORT`

## On-site checklist

- [ ] Capture vendor LIS interface PDFs for all four instruments
- [ ] Confirm whether each unit is serial, TCP client, or TCP server
- [ ] Note IP addresses / COM ports on the mini PC
- [ ] Capture a raw Wireshark / serial log of one real result each
- [ ] Align test code dictionaries (WBC vs instrument assay numbers)
- [ ] Confirm Zebra IP and label size (2×1 vs 4×2)
