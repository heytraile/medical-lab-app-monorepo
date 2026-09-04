import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveDisplayFlag } from "./result-flags.js";

describe("resolveDisplayFlag", () => {
  it("keeps classified flags as-is", () => {
    assert.equal(resolveDisplayFlag("high"), "high");
    assert.equal(resolveDisplayFlag("normal"), "normal");
  });

  it("derives normal/high/low from value and reference range", () => {
    assert.equal(resolveDisplayFlag("unknown", "6.5", 4, 11), "normal");
    assert.equal(resolveDisplayFlag("unknown", "180", 70, 110), "high");
    assert.equal(resolveDisplayFlag("unknown", "3.0", 3.5, 5.1), "low");
  });

  it("defaults unknown qualitative results to normal for staff display", () => {
    assert.equal(resolveDisplayFlag("unknown", "Non-Reactive"), "normal");
  });
});
