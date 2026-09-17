# MacBook lab field test — cheat sheet

Line-by-line essentials for testing a **real analyzer** with your MacBook as the edge PC.  
Full walkthrough: [LAB_MINI_PC_SETUP.md — ProLyte + Network LIS](./LAB_MINI_PC_SETUP.md#recommended-prolyte--network-lis-on-a-macbook).

---

## Analyzers and ports (edge listens on the Mac)

| Analyzer | Port | Protocol | Set on instrument |
| --- | --- | --- | --- |
| **Diamond ProLyte** (recommended first test) | **5002** | HTTP POST (Network LIS) | Host IP = Mac LAN IP, Port = **5002** |
| Sysmex XS-1000i | **5001** | ASTM over TCP | Host IP = Mac LAN IP, Port = **5001** |
| Mindray BS-240 | **5003** | ASTM over TCP | Host IP = Mac LAN IP, Port = **5003** |
| YHLO iFlash 1200 | **5004** | HL7 over TCP (MLLP) | Host IP = Mac LAN IP, Port = **5004** |
| **Web app (Bench)** | **3101** | Browser | Open on the Mac only — not configured on instruments |

**ProLyte rules (Network LIS):**

- Mac and ProLyte on the **same lab network** (USB‑C Ethernet into the ProLyte’s switch is best).
- Instrument menu: **Instrument Settings → LIS Setup → Network LIS** → Enabled, Host IP = Mac IP, Port = **5002**.
- Run **Test Network LIS** on the ProLyte before any sample.
- Sample ID on ProLyte = accession from the app (e.g. `DH202609160001`).
- Tick **ELECTROLYTES** on Accession before running the sample.

**Never use on the instrument:** `127.0.0.1` or `localhost` as host IP.

---

## Before you leave for the lab

- [ ] Repo on the Mac, `pnpm install` already done
- [ ] USB‑C Ethernet dongle + patch cable (recommended)
- [ ] Mac firewall: allow **5002** and **3101**, or turn firewall off for the test hour

---

## At the lab — do in order

### 1. Start the app

**At the lab (real ProLyte)** — no fake analyzers spamming the terminal:

```bash
cd /path/to/medical-lab-app-monorepo
pnpm dev:local:lab
```

**At home (full local stack + fake machines every 30s):**

```bash
pnpm dev:local
```

Leave this terminal open. Wait until edge and web are up.

### 2. Get your Mac’s LAN IP

```bash
ipconfig getifaddr en0
```

Wi‑Fi is usually `en0`. If that prints nothing, try:

```bash
ipconfig getifaddr en7
ipconfig getifaddr en5
```

Or list all interfaces:

```bash
ifconfig | grep "inet "
```

Write down the IP on the lab subnet (e.g. `192.168.1.87`). **This** goes in the ProLyte **Host IP** field.

### 3. Confirm edge is listening on the right ports

**ProLyte (today’s test):**

```bash
lsof -nP -iTCP:5002 -sTCP:LISTEN
```

**Web UI:**

```bash
lsof -nP -iTCP:3101 -sTCP:LISTEN
```

You should see `node` on each port. If empty, edge is not running or the port is blocked.

**Other analyzers (if testing later):**

```bash
lsof -nP -iTCP:5001 -sTCP:LISTEN   # Sysmex
lsof -nP -iTCP:5003 -sTCP:LISTEN   # Mindray
lsof -nP -iTCP:5004 -sTCP:LISTEN   # iFlash
```

**If port already in use:**

```bash
lsof -nP -iTCP:5002
```

Kill the conflicting process or stop the other app, then restart `pnpm dev:local`.

### 4. Confirm ProLyte listener in edge logs

In the terminal running edge, look for:

```text
diamond_prolyte Network LIS HTTP listener on 0.0.0.0:5002
```

### 5. Optional — quick POST test (Mac only, not the real instrument)

```bash
curl -X POST http://127.0.0.1:5002/ \
  -H 'Content-Type: application/json' \
  -d '{"pId":"PREFLIGHT1","sampleType":"10","ionData":{"Na":{"conc":"140.2","strUnits":"mmol/L"},"K":{"conc":"4.15","strUnits":"mmol/L"},"Cl":{"conc":"102.0","strUnits":"mmol/L"}}}'
```

Expect HTTP 200. Then check Bench for rows (patient may show `—` for this fake ID).

### 6. Open the app and accession

Browser:

```text
http://127.0.0.1:3101
```

- Sign in (local dev staff account).
- **Accession** a test patient.
- Tick **ELECTROLYTES** (or a panel that includes it).
- Copy the accession (e.g. `DH202609160001`).

### 7. Configure ProLyte and test the wire

On the instrument:

- Network LIS **On**
- Host IP = Mac IP from step 2
- Port = **5002**
- Tap **Test Network LIS** → must pass

Then enter the **same** accession as Sample ID and run serum or control.

### 8. Verify results arrived

- **Bench** — **three separate rows** for the ELECTROLYTES order: Sodium (Na), Potassium (K), Chloride (Cl), each status `pending_review`. One ProLyte POST carries all three ions; the app stores them as `ELECTROLYTES:NA`, `ELECTROLYTES:K`, and `ELECTROLYTES:CL` under the single ordered test.
- Edge log should show `(3 results)` for `diamond_prolyte`, not `(1 result)`.
- **Analyzer status (optional):**

```bash
curl -s http://127.0.0.1:3101/analyzers/status | python3 -m json.tool
```

Look for `diamond_prolyte` and `lastAccession` matching your sample ID.

---

## When you leave

- [ ] ProLyte Host IP → set back to **mini PC** IP (not the Mac)
- [ ] Stop `pnpm dev:local:lab` (`Ctrl+C`)
- [ ] Turn Mac firewall back on if you disabled it

---

## Quick fixes

| Problem | Command / action |
| --- | --- |
| Wrong or no IP | `ifconfig \| grep "inet "` — use the lab subnet address |
| Not listening | `lsof -nP -iTCP:5002 -sTCP:LISTEN` — restart `pnpm dev:local` |
| Test Network LIS fails | Mac firewall allow **5002**; use Ethernet dongle to ProLyte switch |
| **`EPROTO` on ProLyte** | Almost always **HTTPS vs HTTP mismatch** or **wrong network** — see below |
| No Bench rows | Sample ID must match accession; tick **ELECTROLYTES** on Accession |
| POST arrived but no Bench rows | You ran **QC/control** (`sampleType` 5/6/7) — app ignores those. Re-run as **Serum (02)** or **Whole Blood (10)** with the same specimen ID |
| Edge log missing listener | Ensure `PROLYTE_NETWORK_LIS_ENABLED` is not `false`; restart edge |

### ProLyte shows `EPROTO`

Our app listens on **plain HTTP** only (not HTTPS/TLS). The ProLyte manual’s sample server is also a plain **HTTP POST** listener.

1. **On ProLyte → LIS Setup → Network LIS**  
   - **Communication protocol / method** = **HTTP** (not HTTPS, not SSL, not “secure”)  
   - Host IP = Mac **lab** IP (e.g. `192.168.1.87`) — **not** `127.0.0.1`  
   - Port = **5002**

2. **Mac must be on the same network as the ProLyte**  
   - If `ipconfig getifaddr en0` shows **`172.20.10.x`**, you are on a **phone hotspot**, not the lab switch. The ProLyte cannot reach that.  
   - Plug **USB‑C Ethernet** into the **same switch** as the ProLyte, turn off Wi‑Fi/hotspot, run `ipconfig getifaddr en7` (or `ifconfig \| grep inet`) until you see **`192.168.x.x`** (or whatever the lab uses).

3. **Prove HTTP from the lab side** (on the Mac, after you have the lab IP):

   ```bash
   curl -X POST http://YOUR_LAB_IP:5002/ \
     -H 'Content-Type: application/json' \
     -d '{"pId":"TEST","sampleType":"10","ionData":{"Na":{"conc":"140","strUnits":"mmol/L"},"K":{"conc":"4","strUnits":"mmol/L"},"Cl":{"conc":"102","strUnits":"mmol/L"}}}'
   ```

   Expect `200`. Then run **Test Network LIS** on the ProLyte again.

4. **Mac firewall** — allow incoming **5002** for Node, or disable firewall briefly for the test.
