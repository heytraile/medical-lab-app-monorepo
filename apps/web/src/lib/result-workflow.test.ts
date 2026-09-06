import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeResultStatuses } from "./result-workflow.ts";

describe("summarizeResultStatuses", () => {
  it("does not call a mixed released/pending accession fully released", () => {
    const summary = summarizeResultStatuses([
      { status: "released" },
      { status: "pending_review" },
    ]);
    assert.deepEqual(summary, {
      pendingCount: 1,
      submittedCount: 0,
      releasedCount: 1,
      allReleased: false,
    });
  });

  it("calls an accession released only when every result is released", () => {
    const summary = summarizeResultStatuses([
      { status: "released" },
      { status: "released" },
    ]);
    assert.equal(summary.allReleased, true);
    assert.equal(summary.releasedCount, 2);
  });
});
