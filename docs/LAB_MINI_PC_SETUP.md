# Lab mini PC setup — start to finish (Drax Hall)

**Who this is for:** whoever is standing in the lab with a fresh Ubuntu mini PC, a router, a USB serial hub, analyzers, and a label printer — and needs the whole thing working before staff can use the app.

**Starting point:** Ubuntu is already installed on the mini PC. You can log in at the desk with a keyboard and monitor, or over the network.

**End point:** staff open the app in a browser, register patients, print labels, machines send results, bench review works, cloud sync runs.

**Related docs:**

- [EDGE_SECURITY_AND_BACKUP.md](./EDGE_SECURITY_AND_BACKUP.md) — security, backups, go-live security checklist
- [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md) — how staff sign in, who can use the cloud app, device enrollment
- [ANALYZERS.md](./ANALYZERS.md) — what each machine speaks and how barcodes join
- [HARDWARE.md](./HARDWARE.md) — Zebra printer and Honeywell scanner at registration
- [GLOSSARY.md](./GLOSSARY.md) — longer acronym list

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

The **Diamond ProLyte** (electrolytes) uses **RS-232 serial** through a **USB serial hub** — not TCP.

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

| Phase | What | Time (rough) |
| --- | --- | --- |
| 1 | Plan IPs and names | 30 min |
| 2 | Router: reserve mini PC IP | 15 min |
| 3 | Ubuntu: updates, hostname, optional static IP | 30 min |
| 4 | Install Docker | 20 min |
| 5 | Get the app code (clone or deploy package) | 15 min |
| 6 | Configure secrets and `.env` | 30 min |
| 7 | Build and start lab container | 20 min first build |
| 8 | Wire serial hub + udev rules | 45 min |
| 9 | Configure each analyzer to talk to mini PC | 1–2 hours (vendor menus) |
| 10 | Configure Zebra printer | 30 min |
| 11 | Staff PCs: browser + scanner | 20 min per desk |
| 12 | End-to-end test | 1 hour |
| 13 | Security + backup checklist | See [EDGE_SECURITY_AND_BACKUP.md](./EDGE_SECURITY_AND_BACKUP.md) |

---

## Phase 1 — Plan your network addresses

Before touching anything, write this on paper:

| Device | Suggested hostname | Example static IP | Notes |
| --- | --- | --- | --- |
| Mini PC (edge) | `drax-lis` | `192.168.1.50` | Web app: `http://192.168.1.50:3101` |
| Zebra ZD411 printer | `zebra` | `192.168.1.60` | Receives print jobs on port 9100 |
| Sysmex XS-1000i | — | `192.168.1.71` | **Client** → connects **to** mini PC `:5001` |
| Mindray BS-240 | — | `192.168.1.72` | **Client** → mini PC `:5003` |
| YHLO iFlash 1200 | — | `192.168.1.73` | **Client** → mini PC `:5004` |
| ProLyte | — | *(serial, no IP)* | USB serial hub on mini PC |

Adjust the subnet to match your clinic router (might be `192.168.0.x` or `192.168.10.x` — check an existing PC’s IP).

**Important direction:** for TCP analyzers, the **mini PC is the server**. You configure each instrument’s LIS/host settings with:

- **Host IP** = mini PC IP (`192.168.1.50`)
- **Host port** = 5001 / 5003 / 5004 (per machine)

The instrument **initiates** the connection when it has results (or stays connected — depends on vendor).

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

# --- Serial (ProLyte on USB hub) — host path, mapped into container below ---
PROLYTE_SERIAL_PATH=/dev/prolyte
PROLYTE_BAUD=9600

