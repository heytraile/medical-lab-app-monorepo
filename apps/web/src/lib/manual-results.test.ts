import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canEditManualResult,
  manualAccessionAccess,
} from "./manual-results.ts";

describe("canEditManualResult", () => {
  it("allows editing manual results on the bench only", () => {
    assert.equal(
      canEditManualResult({ analyzerId: "manual", status: "pending_review" }),
      true,
    );
    assert.equal(
      canEditManualResult({ analyzerId: "manual", status: undefined }),
      true,
    );
  });

  it("blocks editing while awaiting authorization or after release", () => {
    assert.equal(
      canEditManualResult({
        analyzerId: "manual",
        status: "pending_authorization",
      }),
      false,
    );
    assert.equal(
      canEditManualResult({ analyzerId: "manual", status: "released" }),
      false,
    );
  });

  it("does not allow editing instrument results", () => {
    assert.equal(
      canEditManualResult({ analyzerId: "sysmex", status: "pending_review" }),
      false,
    );
    assert.equal(
      canEditManualResult({ analyzerId: "mindray", status: "released" }),
      false,
    );
  });
});

describe("manualAccessionAccess", () => {
  it("allows an empty manual-only accession and pending bench work", () => {
    assert.equal(manualAccessionAccess([]), "editable");
    assert.equal(
      manualAccessionAccess([{ status: "pending_review" }]),
      "editable",
    );
  });

  it("locks the whole accession while submitted", () => {
    assert.equal(
      manualAccessionAccess([
        { status: "pending_review" },
        { status: "pending_authorization" },
      ]),
      "submitted",
    );
  });

  it("makes any released accession permanently read-only", () => {
    assert.equal(
      manualAccessionAccess([
        { status: "pending_review" },
        { status: "released" },
      ]),
      "released",
    );
  });
});
