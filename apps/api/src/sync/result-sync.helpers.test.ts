import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  preserveManualEntryAttribution,
  shouldApplyResultBatchUpdate,
} from "./result-sync.helpers.js";

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

  it("keeps released rows terminal for batch and submit projections", () => {
    assert.equal(shouldApplyResultBatchUpdate("released"), false);
  });
});

describe("preserveManualEntryAttribution", () => {
  it("sets attribution on first projection", () => {
    assert.deepEqual(
      preserveManualEntryAttribution(null, {
        manualEnteredBy: "tech-1",
        manualEnteredBySnapshot: { fullName: "First Tech" },
        manualEnteredAt: "2026-01-01T10:00:00.000Z",
      }),
      {
        manual_entered_by: "tech-1",
        manual_entered_by_snapshot: { fullName: "First Tech" },
        manual_entered_at: "2026-01-01T10:00:00.000Z",
      },
    );
  });

  it("never overwrites existing entry attribution", () => {
    assert.deepEqual(
      preserveManualEntryAttribution(
        {
          manual_entered_by: "tech-1",
          manual_entered_by_snapshot: { fullName: "First Tech" },
          manual_entered_at: "2026-01-01T10:00:00.000Z",
        },
        {
          manualEnteredBy: "tech-2",
          manualEnteredBySnapshot: { fullName: "Second Tech" },
          manualEnteredAt: "2026-01-02T10:00:00.000Z",
        },
      ),
      {
        manual_entered_by: "tech-1",
        manual_entered_by_snapshot: { fullName: "First Tech" },
        manual_entered_at: "2026-01-01T10:00:00.000Z",
      },
    );
  });
});
