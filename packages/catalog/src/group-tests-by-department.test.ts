import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  groupTestsByDepartment,
  ROUTING_PRESET_CONSOLIDATED_DHMS,
} from "./routing-departments";
import type { ExpandedOrderedTest } from "./expand-selection";

function test(
  code: string,
  category: string,
  specimenHint?: string,
): ExpandedOrderedTest {
  return { code, name: code, category, specimenHint };
}

describe("groupTestsByDepartment", () => {
  it("groups chemistry tests under Blood Chemistry", () => {
    const groups = groupTestsByDepartment([
      test("CREATININE", "blood_chemistry", "blood"),
      test("GLUCOSE_RAND", "blood_chemistry", "blood"),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.departmentKey, "blood_chemistry");
    assert.equal(groups[0]?.departmentLabel, "Blood Chemistry");
    assert.equal(groups[0]?.collectionType, "blood");
  });

  it("splits Executive-style order into haematology, chemistry, immunology, urine", () => {
    const groups = groupTestsByDepartment([
      test("CBC", "haematology", "blood"),
      test("CREATININE", "blood_chemistry", "blood"),
      test("VDRL", "immunology", "blood"),
      test("URINALYSIS_COMPLETE", "urine_chemistry", "urine"),
    ]);
    assert.deepEqual(
      groups.map((g) => g.departmentKey),
      ["haematology", "blood_chemistry", "immunology", "urine_chemistry"],
    );
    assert.equal(groups[3]?.collectionType, "urine");
  });

  it("consolidates chemistry + immunology under Chemistry when configured", () => {
    const groups = groupTestsByDepartment(
      [
        test("CBC", "haematology", "blood"),
        test("CREATININE", "blood_chemistry", "blood"),
        test("VDRL", "immunology", "blood"),
        test("URINALYSIS_COMPLETE", "urine_chemistry", "urine"),
      ],
      ROUTING_PRESET_CONSOLIDATED_DHMS,
    );
    assert.deepEqual(
      groups.map((g) => `${g.departmentKey}:${g.collectionType}`),
      ["hematology:blood", "chemistry:blood", "chemistry:urine"],
    );
  });

  it("does not create a serum bucket", () => {
    const groups = groupTestsByDepartment([
      test("CBC", "haematology", "blood"),
      test("CREATININE", "blood_chemistry", "blood"),
    ]);
    assert.ok(!groups.some((g) => g.collectionType === "serum" as string));
    assert.equal(groups.length, 2);
  });
});