# --- Optional overrides ---
BACKUP_RETENTION_DAYS=7
```

| Variable | Why |
| --- | --- |
| `CLOUD_API_URL` | Where the mini PC pushes sync events |
| `EDGE_SYNC_TOKEN` | Password proving sync is from your lab |
| `EDGE_JWT_SECRET` | Signs staff login sessions on this mini PC — **required**, generate your own, never reuse the dev default |
| `EDGE_STAFF_SEED` | Set `false` on a real lab PC so no demo accounts are created |
| `CORS_ORIGINS` | Must match exactly how staff open the app (IP or `.local` URL) |
| `ZEBRA_PRINTER_HOST` | Printer IP — edge connects **out** to it |
| `PROLYTE_SERIAL_PATH` | Stable serial device name (after udev rules) |

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

## Phase 7 — Serial hub: plug in, name ports, pass into Docker

The **USB serial hub** (multi-port RS-232 adapter) lets the ProLyte (and optionally Sysmex over serial) talk to the mini PC over cables.

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

Do this on **each instrument’s LIS/host interface menu** (wording varies by vendor). Bring the vendor PDF if you have it.

**Common pattern:**

| Setting on instrument | Value |
| --- | --- |
| LIS host IP | Mini PC IP — `192.168.1.50` |
| LIS host port | Sysmex **5001**, Mindray **5003**, iFlash **5004** |
| Mode | Client (instrument connects to host) — *most common for our edge listeners* |
| Protocol | Sysmex/Mindray: ASTM; iFlash: HL7 |

**Barcode / sample ID:** configure each line so the **accession on the tube label** is what the machine sends back (see [ANALYZERS.md](./ANALYZERS.md) — Sysmex often scans on IPU/loader, not on the main unit).

### 8.1 Verify TCP ports are listening (after container is running)

```bash
ss -tlnp | grep -E '5001|5003|5004|3101'
```

| Command | Meaning |
| --- | --- |
| `ss -tlnp` | Show all TCP ports listening and which process owns them |

Or call the app:

```bash
curl -s http://localhost:3101/analyzers/status | jq
```

(Requires login when hardened — use browser dev tools or admin token.)

---

## Phase 9 — Zebra label printer

Follow [HARDWARE.md](./HARDWARE.md). Short version:

1. Print network config label from Zebra (Feed button at power-on or Zebra Setup Utilities).
2. Set printer static IP `192.168.1.60` on lab subnet.
3. From mini PC:

   ```bash
   nc -zv 192.168.1.60 9100
   ```

   **`nc -zv`** = “netcat, zero-I/O, verbose” — tests if port 9100 is open.

4. Set `ZEBRA_PRINTER_HOST=192.168.1.60` in `infra/.env`.
5. After app is up: open **Labels** page → **Test label**.

Label stock default: **2" × 1"** (`LABEL_SIZE_ID=tube_2x1`).

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

### 12.4 Run sample on each analyzer

Use a real or QC tube with that accession. Confirm:

```bash
docker compose --profile lab-prod logs -f lab | grep -i ingest
```

Or **Bench Review** in UI shows new results.

### 12.5 Analyzer status

In browser (logged in): network tab or API client to `GET /analyzers/status` — each listener should show transport, last accession, no persistent parse errors.

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

## Phase 13 — What happens when you plug in the serial hub (timeline)

1. **USB connect** — Linux kernel loads `usbserial` driver → creates `/dev/ttyUSB0`.
2. **udev rule** — renames to `/dev/prolyte` with correct permissions.
3. **Docker start** — override file passes `/dev/prolyte` into container.
4. **Edge engine start** — reads `PROLYTE_SERIAL_PATH=/dev/prolyte`, opens port at `PROLYTE_BAUD` (9600), 8N1.
5. **Idle listen** — driver waits for bytes from ProLyte.
6. **Sample completes** — ProLyte broadcasts ASCII block with `SAMPLE: DH202603151234` and electrolyte lines.
7. **Edge parses** — maps to analyte codes, joins to specimen by accession, stores results in SQLite, emits Socket.IO event to bench UI, queues cloud sync.
8. **If path wrong** — logs `ProLyte serial skipped` or open errors → fix udev / `devices:` mapping.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Browser “cannot connect” | Container down or firewall | `docker compose … ps`, check `ufw` |
| 401 on everything | Not logged in | Sign in at `/login` on the mini PC; if that fails, check `EDGE_JWT_SECRET` is set |
| Cloud login says "restricted to admin and authorizer accounts" | Signed-in account is a tech | Expected — techs never get cloud access, see [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md) |
| Cloud app keeps asking for an enrollment code | Browser/device not enrolled, or was revoked | Issue a fresh code from **Staff** on the mini PC |
| CORS error in browser console | Wrong `CORS_ORIGINS` | Must match exact URL in address bar (http vs https, IP vs name) |
| ProLyte no results | Serial path, baud, cable | `dmesg`, `ls /dev/prolyte`, minicom test, null-modem |
| Sysmex no results | Instrument not pointing to PC IP:5001 | Vendor LIS menu; `ss -tlnp \| grep 5001` |
| Label does not print | Printer IP / port 9100 | `nc -zv printer-ip 9100`, `ZEBRA_PRINTER_HOST` |
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
