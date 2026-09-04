import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupTestsBySpecimenBucket } from "./group-tests-by-specimen-bucket";
import type { ExpandedOrderedTest } from "./expand-selection";

function test(
  code: string,
  specimenHint?: string,
): ExpandedOrderedTest {
  return { code, name: code, specimenHint };
}

describe("groupTestsBySpecimenBucket", () => {
  it("returns one serum group for serum-only tests", () => {
    const groups = groupTestsBySpecimenBucket([
      test("CREATININE", "serum"),
      test("GLUCOSE_RAND", "serum"),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.specimenType, "serum");
    assert.equal(groups[0]?.tests.length, 2);
  });

  it("splits CBC + BMP + UA into blood, serum, and urine", () => {
    const groups = groupTestsBySpecimenBucket([
      test("CBC", "blood"),
      test("CREATININE", "serum"),
      test("URINALYSIS_COMPLETE", "urine"),
    ]);
    assert.equal(groups.length, 3);
    assert.deepEqual(
      groups.map((g) => g.specimenType),
      ["blood", "serum", "urine"],
    );
    assert.equal(groups[0]?.tests[0]?.code, "CBC");
    assert.equal(groups[1]?.tests[0]?.code, "CREATININE");
    assert.equal(groups[2]?.tests[0]?.code, "URINALYSIS_COMPLETE");
  });

  it("defaults missing hints to blood", () => {
    const groups = groupTestsBySpecimenBucket([test("MYSTERY")]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.specimenType, "blood");
  });

  it("keeps stable bucket order when multiple types present", () => {
    const groups = groupTestsBySpecimenBucket([
      test("URINALYSIS_COMPLETE", "urine"),
      test("CBC", "blood"),
      test("CREATININE", "serum"),
    ]);
    assert.deepEqual(
      groups.map((g) => g.specimenType),
      ["blood", "serum", "urine"],
    );
  });
});
