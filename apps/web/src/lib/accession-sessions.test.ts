import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SpecimenRow } from "./api.ts";
import {
  findSessionByAccession,
  groupSpecimensIntoSessions,
} from "./accession-sessions.ts";

function tube(
  partial: Partial<SpecimenRow> &
    Pick<SpecimenRow, "id" | "accessionNumber" | "specimenType">,
): SpecimenRow {
  return {
    barcode: partial.accessionNumber,
    patientJson: null,
    status: "registered",
    registeredAt: partial.registeredAt ?? "2026-09-06T12:00:00.000Z",
    orderedTests: partial.orderedTests ?? [],
    ...partial,
  };
}

describe("groupSpecimensIntoSessions", () => {
  it("groups department routing labels from one panel submit under one accession", () => {
    const accessionNumber = "DH202609061234";
    const rows = [
      tube({
        id: "3",
        accessionNumber,
        specimenType: "urine",
        collectionType: "urine",
        departmentKey: "urine_chemistry",
        departmentLabel: "Urine Chemistry",
        registrationBatchId: "batch-1",
        orderedTests: [{ code: "URINALYSIS_COMPLETE" }],
        registeredAt: "2026-09-06T12:00:02.000Z",
      }),
      tube({
        id: "1",
        accessionNumber,
        specimenType: "blood",
        collectionType: "blood",
        departmentKey: "haematology",
        departmentLabel: "Haematology",
        registrationBatchId: "batch-1",
        orderedTests: [{ code: "CBC" }, { code: "GROUP_RH" }],
        orderedSelections: [
          { kind: "panel", code: "EXECUTIVE_I" },
          { kind: "panel", code: "EXECUTIVE_II" },
        ],
        registeredAt: "2026-09-06T12:00:00.000Z",
      }),
      tube({
        id: "2",
        accessionNumber,
        specimenType: "blood",
        collectionType: "blood",
        departmentKey: "blood_chemistry",
        departmentLabel: "Blood Chemistry",
        registrationBatchId: "batch-1",
        orderedTests: [{ code: "LIPIDS" }],
        orderedSelections: [
          { kind: "panel", code: "EXECUTIVE_I" },
          { kind: "panel", code: "EXECUTIVE_II" },
        ],
        registeredAt: "2026-09-06T12:00:01.000Z",
      }),
    ];

    const sessions = groupSpecimensIntoSessions(rows);
    assert.equal(sessions.length, 1);
    assert.deepEqual(sessions[0]?.accessionNumbers, [accessionNumber]);
    assert.deepEqual(
      sessions[0]?.orderedSelections.map((s) => s.code),
      ["EXECUTIVE_I", "EXECUTIVE_II"],
    );
    assert.deepEqual(
      sessions[0]?.orderedTests.map((t) => t.code),
      ["CBC", "GROUP_RH", "LIPIDS", "URINALYSIS_COMPLETE"],
    );
    assert.deepEqual(sessions[0]?.specimenTypes, ["blood", "urine"]);
    assert.equal(
      findSessionByAccession(sessions, accessionNumber)?.primary.id,
      "1",
    );
  });

  it("merges routing labels that share an accession even when batch ids differ", () => {
    const accessionNumber = "DH202609061235";
    const rows = [
      tube({
        id: "a",
        accessionNumber,
        specimenType: "blood",
        registrationBatchId: "batch-reprint-1",
        orderedTests: [{ code: "CBC" }],
      }),
      tube({
        id: "b",
        accessionNumber,
        specimenType: "blood",
        registrationBatchId: "batch-reprint-2",
        departmentLabel: "Haematology",
        orderedTests: [{ code: "GROUP_RH" }],
      }),
    ];

    const sessions = groupSpecimensIntoSessions(rows);
    assert.equal(sessions.length, 1);
    assert.deepEqual(
      sessions[0]?.orderedTests.map((t) => t.code),
      ["CBC", "GROUP_RH"],
    );
  });
});
