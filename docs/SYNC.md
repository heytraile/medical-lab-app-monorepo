# Sync screen — what it is and how it works

This page explains the **Sync** menu in the app: what you are looking at, what the numbers mean, and how behaviour differs when you are developing on your own machine versus running the lab for real in the cloud.

---

## Why Sync exists at all

The lab runs on two layers:

1. **The lab computer** — where analyzers plug in, where reception accessions patients, and where bench staff review results. This keeps working even if the internet drops.
2. **The cloud copy** — where authorizers review and release results, where reports are generated, and where the official record lives for the whole organization.

Important things (new patients, new accessions, test results, “submit for release”, recalls) are **saved on the lab computer first**, then **copied up to the cloud** when a connection is available. The Sync screen is your window into that copy process.

You do not need to open Sync for every day-to-day task. Bench, Accession, and Release still work as normal. Sync is mainly for **checking that nothing is stuck** and for **pushing waiting items up immediately** when the authorizer’s release queue looks empty but the bench says something was already submitted.

---

## What you see on the Sync screen

The page title is **Store-and-Forward Sync**. Below that you get four counters and a **Drain now** button.

### The four counters

| Counter | Plain meaning |
| --- | --- |
| **Pending** | Items waiting to be sent to the cloud. They are safely stored on the lab computer. |
| **Syncing** | Items currently being sent (usually only for a moment). |
| **Acked (cloud)** | Items that were sent and the cloud confirmed receipt. These stay in the history on the lab computer; they are not “unsent”. |
| **Failed** | Something went wrong when sending. The lab computer will try again automatically; you can also use **Drain now**. |

The page refreshes every few seconds so you can watch numbers move without reloading.

### Drain now

**Drain now** tells the lab computer: *send everything that is waiting right now*.

Use it when:

- A bench tech clicked **Submit for release** but the **Release queue** is still empty.
- **Pending** or **Failed** counts are above zero and you want to nudge the copy process instead of waiting.

Many actions elsewhere in the app (submit, recall, return to bench) already try to drain automatically. **Drain now** is the manual “send it now” button when you want to be sure.

---

## What kinds of things get synced

Whenever something important happens on the lab computer, a small “message” is queued to go to the cloud. Examples:

- A new patient is registered locally
- A specimen is accessioned (patient linked to a request)
- Analyzer results arrive on the bench
- A tech submits an accession for authorizer release
- A tech recalls a submission, or an authorizer sends work back to the bench

The cloud uses these messages to keep its copy of patients, accessions, and results in step with what happened at the bench. Until a “submit for release” message reaches the cloud, the authorizer will not see that work on the Release queue.

### Which copy wins

- The edge is authoritative for analyzer/manual entry and the tech's submit or recall before authorization.
- The cloud is authoritative for authorizer release and report eligibility.
- `released` is terminal. An older edge message may not change a cloud-released result's status or clinical value.
- After cloud release, the app retries the idempotent edge mirror until Bench also shows the accession as released. A mirror delay is surfaced as a warning.
- Workflow transitions are accession-scoped. A released accession and a newer pending accession for the same patient remain separate.
- Manual entry and latest-edit actor snapshots/timestamps travel with `result.batch` and `result.submitted`. Cloud projections may display them to authorizers, but sync never applies value or attribution changes to an already released cloud row.

---

## Local mode (developing on your own machine)

When you run the app locally (for example with `pnpm dev:local`), you are simulating a real lab setup on your laptop.

### What is running

- The **workbench in the browser** (what staff see)
- The **lab computer service** on your machine (handles analyzers, bench data, and the send queue)
- The **cloud service** on your machine (receives copies and talks to the database)
- **Local database in Docker** — a full copy of the cloud database running on your computer, not on the internet. This is the “local Supabase” stack.

In this setup, “the cloud” is still **on your machine** — it is just a separate program and database from the lab computer, the same way it would be separate in production.

### How Sync behaves locally

