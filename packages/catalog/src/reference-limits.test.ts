import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeClinicalFlag,
  getClinicalLimits,
  resolveClinicalDisplayFlag,
} from "./reference-limits";

describe("clinical flag limits", () => {
  it("flags zero sodium as critical low", () => {
    const limits = getClinicalLimits("ELECTROLYTES", "NA");
    assert.ok(limits);
    assert.equal(computeClinicalFlag("0", limits, "L"), "critical_low");
  });

  it("flags borderline sodium as low not critical", () => {
    const limits = getClinicalLimits("ELECTROLYTES", "NA");
    assert.ok(limits);
    assert.equal(computeClinicalFlag("130", limits), "low");
  });

  it("flags panic sodium as critical low", () => {
    const limits = getClinicalLimits("ELECTROLYTES", "NA");
    assert.ok(limits);
    assert.equal(computeClinicalFlag("115", limits), "critical_low");
  });

  it("flags high potassium as critical high", () => {
    const limits = getClinicalLimits("ELECTROLYTES", "K");
    assert.ok(limits);
    assert.equal(computeClinicalFlag("7.0", limits), "critical_high");
  });

  it("upgrades stored low to critical for legacy rows on display", () => {
    assert.equal(
      resolveClinicalDisplayFlag("low", "0", "ELECTROLYTES", "NA"),
      "critical_low",
    );
  });
});
