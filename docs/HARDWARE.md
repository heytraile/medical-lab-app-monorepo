# Hardware — registration desk & label printer

Peripheral setup for accessioning at Drax Hall Clinical Laboratory. The edge engine drives printing; the web UI is scan-first for Honeywell wedge input.

## Zebra ZD411 (tube labels)

| Setting | Value |
| --- | --- |
| Model | Zebra **ZD411** (203 DPI direct thermal) |
| Media | 2" × 1" lab labels (recommended default) |
| Language | **ZPL** (disable EPL if prompted) |
| Network | Static IP on lab LAN (Wi‑Fi or Ethernet module) |
| Print path | Raw TCP **port 9100** from edge-engine |

### Supported label sizes (203 DPI)

Configure with `LABEL_SIZE_ID` on edge-engine, or override with `LABEL_WIDTH_DOTS` / `LABEL_HEIGHT_DOTS`.

| `LABEL_SIZE_ID` | Physical size | Dots (W×H) | Typical use |
| --- | --- | --- | --- |
| **`tube_2x1`** (default) | 2" × 1" | 406 × 203 | Standard blood/urine tube |
| `tube_2x0_5` | 2" × 0.5" | 406 × 102 | Small cap labels |
| `tube_4x2` | 4" × 2" | 812 × 406 | Large container / bench jar |

Most labs standardize on **one stock size** per draw station. Drax Hall default: **`tube_2x1`**.

Text that does not fit is truncated/wrapped in ZPL and the UI preview shows the same lines (with `+N` when tests overflow).

### Network setup

1. Print a network config label from the printer (hold **Feed** on power-up or use Zebra Setup Utilities).
2. Assign a static IP on the lab subnet (e.g. `192.168.10.50`).
3. Confirm reachability from the edge host: `nc -zv <printer-ip> 9100`.
4. Set Doppler / edge env:
   - `ZEBRA_PRINTER_HOST` — printer IP or hostname
   - `ZEBRA_PRINTER_PORT` — `9100` (default)
   - `LABEL_SIZE_ID=tube_2x1` — preset (`tube_2x1`, `tube_2x0_5`, `tube_4x2`)
   - `LABEL_WIDTH_DOTS=406` — 2" at 203 DPI (optional override)
   - `LABEL_HEIGHT_DOTS=203` — 1" at 203 DPI (optional override)
   - `LABEL_COPIES=1` — default copies per job

### Label content

Each specimen label includes:

- **Code 128** linear barcode (primary for analyzers)
- **Data Matrix** 2D code (same accession payload; Honeywell 1900G-HD HD reads 2D)
- Human-readable: accession, patient name, DOB, ordered tests, tube type, print timestamp

The accession (`DH{YYYYMMDD}{####}`) is the barcode value analyzers must echo back — see [ANALYZERS.md](./ANALYZERS.md).

### Alignment test

From the web **Labels** page, use **Test label** to print a sample ZPL job without registering a specimen. Adjust media calibration on the printer if bars are clipped.

### Local dev (fake printer)

Simulators expose a fake Zebra listener on `127.0.0.1:9100` and log received ZPL to the terminal. No physical printer required.

```bash
pnpm --filter @drax-lis/simulators dev
```

---

## Honeywell 1900G-HD (registration scanner)

| Setting | Value |
| --- | --- |
| Model | Honeywell **1900G-HD** (2D imager) |
| Connection | USB to registration PC |
| Mode | **USB HID keyboard wedge** (default) |
| Suffix | **Enter** (CR) after each scan |

No vendor driver is required on the workstation. The scanner types characters as keystrokes; the web app detects rapid input terminated by Enter.

### Where to scan

| Page | Scan target | Behavior |
| --- | --- | --- |
| **Register** | Patient MRN | Selects patient from local registry |
| **Register** | Existing accession | Redirects to **Labels** for reprint / verify |
| **Labels** | Accession barcode | Loads preview + enables reprint |

Analyzer-side Honeywell scanners (if present) talk to the instrument LIS host — separate from the registration desk wedge.

### Troubleshooting

- **Scans typed into wrong field** — focus the scan field (Register / Labels auto-focus it).
- **Double characters** — disable “USB COM” mode; use keyboard wedge only.
- **No Enter suffix** — configure suffix CR in Honeywell configuration utility.

---

## API reference (edge)

| Endpoint | Purpose |
| --- | --- |
| `GET /print/status` | TCP connect test to Zebra |
| `POST /print/preview` | Build ZPL + field preview without printing |
| `POST /print/label` | Print from full payload |
| `POST /print/reprint` | Load specimen from DB by accession, print |
| `POST /print/test` | Alignment / connectivity test label |

---

## Related docs

- [LOCAL_DEV.md](./LOCAL_DEV.md) — register → print → analyze loop
- [ANALYZERS.md](./ANALYZERS.md) — barcode join on instruments
