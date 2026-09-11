import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  abbreviateTestCodeForLabel,
  abbreviateTestsForLabel,
} from "./label-test-abbrev";

describe("abbreviateTestCodeForLabel", () => {
  it("maps known long codes", () => {
    assert.equal(abbreviateTestCodeForLabel("URINALYSIS_COMPLETE"), "UA Cmp");
    assert.equal(abbreviateTestCodeForLabel("CULT_SENS_ROUTINE"), "C+S");
  });

  it("passes through unknown codes unchanged", () => {
    assert.equal(abbreviateTestCodeForLabel("CREATININE"), "CREATININE");
  });
});

describe("abbreviateTestsForLabel", () => {
  it("sorts by catalog category order when categories provided", () => {
    const abbrevs = abbreviateTestsForLabel(
      ["CREATININE", "CBC"],
      ["blood_chemistry", "haematology"],
    );
    assert.deepEqual(abbrevs, ["CBC", "CREATININE"]);
  });
});