1. Results and accessions land on the lab computer first (Bench updates immediately).
2. Messages queue as **Pending**.
3. Every ~15 seconds the lab computer tries to send waiting messages to the local cloud service, **or** you click **Drain now**.
4. If the send succeeds, items move to **Acked (cloud)** and the Release queue / reports can see the updated cloud copy.
5. If the cloud service or local database is not running, items stay **Pending** until it comes back.

### Local quirks worth knowing

- If Docker is not running and the cloud service has no database configured, the cloud may use a **temporary in-memory store** — fine for a quick demo, but **data is lost when you restart**. Always prefer the Docker local database for realistic testing.
- After resetting the local database (`pnpm supabase:reset`), you may need to sign in again and re-accession or re-submit so patient names appear correctly on the Release queue.
- **Drain now** on Sync is a normal part of local testing when the release queue does not update immediately after submit.

---

## Real / production mode (cloud database on the internet)

When the lab runs for real, the architecture is the same — only the **cloud copy lives on hosted infrastructure** (Supabase in the cloud), not in Docker on a developer laptop.

### What changes

| | Local development | Production |
| --- | --- | --- |
| Lab computer | Mini PC (or dev machine) at the site | Mini PC at each lab site |
| Cloud database | Docker on your machine, or temporary memory | Hosted database on the internet |
| Who uses Release / reports | Same people, against the local cloud copy | Authorizers anywhere with login — office, home, second site |
| If internet drops | Lab bench keeps working; sends queue as **Pending** | Same — bench keeps working; sends wait until internet returns |
| If lab PC dies | Cloud already has copies of submitted/released work | Same — cloud is the safety net for work that was already sent |

### How Sync should behave in production

1. **Automatic sending** — The lab computer tries to send waiting messages on a schedule (about every 15 seconds). Staff should rarely need **Drain now** if the network is healthy.
2. **Pending during outages** — If the internet or cloud is down, **Pending** rises. Nothing is lost on the lab computer. When connectivity returns, sends resume and counters should drop.
3. **Failed needs attention** — A steady **Failed** count means something is wrong (wrong credentials, cloud unreachable, bad data). Check network and contact support; **Drain now** alone may not fix a persistent failure.
4. **Acked is historical** — A large **Acked** number is normal over time. It means “successfully copied in the past”, not “still waiting”.
5. **Authorizers depend on sync for submit** — Releasing results happens in the cloud. A tech’s **Submit for release** on Bench only reaches the authorizer after that message is **Acked**. That is why an empty Release queue with **Pending > 0** on Sync means “wait or drain”, not “nothing was submitted”.

Production does **not** require staff to open Sync every day. It is a **health and troubleshooting** screen: confirm the pipe between lab and cloud is moving.

---

## How Sync fits the wider workflow

```text
Analyzer → saved on lab computer → appears on Bench
                ↓
         (optional: copy to cloud as “pending review”)
                ↓
Bench tech reviews → Submit for release
                ↓
         Sync sends “submitted” message → cloud
                ↓
Authorizer → Release queue → Release
                ↓
Export report / email (released results only)
```

Sync sits in the middle: **lab computer → cloud**. Bench works without the cloud for reviewing new results; Release and export need the cloud copy to be up to date.

---

## Quick troubleshooting

| What you see | What it usually means | What to try |
| --- | --- | --- |
| Release queue empty after submit | Message not in cloud yet | Open **Sync** → check **Pending** → **Drain now** |
| **Pending** stays high | Cloud unreachable or not running | Local: start Docker / cloud service. Production: check internet |
| **Failed** > 0 | Last send attempt errored | **Drain now** once; if it persists, check logs / support |
| **Acked** grows, **Pending** is 0 | Healthy — copies are getting through | No action needed |
| Patient shows as “Unknown” on Release | Cloud missing patient link for that accession | Re-accession or submit again so patient details travel with the message |

---

## Related reading

- [WORKFLOW.md](./WORKFLOW.md) — bench, submit, release, export
- [LOCAL_DEV.md](./LOCAL_DEV.md) — starting the local stack and test accounts
- [AUDIT.md](./AUDIT.md) — what gets logged when results move through the system
