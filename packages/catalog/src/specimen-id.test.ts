import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPresentSpecimenId,
  shouldQuarantineMissingSpecimenId,
} from "./specimen-id";

describe("isPresentSpecimenId", () => {
  it("rejects missing, empty, and whitespace-only values", () => {
    assert.equal(isPresentSpecimenId(undefined), false);
    assert.equal(isPresentSpecimenId(null), false);
    assert.equal(isPresentSpecimenId(""), false);
    assert.equal(isPresentSpecimenId("   "), false);
  });

  it("accepts a scanned or typed specimen ID", () => {
    assert.equal(isPresentSpecimenId("DH202609160001-01"), true);
    assert.equal(isPresentSpecimenId(" ACC-1 "), true);
  });
});

describe("shouldQuarantineMissingSpecimenId", () => {
  it("quarantines results that arrived with no ID", () => {
    assert.equal(shouldQuarantineMissingSpecimenId(undefined, 3), true);
    assert.equal(shouldQuarantineMissingSpecimenId("", 1), true);
    assert.equal(shouldQuarantineMissingSpecimenId("  ", 2), true);
  });

  it("does not quarantine when a specimen ID is present", () => {
    assert.equal(shouldQuarantineMissingSpecimenId("DH1", 3), false);
  });

  it("does not alert on empty frames with no analytes", () => {
    assert.equal(shouldQuarantineMissingSpecimenId(undefined, 0), false);
    assert.equal(shouldQuarantineMissingSpecimenId("", 0), false);
  });
});
