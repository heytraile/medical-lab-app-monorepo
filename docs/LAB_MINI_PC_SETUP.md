# Lab mini PC setup — start to finish (Drax Hall)

**Who this is for:** whoever is standing in the lab with a fresh Ubuntu mini PC, a router, a USB serial hub, analyzers, and a label printer — and needs the whole thing working before staff can use the app.

**Starting point:** Ubuntu is already installed on the mini PC. You can log in at the desk with a keyboard and monitor, or over the network.

**End point:** staff open the app in a browser, register patients, print labels, machines send results, bench review works, cloud sync runs.

**Related docs:**

- [EDGE_SECURITY_AND_BACKUP.md](./EDGE_SECURITY_AND_BACKUP.md) — security, backups, go-live security checklist
- [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md) — how staff sign in, who can use the cloud app, device enrollment
- [ANALYZERS.md](./ANALYZERS.md) — what each machine speaks and how barcodes join
- [HARDWARE.md](./HARDWARE.md) — Zebra printer and Honeywell scanner at registration
- [LOCAL_DEV.md](./LOCAL_DEV.md) — laptop local run (also used for MacBook field tests)
- [GLOSSARY.md](./GLOSSARY.md) — longer acronym list

**Quick jump:** [MacBook cheat sheet (ports + commands only)](./MACBOOK_FIELD_TEST.md) · [ProLyte + Network LIS walkthrough](#recommended-prolyte--network-lis-on-a-macbook) · [Other analyzers (TCP)](#alternative-tcp-machines-sysmex-mindray-iflash)

---

## Plain summary — what you are building

The **mini PC** is the **edge** computer. It runs one Docker container that includes:

| Piece | What it does |
| --- | --- |
| **Edge engine** | NestJS app — talks to machines, stores today’s work in SQLite |
| **Web UI** | Staff app in the browser (same PC serves it on port **3101**) |
| **Socket.IO** | Live bench updates in the browser |
| **SQLite database** | Local file `/data/edge.db` — patients, specimens, results, sync queue |
| **Backup folder** | Copy of the database every 30 minutes in `/backups` |

The mini PC **listens** for three analyzers over **TCP** (network):

| Machine | Port on mini PC | Protocol |
| --- | --- | --- |
| Sysmex XS-1000i (CBC) | **5001** | ASTM over TCP |
| Mindray BS-240 (chemistry) | **5003** | ASTM over TCP |
| YHLO iFlash 1200 (immuno) | **5004** | HL7 over TCP (MLLP) |

The **Diamond ProLyte** (electrolytes) supports **two LIS paths** in this app:

| Path | Transport | Default |
| --- | --- | --- |
| **Network LIS** | HTTP POST over LAN (port **5002**) | **On** — use for MacBook field tests and Ethernet/Wi‑Fi ProLyte |
| **Serial LIS** | RS-232 via USB serial hub (`/dev/prolyte`) | Optional — mini PC with DB9 cable |

Network LIS is **not** Sysmex-style TCP ASTM. The ProLyte POSTs JSON to your host IP:port.

The **Zebra label printer** has its own IP on the network. The mini PC **connects to the printer** on port **9100** to send label commands (ZPL).

The **cloud** (hosted API + Supabase) is separate. The mini PC syncs to it over the internet when online. That is **not** a substitute for local backups — see [EDGE_SECURITY_AND_BACKUP.md](./EDGE_SECURITY_AND_BACKUP.md).

---

## Glossary — every acronym you will see

Read this once. Refer back when a step uses a term.

| Term | What it means | Why we care | How we use it here |
| --- | --- | --- | --- |
| **IP address** | A number identity on the network, e.g. `192.168.1.50` | Devices find each other | Mini PC, printer, and instruments need stable IPs |
| **Static IP** | IP that never changes | Bookmarks and machine configs stay valid | Set on router (DHCP reservation) or on the PC |
| **DHCP** | Dynamic Host Configuration Protocol — router hands out IPs automatically | Convenient but IPs can change | We **reserve** one IP for the mini PC so it acts like static |
| **DNS** | Domain Name System — turns names into IPs | Humans use names instead of numbers | `drax-lis.local` → mini PC IP |
| **Hostname** | The PC’s name on the network, e.g. `drax-lis` | Easier than remembering IP | Set with `hostnamectl` |
| **mDNS / .local** | Multicast DNS — name broadcast on the LAN | `http://drax-lis.local:3101` works without a DNS server | Built into Ubuntu (Avahi) |
| **LAN** | Local Area Network — clinic wired/Wi‑Fi inside the building | Where the mini PC lives | Not exposed to the public internet |
| **Router** | Box that connects clinic devices to each other and to internet | You set DHCP reservations here | Give mini PC consistent IP |
| **Firewall** | Software that blocks unwanted network access | Stops random devices hitting the lab app | Ubuntu `ufw` — allow only what you need |
| **SSH** | Secure Shell — remote terminal over encrypted connection | Fix the PC from your desk without walking over | `ssh user@192.168.1.50` |
| **Ubuntu** | Linux operating system on the mini PC | What you installed | All terminal commands below assume Ubuntu |
| **Terminal** | Text window where you type commands | How you configure Linux | `Ctrl+Alt+T` on the mini PC |
| **sudo** | “Superuser do” — run one command as administrator | System changes need admin | Prefix commands with `sudo` |
| **Docker** | Runs the lab app in an isolated **container** | One command to start/stop the whole stack | Install once, then `docker compose up` |
| **Container** | A running package of the app + its dependencies | Same behavior on every install | The `lab` service in compose |
| **Compose** | Docker Compose — YAML file describing how to run containers | Defines ports, env vars, volumes | `infra/docker-compose.yml` |
| **Volume** | Docker-managed disk folder that survives container restarts | Database and backups persist | `edge-sqlite`, `edge-backups` |
| **Env var** | Environment variable — configuration key=value passed to the app | Secrets and IPs without editing code | `ZEBRA_PRINTER_HOST=192.168.1.60` |
| **TCP** | Transmission Control Protocol — reliable network connection | Analyzers connect to mini PC ports | Ports 5001, 5003, 5004 |
| **Port** | Numbered door on an IP address | Same IP, different services use different ports | `:3101` = web app, `:5001` = Sysmex |
| **RS-232 / Serial** | Old-school wired data cable (often DB9) | ProLyte sends results over a wire | USB serial adapter → `/dev/ttyUSB0` |
| **USB serial hub** | USB device with multiple RS-232 ports | Several serial machines on one PC | Shows up as `/dev/ttyUSB0`, `ttyUSB1`, … |
| **Baud rate** | Serial speed in bits per second | Wrong baud = garbage data | ProLyte default **9600** (sometimes 1200 on old units) |
| **8N1** | 8 data bits, No parity, 1 stop bit | Standard serial framing | Default for ProLyte |
| **Null-modem** | Crossed serial cable | Two “computers” talking serial need crossed TX/RX | May need one for ProLyte depending on adapter |
| **udev** | Linux device manager rules | Gives stable names like `/dev/prolyte` instead of random `ttyUSB` order | Rules file in `/etc/udev/rules.d/` |
| **ASTM** | Standard lab instrument message format | Sysmex and Mindray speak this | Edge parses E1381/E1394 frames |
| **HL7** | Health Level 7 — another lab message standard | iFlash uses this | Wrapped in MLLP for TCP |
| **MLLP** | Minimal Lower Layer Protocol — wraps HL7 with start/end bytes | iFlash TCP messages | Port 5004 |
| **ZPL** | Zebra Programming Language — label printer commands | Edge sends ZPL to printer | Port 9100 raw TCP |
| **Accession** | Lab’s unique ID for a specimen tube, e.g. `DH202603151234` | Barcode on label = what machines must echo back | Spine of the whole system |
| **PHI** | Protected Health Information — patient-identifiable data | Legal duty to protect | Lives in SQLite on mini PC |
| **Supabase** | Hosted database + login service in the cloud | Cloud API stores released results; admin/authorizer sign into the **cloud** app through it | Only needed on the separate **cloud** server — the mini PC never needs Supabase credentials |
| **JWT** | JSON Web Token — login session ticket | Browser sends it on each API call | The mini PC issues its **own** JWT at login — see [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md) |
| **CORS** | Cross-Origin Resource Sharing — browser security rule | Only your lab UI URL may call the API | `CORS_ORIGINS` env var |
| **SQLite** | Single-file embedded database | All local lab data | `/data/edge.db` in container |
| **WAL** | Write-Ahead Logging — SQLite mode for safer concurrent writes | Allows backup while app runs | Enabled automatically |
| **Outbox** | Queue of events waiting to sync to cloud | Offline-safe upload | Sync cron pushes to cloud API |
| **Edge sync token** | Shared secret between mini PC and cloud API | Proves sync requests are really from your lab | `EDGE_SYNC_TOKEN` — rotate from dev default |

---

## Overview — phases in order

Do these in order on the mini PC. Do **not** skip a phase because a later one “sounds optional” — later steps assume earlier ones worked.

| Phase | What | Time (rough) |
| --- | --- | --- |
| 1 | Plan IPs and names (mini PC + **every** analyzer + printer) | 30 min |
| 2 | Router: reserve mini PC IP | 15 min |
| 3 | Ubuntu: updates, hostname, SSH, timezone, firewall | 30 min |
| 4 | Install Docker | 20 min |
| 5 | Get the app code (clone or deploy package) | 15 min |
| 6 | Configure secrets and `.env` | 30 min |
| 7 | Wire **ProLyte** serial hub + udev rules + Docker device passthrough | 45 min |
| 8 | Configure **each TCP analyzer** (Sysmex, Mindray, iFlash) on the instrument menus | 1–2 hours (vendor menus) |
| 9 | Configure Zebra printer | 30 min |
| 10 | Build and start lab container, then **verify listeners** | 20 min first build |
| 11 | Staff PCs: browser + scanner | 20 min per desk |
| 12 | End-to-end test **per machine** | 1 hour |
| 13 | Security + backup checklist | See [EDGE_SECURITY_AND_BACKUP.md](./EDGE_SECURITY_AND_BACKUP.md) |

**Need a one-machine smoke test before the mini PC is ready?** Jump to [ProLyte + Network LIS on a MacBook](#recommended-prolyte--network-lis-on-a-macbook) (simplest live test). That path does **not** replace Phases 1–13 for go-live.

---

## Field visit — test one analyzer with only a MacBook

Use this when you walk into the lab with **only your MacBook** and want to prove **one** real instrument sends results into **this** app. You temporarily use the laptop as the “edge” computer. The mini PC install (Phases 1–13 above) is still required for production.

**Start here for the simplest live test:** [ProLyte + Network LIS](#recommended-prolyte--network-lis-on-a-macbook). The ProLyte POSTs JSON over the lab LAN — **no USB‑serial adapter, no ASTM/TCP client setup**. Sysmex, Mindray, and iFlash are covered later under [TCP machines](#alternative-tcp-machines-sysmex-mindray-iflash).

---

### Recommended: ProLyte + Network LIS on a MacBook

The **Diamond ProLyte** (electrolytes — sodium, potassium, chloride, optional lithium) is the **easiest machine to prove end-to-end** on a MacBook because:

- It uses **Network LIS** — HTTP **POST** to your Mac’s LAN IP on port **5002** (not Sysmex-style TCP ASTM).
- You do **not** need a RS‑232 cable or USB serial adapter for this path.
- One real serum sample (or control) is enough to see Na/K/Cl on **Bench**.

See also: [ANALYZERS.md — ProLyte](./ANALYZERS.md), [SPECIMEN_COLLECTION_GUIDE — Step D](./SPECIMEN_COLLECTION_GUIDE.md).

#### Full rules — ProLyte Network LIS (read before the visit)

| Rule | What it means |
| --- | --- |
| **Same network** | MacBook and ProLyte must reach each other on the **same LAN subnet** (same switch, or Wi‑Fi that can reach the instrument VLAN). A phone hotspot usually **will not** work — the ProLyte is wired to the lab switch. |
| **Host IP on the ProLyte** | Set to your Mac’s **LAN IP** (e.g. `192.168.1.87`) — **never** `127.0.0.1` or `localhost` (the instrument cannot reach those). |
| **Host port** | **5002** on both the ProLyte menu and the app (`PROLYTE_NETWORK_LIS_PORT`, default **5002**). |
| **Mac listens on all interfaces** | Edge binds `0.0.0.0:5002` by default (`PROLYTE_NETWORK_LIS_HOST`) so the ProLyte can POST from the network. |
| **Network LIS enabled in app** | `PROLYTE_NETWORK_LIS_ENABLED=true` (default). Do **not** set this to `false` unless you are testing serial instead. |
| **Sample ID (`pId`)** | Must match an accession you created in the app — e.g. `DH202609160001` or a tube ID like `DH202609160001-02`. Accession **or** specimen barcode both work. |
| **Order on Accession** | Tick **ELECTROLYTES** (or a panel that includes it, e.g. Executive I). Otherwise results may show **“Not ordered”** on Bench (still stored — see [ARCHITECTURE.md](./ARCHITECTURE.md)). |
| **Sample type** | Patient / control runs use normal sample types. Calibration-only POSTs (`sampleType` `00`–`07`) are **ignored** by design — use **Test Network LIS** or a real/control sample, not cal mode, to prove ingest. |
| **What the ProLyte sends** | JSON with `pId`, `sampleType`, and `ionData` (`Na`, `K`, `Cl`, optional `Li`). Edge maps ions → catalog **ELECTROLYTES** on Bench. |
| **What the ProLyte expects back** | HTTP **200** with `{ "ok": true }`. If the Mac firewall blocks port **5002**, **Test Network LIS** on the instrument will fail. |
| **Do not use simulators for this visit** | `pnpm … simulators send:prolyte` or curl from the Mac proves **your laptop**, not the **real ProLyte**. Use curl only as a pre-flight check that edge is listening. |
| **When you leave** | Set the ProLyte host IP back to the **production mini PC** (or previous value). Stop the local edge process. |

**You do not need a built-in Ethernet port on the MacBook** if:

1. Clinic Wi‑Fi and the ProLyte’s switch share the **same routable subnet**, **or**
2. You use a **USB‑C Gigabit Ethernet dongle** into the **same switch** as the ProLyte (most reliable).

Do **not** plug the ProLyte’s RS‑232 cable into the Mac for this test — that is the optional [serial fallback](#prolyte-on-a-macbook--rs-232-serial-optional-fallback) path.

#### Packing list — ProLyte + Network LIS

- [ ] MacBook with charger  
- [ ] Repo cloned; `pnpm install` already done from [LOCAL_DEV.md](./LOCAL_DEV.md)  
- [ ] **USB‑C Ethernet dongle** + short Cat6 patch cable (**strongly recommended**)  
- [ ] Lab staff contact — which switch the ProLyte Ethernet cable uses  
- [ ] ProLyte vendor LIS PDF (menu paths vary slightly by firmware)  
- [ ] Serum sample or control the bench will allow you to run (optional for wire-only Option 1 below)  
- [ ] **Not required:** USB‑C → RS‑232 adapter (Network LIS only)

#### Step-by-step — ProLyte Network LIS on a MacBook

Work through **A → J in order**. Check off each step before running a sample.

##### A. Get the Mac on the same network as the ProLyte

1. Ask which **switch/router port** the ProLyte’s Ethernet cable uses.  
2. **Preferred:** plug your **USB‑C Ethernet adapter** into that same switch. Turn **Wi‑Fi off** on the Mac while testing so traffic has one clear path.  
3. **Alternative:** join clinic Wi‑Fi only if IT confirms Wi‑Fi clients can reach the **wired instrument subnet** (many sites isolate instruments — if **Test Network LIS** fails on Wi‑Fi, use the dongle).

##### B. Find your MacBook’s LAN IP

```bash
# Wi‑Fi is often en0; USB Ethernet is often en7 or en5 — use the one with the lab subnet
ipconfig getifaddr en0
ipconfig getifaddr en7
```

Or: **System Settings → Network → (Ethernet or Wi‑Fi) → Details → TCP/IP → IP Address**.

Write it down, e.g. `192.168.1.87`. You will type this into **ProLyte → Network LIS → Host IP**.

##### C. Allow inbound ports on the Mac firewall

**System Settings → Network → Firewall** — either turn the firewall **Off** for the test hour, or allow incoming for **Node** on:

| Port | Why |
| --- | --- |
| **5002** | ProLyte Network LIS POSTs here |
| **3101** | Staff web UI (Bench) in the browser |

If **5002** is blocked, the ProLyte’s **Test Network LIS** button fails even when the menu looks correct.

##### D. Start the edge stack on the MacBook

From the repo (same as local dev — [LOCAL_DEV.md](./LOCAL_DEV.md)):

```bash
cd /path/to/medical-lab-app-monorepo
pnpm install   # if not already done
pnpm dev:local
```

Or, if you only need edge + web without the full stack:

```bash
pnpm --filter @drax-lis/edge-engine dev
# plus web in another terminal if you use that workflow
```

**Confirm Network LIS is listening** — in the edge terminal you should see:

```text
diamond_prolyte Network LIS HTTP listener on 0.0.0.0:5002
```

Also verify the port:

```bash
lsof -nP -iTCP:5002 -sTCP:LISTEN
```

You should see `node` owning **5002**.

**Optional pre-flight (from the Mac only — not a substitute for the real instrument):**

```bash
curl -X POST http://127.0.0.1:5002/ \
  -H 'Content-Type: application/json' \
  -d '{"pId":"PREFLIGHT1","sampleType":"10","ionData":{"Na":{"conc":"140.2","strUnits":"mmol/L"},"K":{"conc":"4.15","strUnits":"mmol/L"},"Cl":{"conc":"102.0","strUnits":"mmol/L"}}}'
```

Expect HTTP 200. Then open the UI:

```text
http://127.0.0.1:3101
```

Sign in with your usual local/dev staff account.

##### E. Configure the ProLyte — Network LIS menu

On the instrument (wording may vary — use the vendor PDF):

**Menu path (typical):** **Instrument Settings → LIS Setup → Network LIS**

| Setting | Value for MacBook field test |
| --- | --- |
| **Network LIS** | **Enabled** / On |
| **Host IP** / Server IP / LIS IP | Your Mac LAN IP from step **B** (e.g. `192.168.1.87`) |
| **Port** | **5002** |
| **Serial LIS** (if shown) | Can stay off for this test — we are not using the RS‑232 cable |
| **Protocol** | HTTP POST (JSON) — no URL path required; instrument POSTs to `/` on the host:port |

Save settings. Power-cycle the LIS interface if the manual says to.

##### F. Run **Test Network LIS** on the ProLyte

Before any sample:

1. On the ProLyte, tap **Test Network LIS** (or equivalent).  
2. **Pass:** instrument shows success / connected (exact message varies).  
3. **Fail:** fix **host IP**, **port 5002**, Mac firewall, or network path (steps **A–C**) before continuing.

If this test fails, a real sample will also fail — do not skip this step.

##### G. Accession in the app (order + sample ID)

**Option 2 (recommended — proves patient join on Bench):**

1. **Accession** a throwaway test patient.  
2. Tick **ELECTROLYTES** alone, or a panel that includes it (e.g. Executive I).  
3. Complete accession and note the number (e.g. `DH202609160001`). Copy **accession** or a **specimen ID** (`DH202609160001-02`) — you will enter the **same** string on the ProLyte as **Sample ID** / **`pId`**.  
4. You do **not** need cloud sync or a printed label for this test if you type the ID on the ProLyte keyboard.

**Option 1 (wire-only — no accession):** skip to step **H** with any sample ID (e.g. `FIELDTEST1`). Bench may show patient **`—`** — that still proves the wire works.

##### H. Run a sample on the ProLyte

Pick one path:

| Path | What you do | What it proves |
| --- | --- | --- |
| **Option 1 — Wire only** | Any sample ID on ProLyte; run control or patient sample | POST arrives; Na/K/Cl on Bench; patient may be `—` |
| **Option 2 — Matched accession (recommended)** | Enter the **same** accession/specimen ID from step **G**; run serum or control | Patient name on Bench + electrolyte values |
| **Option 3 — Full wet path** | Printed label, scan/type tube ID, real draw | Full clinical path — optional if Option 2 already passed |

On the ProLyte after the run completes, the instrument POSTs JSON to `http://<Mac-IP>:5002/`.

Watch the edge terminal for ingest lines. Open **Bench** — within seconds you should see rows for **ELECTROLYTES** (Na/K/Cl as separate components or grouped per UI).

##### I. Prove the app got good data

| Check | Option 1 (no accession) | Option 2 (matched accession) |
| --- | --- | --- |
| Something arrived | Bench shows new rows **or** edge logs show ProLyte ingest | Same |
| Patient on Bench | May be **`—`** — OK | Test patient name |
| Values | Match ProLyte screen (Na, K, Cl) | Same |
| Order alignment | May show **“Not ordered”** if you skipped electrolytes on Accession | No **“Not ordered”** badge if **ELECTROLYTES** was ticked |
| Status | `pending_review` | `pending_review` |

Optional API check:

```bash
curl -s http://127.0.0.1:3101/analyzers/status | python3 -m json.tool
```

Look for `diamond_prolyte` with recent `lastAccession` matching your sample ID.

##### J. When you leave the lab

1. On the ProLyte: set **Host IP** back to the **mini PC** LAN address (or the lab’s previous setting) — **not** your Mac.  
2. Run **Test Network LIS** once against the mini PC when it exists, or note “still pointing at Mac” for staff.  
3. Stop `pnpm dev:local` (or your edge process) on the Mac.  
4. Re-enable the Mac firewall if you turned it off.  
5. Photo or note the exact LIS menu path — helps [Phase 8](#phase-8--configure-tcp-analyzers-sysmex-mindray-iflash) and production cutover later.

#### ProLyte Network LIS — troubleshooting (MacBook)

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| **Test Network LIS** fails | Wrong Mac IP; firewall; VLAN isolation | Step **B** IP; allow **5002**; use USB‑C Ethernet to ProLyte switch |
| Test passes, no Bench rows | `pId` mismatch; empty/calibration POST | Sample ID must match accession; use patient/control sample type, not cal-only |
| Listener never starts | `PROLYTE_NETWORK_LIS_ENABLED=false` | Set `true` or unset; restart edge; grep logs for `Network LIS HTTP listener` |
| `EADDRINUSE` on 5002 | Another process on **5002** | `lsof -nP -iTCP:5002`; stop conflicting app |
| Values on Bench, patient `—` | ID never accessioned | Expected for Option 1; for Option 2, re-type exact `DH…` on ProLyte |
| **“Not ordered”** badge | Electrolytes not ticked on Accession | Re-accession with **ELECTROLYTES** or ignore badge for wire-only test |
| Edge log `ingest failed` | Rare parse/DB error | Read error line; ensure accession format is plain `DH…` without spaces |

---

### Alternative: TCP machines (Sysmex, Mindray, iFlash)

Use this section if you are testing **Sysmex**, **Mindray**, or **iFlash** instead of the ProLyte. Those three use **TCP** (ASTM or HL7), not ProLyte’s HTTP POST.

| Machine | MacBook test? | Port on Mac |
| --- | --- | --- |
| **Sysmex XS-1000i** | Yes | **5001** (ASTM) |
| **Mindray BS-240** | Yes | **5003** (ASTM) |
| **YHLO iFlash 1200** | Yes | **5004** (HL7/MLLP) |
| **Diamond ProLyte** | Yes — use [Network LIS above](#recommended-prolyte--network-lis-on-a-macbook) | **5002** (HTTP) — not TCP |

Do **not** USB-cable Sysmex/Mindray/iFlash into the Mac — they speak **TCP over the network**.

### Step-by-step — TCP machine (Sysmex, Mindray, or iFlash)

Pick **one** machine. Example below uses **Sysmex → port 5001**. Swap ports for Mindray (**5003**) or iFlash (**5004**).

#### A. Get on the same network as the analyzer

1. Ask lab staff which switch/router the analyzer’s Ethernet cable uses.  
2. Prefer: plug your **USB‑C Ethernet adapter** into that same switch. Disable Wi‑Fi on the Mac while testing so traffic has one clear path.  
3. Alternative: join clinic Wi‑Fi **only if** IT confirms Wi‑Fi clients can reach the analyzer VLAN/subnet (many clinics isolate wired instruments — if so, Wi‑Fi will fail and you need the dongle).

#### B. Find your MacBook’s LAN IP

```bash
# Wired (en0/en7/… — look for the interface that has the lab subnet)
ifconfig | grep -A4 "inet "
```

Or: **System Settings → Network → Ethernet (or Wi‑Fi) → Details → TCP/IP → IP Address**.

Write it down, e.g. `192.168.1.84`. This is the address you will type into the **analyzer’s LIS host** field — **not** `localhost`, not `127.0.0.1` (the instrument cannot reach those).

#### C. Allow inbound ports on the Mac firewall

**System Settings → Network → Firewall** — either turn the firewall **Off** for the test hour, or allow incoming for Node/Docker on:

| Machine under test | Port to allow |
| --- | --- |
| Sysmex | **5001** |
| Mindray | **5003** |
| iFlash | **5004** |
| Web UI (browser on same Mac) | **3101** |

If the firewall blocks the port, the instrument will look “configured” but **no results** will arrive.

#### D. Run the edge stack on the MacBook

From the repo (same as local development — see [LOCAL_DEV.md](./LOCAL_DEV.md)):

```bash
cd /path/to/medical-lab-app-monorepo
pnpm install
pnpm --filter @drax-lis/edge-engine dev
```

Or your usual `pnpm dev:local` if you already use that for day-to-day work.

Confirm the Mac is listening:

```bash
lsof -nP -iTCP:5001 -sTCP:LISTEN
# Mindray: 5003 · iFlash: 5004 · UI: 3101
```

You should see `node` (or Docker) owning that port.

Open the UI on the Mac:

```text
http://127.0.0.1:3101
```

Sign in (local/dev staff as you normally do on this laptop).

#### E. Point the instrument at your MacBook

On the **analyzer’s LIS / host / communication menu** (wording varies — bring the vendor PDF):

| Setting | Value for this test |
| --- | --- |
| Host / LIS / Server IP | **Your MacBook LAN IP** from step B (e.g. `192.168.1.84`) |
| Host port | **5001** (Sysmex) / **5003** (Mindray) / **5004** (iFlash) |
| Mode | Instrument is **client** → connects **to** the host (most common) |
| Protocol | Sysmex/Mindray: **ASTM**; iFlash: **HL7** |

Save. Power-cycle the instrument interface if the menu says to.

#### F. Get the instrument to send data (you do **not** need a real patient tube)

You are proving the **wire + parser**, not the whole clinical draw workflow. Pick the lightest option that staff will allow.

##### Option 1 — Fastest: no tube, no accession (unlinked results OK)

Goal: see **numbers land on Bench / in logs**, even if the patient shows as `—`.

1. On the instrument, use whatever it offers that still **transmits to the host**:
   - **Retransmit / resend** last completed result (very common).  
   - **QC / control** run that still goes online.  
   - **Communication / host test** send (if the menu has one).  
   - Manual **sample ID** entry + any stored result send.
2. For sample ID, type anything memorable (e.g. `FIELDTEST1`) — it does **not** have to exist in our app for this option.
3. Trigger the send.
4. On the Mac, watch:

   ```bash
   # in the edge terminal, or:
   # look for ingest / ASTM / HL7 / parse lines
   ```

   And open **Bench**. You should see new result rows. Patient may be **`—`** — that is **expected** when the ID was never accessioned. Still confirm:

   - Values look like real lab numbers (not empty / not garbage).  
   - Test codes map to sensible names on Bench.  
   - `GET /analyzers/status` updates `lastAccession` / clears parse errors.

This is enough to say: **“this machine is talking to our app cleanly.”**

##### Option 2 — No physical tube, but matched patient (recommended if you have 5 extra minutes)

Goal: same as Option 1, **plus** prove accession join (patient name on Bench).

1. In the app: **Accession** a throwaway test patient.  
2. Order tests that machine actually runs (CBC / chemistry / immuno).  
3. **You do not need to print a label or draw blood.** Copy the accession from the screen (e.g. `DH202609080001`).  
4. On the instrument / IPU: **type** that accession as the sample ID (or scan a printed label if someone already printed one).  
5. Send via **retransmit**, **QC**, or a short control run — still no patient tube required if the instrument will transmit with that ID.  
6. On Bench: patient name should **not** be `—`, and values should match the instrument screen.

##### Option 3 — Full wet path (optional)

Real or leftover QC material in a tube, printed label, scan at loader — only if you are already doing a clinical/QC run that day. Not required for a first connectivity visit.

**Do not** use `pnpm … simulators send:sysmex` for this field test. That fakes traffic **from the laptop**, so it never proves the **real** instrument.

#### G. Prove the app got good-looking data

| Check | Option 1 (no accession) | Option 2 (digital accession) |
| --- | --- | --- |
| Something arrived | Bench shows new rows **or** logs show ingest | Same |
| Patient on Bench | May be `—` — OK | Real test patient name |
| Values | Match instrument screen / last result printout | Same |
| Codes | Sensible catalog names, not raw junk | Same |
| Status | `pending_review` | `pending_review` |

Optional API check:

```bash
curl -s http://127.0.0.1:3101/analyzers/status
```

#### H. When you leave

1. Put the instrument’s LIS host IP **back** to the real mini PC address (or previous setting) so production is not left pointing at your laptop.  
2. Stop the local edge process.  
3. Note any menu path that worked (photo of the LIS screen helps Phase 8 later).

### ProLyte on a MacBook — RS-232 serial (optional fallback)

Use this **only** if Network LIS is unavailable (no Ethernet path, or firmware without Network LIS). The [Network LIS walkthrough above](#recommended-prolyte--network-lis-on-a-macbook) is simpler for a MacBook field test.

1. Set `PROLYTE_NETWORK_LIS_ENABLED=false`.  
2. Plug **USB‑C → RS‑232**; set `PROLYTE_SERIAL_PATH` (e.g. `/dev/cu.usbserial-*`), `PROLYTE_BAUD=9600`.  
3. Restart edge; confirm `ProLyte serial open on …`.  
4. On ProLyte: enable **Serial LIS** (not Network LIS); enter matching accession in `SAMPLE:` field; run sample; verify Na/K/Cl on Bench.

### What “accurate data” means for this smoke test

| Check | Pass |
| --- | --- |
| Payload arrived | Bench and/or edge logs show the send |
| Accession match (Option 2+) | Same `DH…` on app / instrument sample ID / Bench |
| Patient (Option 2+) | Not `—` on Bench |
| Values | Same numbers (within rounding) as the instrument screen or last result |
| Codes | Remapped to catalog names on Bench (see [MACHINE_TO_REQUEST_FORM.md](./MACHINE_TO_REQUEST_FORM.md)) — not raw garbage |
| Timing | Result appears within seconds–a minute of transmit |

If values appear but patient is `—`, the machine sent an ID that was never accessioned — fine for Option 1; for Option 2, fix typed/scanned ID, not the network.

---

## Phase 1 — Plan your network addresses

Before touching anything, write this on paper (or a photo of the whiteboard). You need a row for **every** device — not only the mini PC and ProLyte.

| Device | Suggested hostname | Example static IP | Notes |
| --- | --- | --- | --- |
| Mini PC (edge) | `drax-lis` | `192.168.1.50` | Web app: `http://192.168.1.50:3101` |
| Zebra ZD411 printer | `zebra` | `192.168.1.60` | Receives print jobs on port 9100 |
| Sysmex XS-1000i | — | `192.168.1.71` | **Client** → connects **to** mini PC `:5001` |
| Mindray BS-240 | — | `192.168.1.72` | **Client** → mini PC `:5003` |
| YHLO iFlash 1200 | — | `192.168.1.73` | **Client** → mini PC `:5004` |
| ProLyte | *(Network LIS)* | mini PC LAN IP, port **5002** | Or serial via USB hub — see Phase 7 |

Adjust the subnet to match your clinic router (might be `192.168.0.x` or `192.168.10.x` — check an existing PC’s IP with `ip addr` or Windows `ipconfig`).

### 1.1 Checklist before you leave Phase 1

- [ ] You know the **router admin URL** and who has the password.  
- [ ] You wrote the mini PC **MAC address** (Phase 2 will need it).  
- [ ] Each TCP analyzer has (or will get) a **stable IP** on the **same subnet** as the mini PC.  
- [ ] You know which **switch port / wall jack** each analyzer uses.  
- [ ] You have (or will get) the **vendor LIS/interface PDF** for Sysmex, Mindray, iFlash, and ProLyte.  
- [ ] You know **where barcodes are scanned** for each line (IPU / loader / handheld) — see [ANALYZERS.md](./ANALYZERS.md).

### 1.2 Connection direction (read twice)

For TCP analyzers, the **mini PC is the server**. You configure each instrument’s LIS/host settings with:

- **Host IP** = mini PC IP (`192.168.1.50`)
- **Host port** = 5001 / 5003 / 5004 (per machine)

The instrument **initiates** the connection when it has results (or stays connected — depends on vendor).

ProLyte **Network LIS**: set instrument host IP to mini PC, port **5002**. **Serial path**: no IP — RS‑232 into mini PC (Phase 7).

---

## Phase 2 — Router: give the mini PC a consistent IP

You want the mini PC to always get the **same IP address** so instrument configs and staff bookmarks never break.

### Option A — DHCP reservation (recommended)

1. Open the router admin page (often `192.168.1.1` or `192.168.0.1` — sticker on router).
2. Log in (clinic IT credentials).
3. Find **DHCP** → **Address reservation** or **Static DHCP**.
4. Find the mini PC in the list of connected devices (or add by **MAC address**).

   **MAC address** = hardware network ID. On the mini PC:

   ```bash
   ip link show
   ```

   Look for `link/ether aa:bb:cc:dd:ee:ff` under your Ethernet or Wi‑Fi interface (`enp…` or `wl…`).

5. Reserve e.g. `192.168.1.50` for that MAC.
6. Reboot mini PC or run:

   ```bash
   sudo dhclient -r && sudo dhclient
   ```

7. Confirm:

   ```bash
   ip addr show
   ```

   You should see `inet 192.168.1.50/24` (your chosen IP).

**What this means:** the router always assigns the same IP to this PC. You did not “type the IP into the PC” — the router remembers “this MAC always gets .50”.

### Option B — Static IP on the PC itself (Netplan)

Use this if the router has no reservation feature. Replace values with yours.

```bash
sudo nano /etc/netplan/01-lab.yaml
```

Paste (example for wired Ethernet `enp1s0`):

```yaml
network:
  version: 2
  ethernets:
    enp1s0:
      dhcp4: no
      addresses:
        - 192.168.1.50/24
      routes:
        - to: default
          via: 192.168.1.1
      nameservers:
        addresses:
          - 192.168.1.1
          - 8.8.8.8
```

Apply:

```bash
sudo netplan apply
```

**What `netplan` means:** Ubuntu’s network configuration tool. `apply` activates the file.

Find your interface name:

```bash
ip -br link
```

---

## Phase 3 — Ubuntu basics on the mini PC

### 3.1 Update the system

```bash
sudo apt update
sudo apt upgrade -y
```

| Command | Meaning |
| --- | --- |
| `apt update` | Refresh the list of available packages |
| `apt upgrade -y` | Install all security and system updates; `-y` = yes to prompts |

### 3.2 Set hostname (friendly name)

```bash
sudo hostnamectl set-hostname drax-lis
```

Check:

```bash
hostnamectl
```

**What this does:** the PC’s name is now `drax-lis`. On many LANs you can reach it as **`http://drax-lis.local:3101`** (mDNS via Avahi — Ubuntu desktop usually has this; server installs may need `sudo apt install avahi-daemon`).

### 3.2b Optional — make `.local` name work everywhere

If `ping drax-lis.local` fails from another PC:

```bash
sudo apt install -y avahi-daemon
sudo systemctl enable --now avahi-daemon
```

**Avahi** broadcasts the name on the local network so other devices can resolve `drax-lis.local` without a DNS server.

### 3.3 Create a dedicated lab user (optional but tidy)

```bash
sudo adduser labadmin
sudo usermod -aG sudo labadmin
```

Log in as `labadmin` for day-to-day Docker work.

### 3.4 Enable SSH (remote support)

```bash
sudo apt install -y openssh-server
sudo systemctl enable --now ssh
```

From your laptop on the same network:

```bash
ssh labadmin@192.168.1.50
```

**SSH** = encrypted remote shell. IT can fix issues without visiting the bench.

### 3.5 Set timezone

```bash
sudo timedatectl set-timezone America/Jamaica
timedatectl
```

Accession numbers and logs use the correct local date.

### 3.6 Firewall (basic)

When the lab app is running, allow staff LAN access to the app and analyzer ports:

```bash
sudo ufw allow OpenSSH
sudo ufw allow from 192.168.1.0/24 to any port 3101 proto tcp
sudo ufw allow from 192.168.1.0/24 to any port 5001 proto tcp
sudo ufw allow from 192.168.1.0/24 to any port 5003 proto tcp
sudo ufw allow from 192.168.1.0/24 to any port 5004 proto tcp
sudo ufw enable
sudo ufw status
```

**`ufw`** = Uncomplicated Firewall. `192.168.1.0/24` means “any device on the 192.168.1.x subnet”. Adjust if your LAN differs.

Do **not** port-forward 3101 from the internet on the router.

---

## Phase 4 — Install Docker

Docker runs the lab app in a container so you do not install Node, pnpm, etc. directly on Ubuntu.

### 4.1 Official Docker install (one-liner script)

```bash
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 4.2 Let your user run Docker without sudo every time

```bash
sudo usermod -aG docker $USER
newgrp docker
```

Log out and back in if `newgrp` does not stick.

### 4.3 Verify

```bash
docker run hello-world
docker compose version
```

You should see “Hello from Docker!” and a compose version number.

---

## Phase 5 — Get the application code

On the mini PC (or build on a dev machine and copy the image — building on the mini PC is fine):

```bash
sudo apt install -y git
cd ~
git clone https://github.com/YOUR_ORG/medical-lab-app-monorepo.git
cd medical-lab-app-monorepo
```

Replace the URL with your real repository remote.

If you deploy via a release tarball instead of git, unpack it to e.g. `~/medical-lab-app-monorepo`.

---

## Phase 6 — Configure environment (secrets)

Create `infra/.env` on the mini PC (this file is **not** committed to git — it holds secrets):

```bash
cd ~/medical-lab-app-monorepo/infra
nano .env
```

Example contents — **replace every placeholder**:

```bash
# --- Cloud (hosted Nest API) ---
CLOUD_API_URL=https://api.your-clinic.example.com

# Shared secret — must match cloud API EDGE_SYNC_TOKEN (generate a long random string)
EDGE_SYNC_TOKEN=REPLACE_WITH_LONG_RANDOM_SECRET

# --- Staff login (see docs/EDGE_AUTH_AND_STAFF.md) ---
# Signs the mini PC's own login sessions. The mini PC does NOT need any
# Supabase credentials — staff sign in here entirely offline. Supabase only
# runs on the separate cloud server, for admin/authorizer remote login.
EDGE_JWT_SECRET=REPLACE_WITH_LONG_RANDOM_SECRET
# No demo/dev accounts on a real lab PC — the first admin is created once
# via the app's first-run screen (POST /staff/bootstrap-admin).
EDGE_STAFF_SEED=false

# --- Lab network ---
EDGE_NODE_ID=drax-hall-edge-1
CORS_ORIGINS=http://192.168.1.50:3101,http://drax-lis.local:3101

# --- Label printer ---
ZEBRA_PRINTER_HOST=192.168.1.60
ZEBRA_PRINTER_PORT=9100

# --- TCP analyzers (defaults match the app; set only if you change ports) ---
SYSMEX_TCP_PORT=5001
MINDRAY_TCP_PORT=5003
IFLASH_TCP_PORT=5004

# --- Serial (ProLyte on USB hub) — host path, mapped into container in Phase 7 ---
PROLYTE_NETWORK_LIS_ENABLED=true
PROLYTE_NETWORK_LIS_PORT=5002
PROLYTE_SERIAL_PATH=/dev/prolyte
PROLYTE_BAUD=9600

# --- Optional overrides ---
BACKUP_RETENTION_DAYS=7
```

Generate secrets on the mini PC (do not invent short passwords):

```bash
openssl rand -hex 32   # paste into EDGE_SYNC_TOKEN
openssl rand -hex 32   # paste into EDGE_JWT_SECRET (different value)
```

| Variable | Why |
| --- | --- |
| `CLOUD_API_URL` | Where the mini PC pushes sync events |
| `EDGE_SYNC_TOKEN` | Password proving sync is from your lab |
| `EDGE_JWT_SECRET` | Signs staff login sessions on this mini PC — **required**, generate your own, never reuse the dev default |
| `EDGE_STAFF_SEED` | Set `false` on a real lab PC so no demo accounts are created |
| `CORS_ORIGINS` | Must match exactly how staff open the app (IP or `.local` URL) |
| `ZEBRA_PRINTER_HOST` | Printer IP — edge connects **out** to it |
| `SYSMEX_TCP_PORT` / `MINDRAY_TCP_PORT` / `IFLASH_TCP_PORT` | Ports the mini PC **listens** on for each TCP analyzer |
| `PROLYTE_NETWORK_LIS_PORT` | HTTP port for Network LIS (default **5002**); set same port on ProLyte LIS menu |
| `PROLYTE_SERIAL_PATH` | Stable serial device name (Phase 7 — optional if using Network LIS) |

**Generate a sync token and a JWT secret** (run twice — they must be **different** values):

```bash
openssl rand -hex 32
```

Copy the first output into `EDGE_SYNC_TOKEN` here **and** in your cloud API secrets (Doppler/hosting) — both sides must match. Copy the second output into `EDGE_JWT_SECRET` here **only** — the mini PC is the only place that ever needs it.

### Hosted Supabase one-time setup

This part happens on the **cloud** side (wherever `apps/api` and the hosted Supabase project live), not on the mini PC — but it must be done once before any admin/authorizer can sign into the cloud app, so it's called out here:

1. `pnpm exec supabase link --project-ref <your-project-ref>` then `pnpm exec supabase db push` — this creates, among other things, the `custom_access_token_hook` Postgres function that blocks tech accounts from ever getting a cloud login (see [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md#the-auth-hook--a-second-lock-on-the-cloud-login-door)).
2. In the Supabase **dashboard** → **Authentication** → **Hooks**, enable **Custom Access Token** and point it at `public.custom_access_token_hook` — pushing the migration creates the function, but hosted projects require this one manual toggle (local dev enables it automatically via `supabase/config.toml`).
3. Confirm: sign into the cloud app as a tech — it must fail with a "cloud login is restricted to admin and authorizer accounts" message even with the correct password.

---

## Phase 7 — Serial hub: ProLyte (and optional Sysmex serial)

This phase covers **ProLyte RS‑232 serial** (USB hub on the mini PC). If the ProLyte uses **Network LIS over LAN** instead, configure the instrument to POST to the mini PC IP on port **5002** (see env above) — **Phase 7 serial wiring is optional** in that case. Sysmex / Mindray / iFlash are configured in **Phase 8** (TCP).

The **USB serial hub** (multi-port RS-232 adapter) lets the ProLyte talk to the mini PC over a cable.

### 7.1 Physical wiring

1. Hub plugs into mini PC via **USB**.
2. ProLyte RS-232 cable plugs into **one hub port**.
3. Use the correct cable type (**null-modem** vs straight) — if you see no data or garbage, swap cable type. See [ANALYZERS.md](./ANALYZERS.md).
4. Power on ProLyte after the PC is up.

### 7.2 See what Linux detected

Plug the hub in, then:

```bash
dmesg | tail -30
ls -l /dev/ttyUSB*
```

| Command | Meaning |
| --- | --- |
| `dmesg` | Kernel log — shows USB devices as they attach |
| `ls -l /dev/ttyUSB*` | Lists serial port device files (`ttyUSB0`, `ttyUSB1`, …) |

If nothing appears, try another USB port or `sudo apt install -y setserial`.

### 7.3 Stable names with udev (do not skip this)

USB port order can change after reboot. **`/dev/ttyUSB0` today might be `/dev/ttyUSB1` tomorrow.** Fix with udev rules tied to the adapter’s **USB serial number** or **physical port path**.

Find identifiers:

```bash
udevadm info -a -n /dev/ttyUSB0 | less
```

Look for a line like `ATTRS{serial}=="ABC123"` or a unique `KERNELS` path.

Create a rule:

```bash
sudo nano /etc/udev/rules.d/99-lab-serial.rules
```

Example — **edit IDs to match your hardware**:

```
# Diamond ProLyte — replace serial with yours from udevadm
SUBSYSTEM=="tty", ATTRS{serial}=="PROLYTE_HUB_PORT1", SYMLINK+="prolyte", GROUP="dialout", MODE="0660"

# Optional: Sysmex on serial instead of TCP
# SUBSYSTEM=="tty", ATTRS{serial}=="SYSMEX_HUB_PORT2", SYMLINK+="sysmex-serial", GROUP="dialout", MODE="0660"
```

Reload rules and trigger:

```bash
sudo udevadm control --reload-rules
sudo udevadm trigger
ls -l /dev/prolyte
```

You want `/dev/prolyte` → stable symlink to the real `ttyUSBx`.

Add your user to the `dialout` group (serial port access):

```bash
sudo usermod -aG dialout $USER
newgrp dialout
```

### 7.4 Quick serial sniff test (optional)

Install a monitor:

```bash
sudo apt install -y minicom
sudo minicom -D /dev/prolyte -b 9600
```

Run a sample on the ProLyte. You should see text lines including `SAMPLE: DH…`. Exit minicom: `Ctrl+A`, then `X`.

**9600 baud** is default; if garbage, try **1200** (`PROLYTE_BAUD=1200` in env).

### 7.5 Pass serial device into Docker

The stock `docker-compose.yml` does **not** yet include serial passthrough. Create an override file:

```bash
cd ~/medical-lab-app-monorepo/infra
nano docker-compose.override.yml
```

```yaml
services:
  lab:
    devices:
      - /dev/prolyte:/dev/prolyte
    environment:
      PROLYTE_SERIAL_PATH: /dev/prolyte
      PROLYTE_BAUD: "9600"
      PROLYTE_BLOCK_IDLE_MS: "400"
```

**What `devices:` does:** gives the container direct access to that host serial port file.

If you use Sysmex serial as well, add `/dev/sysmex-serial` the same way and set `SYSMEX_SERIAL_PATH`.

---

## Phase 8 — Configure TCP analyzers (Sysmex, Mindray, iFlash)

Phase 7 covered **ProLyte (serial)** in detail. This phase covers the **other three machines** with the same level of care. Do **all three** before you call networking “done.”

You can set instrument menus **before** the Docker container is up (Phase 10). You **cannot** fully prove they work until the mini PC is listening — that proof is in **Phase 10.4** and **Phase 12**.

Bring each vendor’s **LIS / host interface** PDF. Menu names below are typical English labels; the screen may say “Host computer”, “LIS”, “Data manager”, “Online”, or “Communication”.

### 8.0 Shared pattern (all three TCP machines)

For **each** of Sysmex, Mindray, and iFlash, complete this checklist:

1. **Physical:** Analyzer Ethernet cable → lab switch → same LAN as mini PC.  
2. **Instrument IP:** Give the analyzer a **static IP** from Phase 1 (or a DHCP reservation on the router).  
3. **Ping test from mini PC** (after the instrument has an IP):

   ```bash
   ping -c 3 192.168.1.71   # Sysmex example — use Mindray/iFlash IPs for the others
   ```

4. **LIS host on the instrument:**

   | Setting on instrument | Value |
   | --- | --- |
   | LIS / host / server IP | Mini PC IP — e.g. `192.168.1.50` |
   | LIS host port | Sysmex **5001**, Mindray **5003**, iFlash **5004** |
   | Mode | **Client** (instrument connects **to** host) — most common for our listeners |
   | Protocol | Sysmex / Mindray: **ASTM**; iFlash: **HL7** (often with MLLP) |

5. **Barcode / sample ID:** whatever staff scan or type must equal the **accession on the tube label** (`DH…`). See [ANALYZERS.md](./ANALYZERS.md).  
6. **Save** settings; reboot the instrument interface if the manual says so.  
7. **Do not** point two instruments at the same port.

### 8.1 Sysmex XS-1000i (CBC) → mini PC port **5001**

**What you are proving:** CBC results arrive tagged with the tube accession.

#### Physical / network

1. Confirm the Sysmex (or its network interface / IPU PC) has Ethernet to the lab switch.  
2. Set static IP e.g. `192.168.1.71` (or reserve that MAC on the router).  
3. From the mini PC: `ping -c 3 192.168.1.71`.

#### LIS / host menu (on Sysmex software / IPU — not always on the analyzer face)

Exact path varies; look for **Communication**, **Host**, **LIS**, or **Online settings**:

1. Set **host IP** = mini PC (`192.168.1.50`).  
2. Set **host port** = **5001**.  
3. Set protocol to **ASTM** (E1381/E1394 family) if asked.  
4. Enable **result send** / **real-time send** / **auto transmit** (whatever the menu calls “send results to host when done”).  
5. Save.

#### Where the barcode is scanned

On many XS installs, **there is no scanner on the analyzer box**. Staff scan the tube at the **Sysmex IPU PC** or **rack loader**. That scanned ID must be the accession from our label. If the IPU has its own “worklist” ID that is not `DH…`, Bench will show results under the wrong ID or as unlinked (`—`).

#### After Phase 10 (container running) — smoke check

```bash
ss -tlnp | grep 5001
# Run a CBC with accession DH… then:
docker compose --profile lab-prod logs -f lab | grep -i sysmex
```

Bench should show WBC/RBC/HGB/… for that accession.

---

### 8.2 Mindray BS-240 (chemistry) → mini PC port **5003**

**What you are proving:** chemistry analytes (glucose, creatinine, etc.) arrive with the correct accession.

#### Physical / network

1. Ethernet to lab switch; static IP e.g. `192.168.1.72`.  
2. From mini PC: `ping -c 3 192.168.1.72`.

#### LIS / host menu

On the Mindray control software / instrument communication screen:

1. Host IP = mini PC (`192.168.1.50`).  
2. Host port = **5003**.  
3. Protocol = **ASTM** (same family as Sysmex; different test codes).  
4. If the menu offers **host query** (“ask LIS what was ordered”), you may leave it on — our edge can answer when enabled — or start with **result send only** for first bring-up.  
5. Enable automatic transmit of completed results.  
6. Save.

#### Barcode

Usually at the Mindray **workstation or sample track**. Same golden rule: scanned ID = printed accession.

#### After Phase 10 — smoke check

```bash
ss -tlnp | grep 5003
docker compose --profile lab-prod logs -f lab | grep -i mindray
```

Bench should show chemistry codes remapped to catalog names (see [MACHINE_TO_REQUEST_FORM.md](./MACHINE_TO_REQUEST_FORM.md)).

---

### 8.3 YHLO iFlash 1200 (immunoassay) → mini PC port **5004**

**What you are proving:** immunoassay results (e.g. TSH) arrive over **HL7/MLLP**, not ASTM.

#### Physical / network

1. Ethernet to lab switch; static IP e.g. `192.168.1.73`.  
2. From mini PC: `ping -c 3 192.168.1.73`.

#### LIS / host menu

1. Host IP = mini PC (`192.168.1.50`).  
2. Host port = **5004**.  
3. Protocol = **HL7** (v2.x). Framing is **MLLP** (start/end bytes) — if the menu asks for MLLP / LLP, enable it.  
4. Enable ORU / result transmission to host.  
5. Optional host query (QRY): same note as Mindray — fine once basics work.  
6. Save.

#### Barcode

Typically at the iFlash **control software / rack loader**. Accession in the message usually appears in **OBR-2** or **OBR-3**.

#### After Phase 10 — smoke check

```bash
ss -tlnp | grep 5004
docker compose --profile lab-prod logs -f lab | grep -i iflash
```

---

### 8.4 Phase 8 exit checklist

- [ ] Sysmex: IP set, host=`miniPC:5001`, barcode path known, ping OK  
- [ ] Mindray: IP set, host=`miniPC:5003`, barcode path known, ping OK  
- [ ] iFlash: IP set, host=`miniPC:5004`, HL7/MLLP, barcode path known, ping OK  
- [ ] ProLyte: Phase 7 complete (`/dev/prolyte` exists)  
- [ ] Photos or notes of each LIS screen saved for troubleshooting  

Listener proof waits until **Phase 10.4**.

---

## Phase 9 — Zebra label printer

Follow [HARDWARE.md](./HARDWARE.md) for model-specific details. Do not skip steps.

### 9.1 Put the printer on the lab network

1. Power on the Zebra with label stock loaded.  
2. Print a **network configuration** label (often: hold **Feed** at power-on, or use Zebra Setup Utilities from a Windows laptop).  
3. Note the current IP (DHCP or factory).  
4. Set a **static IP** for the printer — e.g. `192.168.1.60` — on the **same subnet** as the mini PC (printer menu or Setup Utilities).  
5. Reboot printer; confirm the config label now shows `192.168.1.60`.

### 9.2 Prove the mini PC can reach the printer

From the mini PC:

```bash
ping -c 3 192.168.1.60
nc -zv 192.168.1.60 9100
```

| Command | Meaning |
| --- | --- |
| `ping` | Basic network reachability |
| `nc -zv` | “netcat, zero-I/O, verbose” — tests if **port 9100** (raw ZPL) is open |

If `nc` fails: wrong IP, printer offline, or a firewall between PC and printer.

### 9.3 Tell the app about the printer

In `infra/.env` (Phase 6):

```bash
ZEBRA_PRINTER_HOST=192.168.1.60
ZEBRA_PRINTER_PORT=9100
```

Label stock default: **2" × 1"** (`LABEL_SIZE_ID=tube_2x1` if you override).

Restart the lab container after changing env (Phase 10):

```bash
cd ~/medical-lab-app-monorepo/infra
docker compose --profile lab-prod up -d lab
```

### 9.4 Print a test label from the app

After the container is up and you can log in:

1. Open **Labels** in the browser.  
2. Click **Test label** (or print from a real accession).  
3. Confirm barcode scans back into an Accession / Labels field with a USB wedge scanner.

---

## Phase 10 — Build and start the lab container

From the repo:

```bash
cd ~/medical-lab-app-monorepo/infra
docker compose --profile lab-prod build lab
docker compose --profile lab-prod up -d lab
```

| Command | Meaning |
| --- | --- |
| `docker compose --profile lab-prod build lab` | Build the single-container lab image (first time takes several minutes) |
| `docker compose --profile lab-prod up -d lab` | Start in background (`-d` = detached) |

Watch logs:

```bash
docker compose --profile lab-prod logs -f lab
```

Look for:

- `[edge-engine] listening on http://localhost:3101`
- `Sysmex TCP listening on 0.0.0.0:5001` (and 5003, 5004)
- `ProLyte serial open on /dev/prolyte` (if serial configured)
- `SQLite backup written to /backups/...` (within 30 min)

You will **not** see any Supabase log line here — the mini PC never talks to Supabase directly. It only talks to your cloud API (`CLOUD_API_URL`), which is the thing that talks to Supabase.

### 10.1 Open the app

On any staff PC on the same LAN, browser:

```
http://192.168.1.50:3101
```

or

```
http://drax-lis.local:3101
```

Bookmark that URL on every registration and bench PC.

### 10.2 Create the first admin, then add the rest of the staff

The `Staff` table on a brand new mini PC is empty, so the app shows a **first-run** screen instead of a login form:

1. Open `http://drax-lis.local:3101` (or the IP) for the very first time.
2. Fill in the first admin's name, email, and a password. This calls `POST /staff/bootstrap-admin`, which works **without** logging in — but only this once. The instant that account exists, the same route refuses to create a second one.
3. Sign in as that admin, open **Staff**, and add every other staff member (techs, authorizers, more admins). Everyone signs in with email + password from then on — entirely offline, no internet needed. Dev tokens (`dev:tech`) **do not work** when hardening is on.
4. For each **admin or authorizer** who also needs the **cloud** app (to release results or manage the lab remotely from outside the lab), click **Issue cloud device** next to their name, and read them the resulting code. On the cloud app, they sign in with email + password, then enter that code once to enroll their laptop/computer. See [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md) for exactly how that works and why. **Techs cannot sign into the cloud app at all** — that's enforced on the server, not just hidden in the UI.

### 10.3 Auto-start after reboot

Docker starts on boot if enabled:

```bash
sudo systemctl enable docker
```

Compose does not auto-start unless you create a systemd unit. Simple approach — crontab reboot hook:

```bash
crontab -e
```

Add line:

```
@reboot cd /home/labadmin/medical-lab-app-monorepo/infra && /usr/bin/docker compose --profile lab-prod up -d lab
```

Or create `/etc/systemd/system/drax-lis.service` (cleaner — see appendix).

### 10.4 Verify analyzer listeners (do not skip)

Only after the container is **up**. This is the proof that Phase 8’s instrument settings have somewhere to connect.

```bash
ss -tlnp | grep -E '5001|5003|5004|3101'
```

| Port | Must show LISTEN | Machine |
| --- | --- | --- |
| **3101** | yes | Web UI |
| **5001** | yes | Sysmex |
| **5003** | yes | Mindray |
| **5004** | yes | iFlash |

| Command | Meaning |
| --- | --- |
| `ss -tlnp` | Show all TCP ports listening and which process owns them |

Serial (ProLyte) — confirm the symlink and that logs opened the port:

```bash
ls -l /dev/prolyte
docker compose --profile lab-prod logs lab | grep -i prolyte | tail -20
```

Expect a line like `ProLyte serial open on /dev/prolyte`. If you see `ProLyte serial skipped`, `PROLYTE_SERIAL_PATH` or the Docker `devices:` override is wrong (return to Phase 7.5).

Optional (requires a logged-in session / token when hardened):

```bash
curl -s http://localhost:3101/analyzers/status | jq
```

Each transport should show listening / last activity fields with no persistent parse errors.

---

## Phase 11 — Staff workstations (registration desk)

Not on the mini PC — on each desk PC:

1. **Browser:** Chrome or Edge → bookmark `http://drax-lis.local:3101` (or IP).
2. **Honeywell 1900G-HD scanner:** USB keyboard wedge mode — scans type into the focused field + Enter. See [HARDWARE.md](./HARDWARE.md).
3. **No VPN required** for local lab work — LAN only.
4. **Authorizers** working on-site use the same lab URL as everyone else. When working **off-site**, they use the separate cloud app URL instead, after enrolling their device once — see [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md).

---

## Phase 12 — End-to-end verification (walk out working)

Do this in order on go-live day:

### 12.1 Health

```bash
curl -s http://localhost:3101/health
```

Expect JSON with ok status.

### 12.2 Security (hardened)

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3101/patients
```

Expect **401** (login required).

Full checklist: [EDGE_SECURITY_AND_BACKUP.md](./EDGE_SECURITY_AND_BACKUP.md).

### 12.3 Register a test patient

1. Log in as tech.
2. **Register** → create provisional patient or scan MRN.
3. Register specimen → print label.
4. Confirm label prints with barcode `DH…`.

### 12.4 Run a sample on **each** analyzer (do not batch-skip)

Use a real or QC tube with a **registered** accession for that line. Complete all four — ticking one machine does not prove the others.

#### Sysmex (5001)

1. Accession + order CBC (or panel that includes CBC). Print label.  
2. Scan accession at Sysmex **IPU / loader**.  
3. Run sample.  
4. Confirm Bench shows CBC analytes for that accession.  
5. Logs: `docker compose --profile lab-prod logs -f lab | grep -i sysmex`

#### Mindray (5003)

1. Accession + order chemistry tests that Mindray runs.  
2. Scan at Mindray workstation / track.  
3. Run sample.  
4. Confirm Bench chemistry values.  
5. Logs: `… | grep -i mindray`

#### iFlash (5004)

1. Accession + order an immunoassay the iFlash runs (e.g. TSH).  
2. Scan at iFlash software / loader.  
3. Run sample.  
4. Confirm Bench shows the immunoassay result.  
5. Logs: `… | grep -i iflash`

#### ProLyte (serial)

1. Accession + order electrolytes.  
2. Enter/scan sample ID on ProLyte so `SAMPLE:` matches accession.  
3. Run sample.  
4. Confirm Na/K/Cl (and Li if enabled) on Bench.  
5. If nothing arrives: minicom sniff (Phase 7.4), baud 9600 vs 1200, null-modem cable.

Or watch all ingest:

```bash
docker compose --profile lab-prod logs -f lab | grep -i ingest
```

#### Accuracy check (same for every machine)

| Check | Pass |
| --- | --- |
| Accession | Matches label / Bench / instrument sample ID |
| Patient | Not `—` on Bench |
| Values | Match instrument screen/printout |
| Status | `pending_review` until submitted for release |

### 12.5 Analyzer status API

In browser (logged in): call `GET /analyzers/status` — each listener should show transport, last accession, no persistent parse errors. Cross-check against Phase 10.4.

### 12.6 Cloud sync

Ensure internet works. Check sync status (logged in): `GET /sync/status` or UI indicator. Cloud API logs should show accepted events.

### 12.7 Backup

```bash
docker compose --profile lab-prod exec lab ls -la /backups
```

At least one `edge-YYYYMMDD-HHMMSS.db` file within 30 minutes.

### 12.8 Restore drill (once, before real patients)

On a **copy** of a backup file, practice [restore-edge-db.sh](../infra/scripts/restore-edge-db.sh) — see [EDGE_SECURITY_AND_BACKUP.md](./EDGE_SECURITY_AND_BACKUP.md).

---

## Phase 13 — Security + backup checklist

Complete [EDGE_SECURITY_AND_BACKUP.md](./EDGE_SECURITY_AND_BACKUP.md) before real patients. At minimum:

- [ ] Hardened auth on (no open PHI APIs)  
- [ ] `EDGE_JWT_SECRET` / `EDGE_SYNC_TOKEN` are unique (not dev defaults)  
- [ ] Firewall rules from Phase 3.6 still correct  
- [ ] Backup volume has files; restore drill done once  

---

## Appendix — What happens when you plug in the ProLyte serial hub (timeline)

This is background for Phase 7 — not a substitute for the steps there.

1. **USB connect** — Linux kernel loads `usbserial` driver → creates `/dev/ttyUSB0`.
2. **udev rule** — renames to `/dev/prolyte` with correct permissions.
3. **Docker start** — override file passes `/dev/prolyte` into container.
4. **Edge engine start** — reads `PROLYTE_SERIAL_PATH=/dev/prolyte`, opens port at `PROLYTE_BAUD` (9600), 8N1.
5. **Idle listen** — driver waits for bytes from ProLyte.
6. **Sample completes** — ProLyte broadcasts ASCII block with `SAMPLE: DH202603151234` and electrolyte lines.
7. **Edge parses** — maps to analyte codes, joins to specimen by accession, stores results in SQLite, emits Socket.IO event to bench UI, queues cloud sync.
8. **If path wrong** — logs `ProLyte serial skipped` or open errors → fix udev / `devices:` mapping.

---

## Appendix — ProLyte Network LIS over LAN (timeline)

Use this path when the instrument is on Ethernet/Wi‑Fi (MacBook field test or production mini PC).

1. **Edge start** — HTTP server binds `PROLYTE_NETWORK_LIS_HOST:PROLYTE_NETWORK_LIS_PORT` (default `0.0.0.0:5002`).
2. **ProLyte LIS menu** — Network LIS enabled; host IP = lab PC or MacBook; port = **5002**.
3. **Sample completes** — ProLyte POSTs JSON (`pId`, `ionData.Na/K/Cl/Li`) to `http://<host>:5002/`.
4. **Edge parses** — `parseProlyteNetworkLis` → same ingest path as serial → Bench + SQLite + sync.
5. **Instrument expects** — HTTP **200** with `{ "ok": true }`; timeouts if host/firewall blocks port.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Browser “cannot connect” | Container down or firewall | `docker compose … ps`, check `ufw` |
| 401 on everything | Not logged in | Sign in at `/login` on the mini PC; if that fails, check `EDGE_JWT_SECRET` is set |
| Cloud login says "restricted to admin and authorizer accounts" | Signed-in account is a tech | Expected — techs never get cloud access, see [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md) |
| Cloud app keeps asking for an enrollment code | Browser/device not enrolled, or was revoked | Issue a fresh code from **Staff** on the mini PC |
| CORS error in browser console | Wrong `CORS_ORIGINS` | Must match exact URL in address bar (http vs https, IP vs name) |
| ProLyte no results (Network LIS) | Wrong host IP/port, firewall, accession mismatch | ProLyte **Test Network LIS**; Mac/PC firewall on **5002**; `pId` = app accession; edge log for `Network LIS HTTP listener` |
| ProLyte no results (serial) | Serial path, baud, cable | `dmesg`, `ls /dev/prolyte`, minicom test, null-modem; Phase 7 |
| Sysmex no results | Not pointing at PC IP:5001; barcode scanned elsewhere | Vendor LIS menu; `ss -tlnp \| grep 5001`; scan at IPU/loader; Phase 8.1 |
| Mindray no results | Not pointing at PC IP:5003 | Vendor LIS; `ss -tlnp \| grep 5003`; Phase 8.2 |
| iFlash no results | Not pointing at PC IP:5004; HL7/MLLP off | Vendor LIS; `ss -tlnp \| grep 5004`; Phase 8.3 |
| MacBook field test: no results | Firewall, wrong host IP (`127.0.0.1`), VLAN isolation | ProLyte: [Network LIS steps](#recommended-prolyte--network-lis-on-a-macbook) — USB‑C Ethernet to same switch; allow **5002**; host = Mac LAN IP. TCP analyzers: allow **5001/5003/5004** |
| Label does not print | Printer IP / port 9100 | `nc -zv printer-ip 9100`, `ZEBRA_PRINTER_HOST`; Phase 9 |
| Results local but not in cloud | `CLOUD_API_URL` / token / internet | Logs; verify `EDGE_SYNC_TOKEN` matches cloud |
| `ttyUSB` swapped after reboot | Missing udev rules | Phase 7.3 |
| Container cannot open serial | Missing `devices:` override | Phase 7.5 |

---

## Appendix A — Every Linux command used (quick reference)

| Command | Plain English |
| --- | --- |
| `ip link show` | Show network interfaces and MAC addresses |
| `ip addr show` | Show IP addresses assigned to this PC |
| `ip -br link` | Short list of interface names |
| `ping 192.168.1.1` | Send test packets to router — check connectivity |
| `ping drax-lis.local` | Test mDNS name resolution |
| `sudo hostnamectl set-hostname drax-lis` | Set the PC’s network name |
| `sudo apt update` | Refresh package lists |
| `sudo apt upgrade -y` | Install updates |
| `sudo apt install -y <pkg>` | Install software package |
| `sudo nano <file>` | Edit a text file in terminal |
| `sudo netplan apply` | Apply network configuration |
| `sudo ufw allow …` | Open firewall port |
| `sudo ufw enable` | Turn firewall on |
| `sudo ufw status` | Show firewall rules |
| `sudo usermod -aG docker $USER` | Allow user to run Docker |
| `newgrp docker` | Activate group change without logout |
| `docker run hello-world` | Test Docker install |
| `docker compose version` | Check Compose is installed |
| `git clone <url>` | Download repository |
| `dmesg \| tail -30` | Recent kernel / USB messages |
| `ls -l /dev/ttyUSB*` | List USB serial ports |
| `udevadm info -a -n /dev/ttyUSB0` | USB identifiers for udev rules |
| `sudo udevadm control --reload-rules` | Reload udev after rule change |
| `sudo udevadm trigger` | Re-apply udev rules |
| `sudo usermod -aG dialout $USER` | Allow serial port access |
| `minicom -D /dev/prolyte -b 9600` | Watch raw serial data |
| `ss -tlnp` | Show listening TCP ports |
| `nc -zv host 9100` | Test TCP connection to printer |
| `openssl rand -hex 32` | Generate random secret |
| `curl -s URL` | HTTP request in terminal |
| `docker compose --profile lab-prod build lab` | Build lab image |
| `docker compose --profile lab-prod up -d lab` | Start lab container |
| `docker compose --profile lab-prod logs -f lab` | Follow container logs |
| `docker compose --profile lab-prod exec lab ls /backups` | Shell command inside container |
| `crontab -e` | Edit scheduled tasks for current user |
| `ssh user@host` | Remote login |
| `sudo systemctl enable docker` | Start Docker on boot |

---

## Appendix B — systemd service (auto-start compose on boot)

Create:

```bash
sudo nano /etc/systemd/system/drax-lis.service
```

```ini
[Unit]
Description=Drax Hall lab edge container
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=labadmin
WorkingDirectory=/home/labadmin/medical-lab-app-monorepo/infra
ExecStart=/usr/bin/docker compose --profile lab-prod up -d lab
ExecStop=/usr/bin/docker compose --profile lab-prod down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable drax-lis.service
sudo systemctl start drax-lis.service
sudo systemctl status drax-lis.service
```

| Command | Meaning |
| --- | --- |
| `daemon-reload` | Reread service files |
| `enable` | Start on boot |
| `start` | Start now |
| `status` | Show running / failed |

---

## Appendix C — Port map (single page for IT)

| Port | Direction | Purpose |
| --- | --- | --- |
| **3101** | Inbound to mini PC | Web UI + edge API + WebSocket |
| **5001** | Inbound to mini PC | Sysmex ASTM TCP |
| **5003** | Inbound to mini PC | Mindray ASTM TCP |
| **5004** | Inbound to mini PC | iFlash HL7/MLLP TCP |
| **9100** | Outbound from mini PC → printer | ZPL label printing |
| **443** | Outbound from mini PC → internet | Cloud API + Supabase HTTPS |

---

## Appendix D — Files you will touch

| File | Purpose |
| --- | --- |
| `infra/.env` | Secrets and IPs (create locally, never commit) |
| `infra/docker-compose.override.yml` | Serial `devices:` passthrough (create locally) |
| `/etc/netplan/*.yaml` | Static IP (if not using DHCP reservation) |
| `/etc/udev/rules.d/99-lab-serial.rules` | Stable `/dev/prolyte` name |
| `/etc/systemd/system/drax-lis.service` | Auto-start on boot (optional) |

---

## When you walk out of the lab

- [ ] Mini PC has fixed IP or DHCP reservation; hostname resolves (`drax-lis.local` or IP bookmark).
- [ ] Docker lab container running; logs clean.
- [ ] First admin created via the first-run screen; all other staff added from **Staff**.
- [ ] Staff can log in at `http://…:3101`.
- [ ] Every admin/authorizer who needs remote access has enrolled a cloud device — see [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md).
- [ ] Test accession: register → label prints → all four lines produce results in bench review.
- [ ] Backups appearing in `/backups`.
- [ ] Security checklist in [EDGE_SECURITY_AND_BACKUP.md](./EDGE_SECURITY_AND_BACKUP.md) completed.
- [ ] Router does **not** expose port 3101 to the internet.
- [ ] IT contact and written note of all static IPs taped inside the cabinet.

You are done. The lab can run on the app.
