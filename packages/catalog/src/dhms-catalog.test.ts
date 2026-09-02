import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CATALOG_CATEGORIES,
  DHMS_CATALOG_ITEMS,
  DHMS_PANELS,
} from "./dhms-catalog";

describe("DHMS catalog completeness", () => {
  const codes = new Set(DHMS_CATALOG_ITEMS.map((i) => i.code));

  it("has 12 PDF categories", () => {
    assert.equal(CATALOG_CATEGORIES.length, 12);
    assert.equal(
      CATALOG_CATEGORIES.find((c) => c.id === "urine_chemistry")?.label,
      "Urine Chemistry",
    );
  });

  it("has no duplicate item codes", () => {
    assert.equal(codes.size, DHMS_CATALOG_ITEMS.length);
  });

  it("has at least 15 urine chemistry tests", () => {
    const urine = DHMS_CATALOG_ITEMS.filter(
      (i) => i.category === "urine_chemistry",
    );
    assert.ok(urine.length >= 15, `got ${urine.length}`);
  });

  it("resolves every panel member code", () => {
    const missing: string[] = [];
    for (const panel of DHMS_PANELS) {
      for (const code of panel.memberCodes) {
        if (!codes.has(code)) missing.push(`${panel.code}: ${code}`);
      }
    }
    assert.deepEqual(missing, []);
  });

  it("every item category is defined", () => {
    const categoryIds = new Set(CATALOG_CATEGORIES.map((c) => c.id));
    for (const item of DHMS_CATALOG_ITEMS) {
      assert.ok(
        categoryIds.has(item.category as (typeof CATALOG_CATEGORIES)[number]["id"]),
        `unknown category ${item.category} for ${item.code}`,
      );
    }
  });
});
