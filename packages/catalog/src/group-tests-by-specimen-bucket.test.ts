import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupTestsBySpecimenBucket } from "./group-tests-by-specimen-bucket";
import type { ExpandedOrderedTest } from "./expand-selection";

function test(
  code: string,
  category: string,
  specimenHint?: string,
): ExpandedOrderedTest {
  return { code, name: code, category, specimenHint };
}

describe("groupTestsBySpecimenBucket (deprecated alias)", () => {
  it("groups chemistry tests under Blood Chemistry department", () => {
    const groups = groupTestsBySpecimenBucket([
      test("CREATININE", "blood_chemistry", "blood"),
      test("GLUCOSE_RAND", "blood_chemistry", "blood"),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.departmentKey, "blood_chemistry");
    assert.equal(groups[0]?.collectionType, "blood");
  });

  it("splits Executive-style order by department, not serum bucket", () => {
    const groups = groupTestsBySpecimenBucket([
      test("CBC", "haematology", "blood"),
      test("CREATININE", "blood_chemistry", "blood"),
      test("URINALYSIS_COMPLETE", "urine_chemistry", "urine"),
    ]);
    assert.deepEqual(
      groups.map((g) => g.departmentKey),
      ["haematology", "blood_chemistry", "urine_chemistry"],
    );
    assert.ok(!groups.some((g) => g.collectionType === "serum" as string));
  });
});
