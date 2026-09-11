import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DRAX_HALL_ROUTING_SETTINGS,
  ROUTING_PRESET_CONSOLIDATED_DHMS,
  ROUTING_PRESET_GRANULAR,
  groupTestsByDepartment,
  normalizeLabRoutingSettings,
  resolveRoutingDepartment,
} from "./routing-departments";
import type { ExpandedOrderedTest } from "./expand-selection";

function test(
  code: string,
  category: string,
  specimenHint?: string,
): ExpandedOrderedTest {
  return { code, name: code, category, specimenHint };
}

describe("normalizeLabRoutingSettings", () => {
  it("defaults to granular when input is missing", () => {
    const config = normalizeLabRoutingSettings(null);
    assert.equal(config.mode, "granular");
    assert.equal(config.departments.length, ROUTING_PRESET_GRANULAR.departments.length);
  });

  it("preserves consolidated Drax Hall preset shape", () => {
    const config = normalizeLabRoutingSettings(DRAX_HALL_ROUTING_SETTINGS);
    assert.equal(config.mode, "consolidated");
    assert.equal(config.splitByCollectionType, true);
    assert.equal(config.departments.length, 3);
  });
});

describe("resolveRoutingDepartment", () => {
  it("maps catalog categories to consolidated departments", () => {
    const hema = resolveRoutingDepartment(
      "haematology",
      ROUTING_PRESET_CONSOLIDATED_DHMS,
    );
    assert.equal(hema.key, "hematology");
    assert.equal(hema.labelShort, "Hema");

    const chem = resolveRoutingDepartment(
      "urine_chemistry",
      ROUTING_PRESET_CONSOLIDATED_DHMS,
    );
    assert.equal(chem.key, "chemistry");
    assert.equal(chem.labelShort, "Chem");
  });
});

describe("groupTestsByDepartment consolidated", () => {
  it("splits Executive-style order into Hema/Chem/Micro with collection split", () => {
    const groups = groupTestsByDepartment(
      [
        test("CBC", "haematology", "blood"),
        test("CREATININE", "blood_chemistry", "blood"),
        test("VDRL", "immunology", "blood"),
        test("URINALYSIS_COMPLETE", "urine_chemistry", "urine"),
        test("CULT_SENS_ROUTINE", "bacteriology", "other"),
      ],
      ROUTING_PRESET_CONSOLIDATED_DHMS,
    );
    assert.deepEqual(
      groups.map((g) => `${g.departmentKey}:${g.collectionType}`),
      [
        "hematology:blood",
        "chemistry:blood",
        "chemistry:urine",
        "microbiology:other",
      ],
    );
    assert.equal(groups[0]?.departmentLabelShort, "Hema");
    assert.equal(groups[1]?.collectionLabelShort, "Bld");
    assert.equal(groups[2]?.collectionLabelShort, "Ur");
  });
});
