import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSimilarOrder,
  jaccardSimilarity,
  orderedCodesFromTests,
} from "./similar-order";

describe("jaccardSimilarity", () => {
  it("is 1 for identical sets", () => {
    assert.equal(jaccardSimilarity(["CBC", "LIPIDS"], ["lipids", "cbc"]), 1);
  });

  it("is 0 for disjoint sets", () => {
    assert.equal(jaccardSimilarity(["CBC"], ["PSA_TOTAL"]), 0);
  });
});

describe("isSimilarOrder", () => {
  it("flags high overlap as similar", () => {
    assert.equal(
      isSimilarOrder(["CBC", "LIPIDS", "CREATININE"], ["CBC", "LIPIDS", "CREATININE"]),
      true,
    );
  });

  it("does not flag a small overlapping panel", () => {
    assert.equal(isSimilarOrder(["CBC"], ["CBC", "LIPIDS", "CREATININE", "VDRL"]), false);
  });
});

describe("orderedCodesFromTests", () => {
  it("normalizes objects and strings", () => {
    assert.deepEqual(orderedCodesFromTests([{ code: "cbc" }, "LIPIDS"]), [
      "CBC",
      "LIPIDS",
    ]);
  });
});
