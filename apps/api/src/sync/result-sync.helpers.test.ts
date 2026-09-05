import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldApplyResultBatchUpdate } from "./result-sync.helpers.js";

describe("shouldApplyResultBatchUpdate", () => {
  it("allows upsert when no existing row or not released", () => {
    assert.equal(shouldApplyResultBatchUpdate(undefined), true);
    assert.equal(shouldApplyResultBatchUpdate(null), true);
    assert.equal(shouldApplyResultBatchUpdate("pending_review"), true);
    assert.equal(
      shouldApplyResultBatchUpdate("pending_authorization"),
      true,
    );
  });

  it("skips upsert when existing row is released", () => {
    assert.equal(shouldApplyResultBatchUpdate("released"), false);
  });
});
