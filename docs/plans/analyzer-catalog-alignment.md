# Plan: Analyzer ↔ request form alignment (remapping)

**Status:** Phases A–C implemented; lab sign-off pending for edge cases.

**Plain-English reference (read this first):** [MACHINE_TO_REQUEST_FORM.md](../MACHINE_TO_REQUEST_FORM.md)

---

## Goal

Ensure machine results **remap** to request-form test codes, simulators only emit **relevant** tests for each order, and manual/send-out tests are **explicitly** not expected from the four analyzers.

---

## Phase 0 — Plain-English documentation (done)

- [MACHINE_TO_REQUEST_FORM.md](../MACHINE_TO_REQUEST_FORM.md) — workflow, why remapping, examples, machine output tables, manual vs instrument, lab sign-off questions

---

## Phase A — Remap table in catalog

Add `packages/catalog/src/test-fulfillment.ts`:

- Per form code: `fulfillment` (instrument | manual | send_out), `analyzerId`, `instrumentCodes[]`
- Helpers: form → machine codes, machine → form codes
- Unit tests: every simulator analyte maps to ≥1 form code

Update ANALYZERS.md, REQUISITION.md, GLOSSARY.md with links.

---

## Phase B — Order-aware simulators

- Read `orderedTestsJson` from edge before send
- Expand panels (CBC, ELECTROLYTES, LIPIDS, …)
- Filter each analyzer’s message to ordered tests only
- Add ProLyte to loop when electrolytes/lithium ordered

---

## Phase C — Remap at ingestion + Bench labels

- Store catalog code (keep raw machine code for audit)
- Badge: Expected / Not ordered / Manual pending

---

## Phase D — Demo defaults

- Document a “full machine demo” order in LOCAL_DEV.md
- Or strict CBC-only default with strict sim

---

## Lab sign-off (before locking table)

- Mindray menu at site
- ESR / retic / UA workflow
- iFlash vs send-out immunology
- DOA platform

---

## Success criteria

- CBC-only order → only Sysmex-shaped results for that accession
- TSH-only → only iFlash TSH
- Form names on Bench match order vocabulary
- Manual tests show as pending, not errors
