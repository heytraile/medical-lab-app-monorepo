import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ANALYZER_SIM_ANALYTES,
  allSimulatorInstrumentCodes,
  analytesForOrder,
  analyzerHasWork,
  getFulfillment,
  instrumentToCatalogCodes,
  pendingNonInstrumentTests,
  pickCatalogCodeForResult,
} from "./test-fulfillment";

describe("test fulfillment remap", () => {
  it("maps Mindray BUN to UREA_BUN", () => {
    assert.deepEqual(instrumentToCatalogCodes("mindray_bs240", "BUN"), [
      "UREA_BUN",
    ]);
  });

  it("maps Sysmex WBC to CBC when CBC ordered", () => {
    const pick = pickCatalogCodeForResult("sysmex_xs1000i", "WBC", ["CBC"]);
    assert.equal(pick.catalogCode, "CBC");
    assert.equal(pick.expected, true);
  });

  it("maps ProLyte ions to ELECTROLYTES", () => {
    const pick = pickCatalogCodeForResult("diamond_prolyte", "NA", [
      "ELECTROLYTES",
    ]);
    assert.equal(pick.catalogCode, "ELECTROLYTES");
    assert.equal(pick.expected, true);
  });

  it("filters Sysmex analytes for CBC-only order", () => {
    const analytes = analytesForOrder("sysmex_xs1000i", ["CBC"]);
    assert.ok(analytes.length >= 5);
    assert.ok(!analyzerHasWork("mindray_bs240", ["CBC"]));
    assert.ok(!analyzerHasWork("yhlo_iflash1200", ["CBC"]));
  });

  it("filters Mindray for chemistry order", () => {
    assert.ok(
      analyzerHasWork("mindray_bs240", ["CREATININE", "ALT_SGPT"]),
    );
    const analytes = analytesForOrder("mindray_bs240", ["CREATININE"]);
    assert.equal(analytes.length, 1);
    assert.equal(analytes[0]?.instrumentCode, "CREA");
  });

  it("marks bacteriology as manual", () => {
    assert.equal(getFulfillment("GRAM_SMEAR"), "manual");
    assert.equal(getFulfillment("CULT_SENS_ROUTINE"), "manual");
  });

  it("marks instrument-backed catalog codes", () => {
    assert.equal(getFulfillment("TSH"), "instrument");
    assert.equal(getFulfillment("ELECTROLYTES"), "instrument");
  });

  it("pendingNonInstrumentTests excludes received manual codes", () => {
    const pending = pendingNonInstrumentTests(
      ["CBC", "ESR", "GROUP_RH"],
      ["CBC", "ESR"],
    );
    assert.deepEqual(pending, ["GROUP_RH"]);
  });

  it("pendingNonInstrumentTests ignores instrument-only orders", () => {
    const pending = pendingNonInstrumentTests(["CBC", "TSH"], []);
    assert.deepEqual(pending, []);
  });

  it("every simulator analyte maps to at least one catalog code", () => {
    for (const [analyzerId, analytes] of Object.entries(
      ANALYZER_SIM_ANALYTES,
    )) {
      for (const a of analytes) {
        assert.ok(
          a.catalogCodes.length > 0,
          `${analyzerId}/${a.instrumentCode} has no catalog codes`,
        );
      }
    }
  });

  it("simulator instrument codes are unique per analyzer", () => {
    for (const [analyzerId, analytes] of Object.entries(
      ANALYZER_SIM_ANALYTES,
    )) {
      const codes = analytes.map((a) => a.instrumentCode);
      assert.equal(
        new Set(codes).size,
        codes.length,
        `duplicate instrument code on ${analyzerId}`,
      );
    }
    assert.ok(allSimulatorInstrumentCodes().length > 0);
  });
});
