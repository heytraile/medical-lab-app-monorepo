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
  it("groups blood/serum/urine tubes from one panel submit", () => {
    const rows = [
      tube({
        id: "3",
        accessionNumber: "DH3",
        specimenType: "urine",
        registrationBatchId: "batch-1",
        orderedTests: [{ code: "URINALYSIS_COMPLETE" }],
        registeredAt: "2026-09-06T12:00:02.000Z",
      }),
      tube({
        id: "1",
        accessionNumber: "DH1",
        specimenType: "blood",
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
        accessionNumber: "DH2",
        specimenType: "serum",
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
    assert.deepEqual(sessions[0]?.accessionNumbers, ["DH1", "DH2", "DH3"]);
    assert.deepEqual(
      sessions[0]?.orderedSelections.map((s) => s.code),
      ["EXECUTIVE_I", "EXECUTIVE_II"],
    );
    assert.deepEqual(
      sessions[0]?.orderedTests.map((t) => t.code),
      ["CBC", "GROUP_RH", "LIPIDS", "URINALYSIS_COMPLETE"],
    );
    assert.deepEqual(sessions[0]?.specimenTypes, ["blood", "serum", "urine"]);
    assert.equal(
      findSessionByAccession(sessions, "DH3")?.primary.accessionNumber,
      "DH1",
    );
  });
});
