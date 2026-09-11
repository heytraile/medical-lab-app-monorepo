import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SpecimenRow } from "./api.ts";
import {
  filterSpecimensByAccessionQuery,
  findExactSpecimenMatch,
  specimenMatchesQuery,
} from "./specimen-query.ts";

function row(partial: Partial<SpecimenRow> & Pick<SpecimenRow, "id" | "accessionNumber">): SpecimenRow {
  return {
    barcode: partial.barcode ?? partial.specimenNumber ?? partial.accessionNumber,
    patientJson: null,
    status: "registered",
    registeredAt: "2026-09-10T12:00:00.000Z",
    specimenType: "blood",
    ...partial,
  };
}

describe("specimen search helpers", () => {
  const specimens = [
    row({
      id: "1",
      accessionNumber: "DH202609100001",
      specimenNumber: "DH202609100001-01",
      barcode: "DH202609100001-01",
      patientDisplayName: "Jane Doe",
      patientMrn: "MRN7001",
    }),
    row({
      id: "2",
      accessionNumber: "DH202609100002",
      specimenNumber: "DH202609100002-01",
      barcode: "DH202609100002-01",
    }),
  ];

  it("findExactSpecimenMatch resolves specimen IDs", () => {
    const hit = findExactSpecimenMatch(specimens, "DH202609100001-01");
    assert.equal(hit?.accessionNumber, "DH202609100001");
  });

  it("specimenMatchesQuery matches partial specimen IDs", () => {
    assert.equal(
      specimenMatchesQuery(specimens[0]!, "202609100001-01"),
      true,
    );
    assert.equal(specimenMatchesQuery(specimens[0]!, "MRN7001"), true);
    assert.equal(specimenMatchesQuery(specimens[0]!, "no-match"), false);
  });

  it("filterSpecimensByAccessionQuery includes specimen ID matches", () => {
    const filtered = filterSpecimensByAccessionQuery(
      specimens,
      "DH202609100001-01",
    );
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.id, "1");
  });
});
