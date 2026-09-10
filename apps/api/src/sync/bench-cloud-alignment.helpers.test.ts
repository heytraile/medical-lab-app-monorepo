import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildBenchCloudAlignmentPlan,
  summarizeBenchCloudAlignment,
} from "./bench-cloud-alignment.helpers.js";

describe("buildBenchCloudAlignmentPlan", () => {
  const edge = [
    {
      id: "edge-current",
      accessionNumber: "DH001",
      testCode: "TSH",
      status: "pending_review",
    },
    {
      id: "edge-released",
      accessionNumber: "DH002",
      testCode: "ALT",
      status: "released",
    },
  ];

  it("flags orphan cloud rows without edge_result_id", () => {
    const plan = buildBenchCloudAlignmentPlan(edge, [
      {
        id: "cloud-1",
        edge_result_id: null,
        accession_number: "DH001",
        test_code: "TSH",
        status: "released",
      },
    ]);
    assert.equal(plan.aligned, false);
    assert.deepEqual(plan.deleteCloudIds, ["cloud-1"]);
  });

  it("purges cloud rows linked to ids from a prior edge generation", () => {
    const plan = buildBenchCloudAlignmentPlan(edge, [
      {
        id: "cloud-old",
        edge_result_id: "edge-from-old-seed",
        accession_number: "DH001",
        test_code: "TSH",
        status: "released",
      },
    ]);
    assert.equal(plan.aligned, false);
    assert.deepEqual(plan.deleteEdgeResultIds, ["edge-from-old-seed"]);
  });

  it("resets cloud released rows when edge still shows pending_review", () => {
    const plan = buildBenchCloudAlignmentPlan(edge, [
      {
        id: "cloud-drift",
        edge_result_id: "edge-current",
        accession_number: "DH001",
        test_code: "TSH",
        status: "released",
      },
    ]);
    assert.equal(plan.aligned, false);
    assert.deepEqual(plan.resetEdgeResultIds, ["edge-current"]);
  });

  it("is aligned when edge and cloud agree", () => {
    const plan = buildBenchCloudAlignmentPlan(edge, [
      {
        id: "cloud-ok",
        edge_result_id: "edge-released",
        accession_number: "DH002",
        test_code: "ALT",
        status: "released",
      },
    ]);
    assert.equal(plan.aligned, true);
    assert.equal(plan.issues.length, 0);
  });
});

describe("summarizeBenchCloudAlignment", () => {
  it("counts stale released and orphan rows", () => {
    const edge = [
      {
        id: "edge-released",
        accessionNumber: "DH002",
        testCode: "ALT",
        status: "released",
      },
    ];
    const cloud = [
      {
        id: "cloud-old",
        edge_result_id: "missing",
        accession_number: "DH001",
        test_code: "TSH",
        status: "released",
      },
      {
        id: "cloud-orphan",
        edge_result_id: null,
        accession_number: "DH003",
        test_code: "HB",
        status: "pending_review",
      },
    ];
    const plan = buildBenchCloudAlignmentPlan(edge, cloud);
    const summary = summarizeBenchCloudAlignment(edge, cloud, plan);
    assert.equal(summary.staleReleasedCount, 1);
    assert.equal(summary.orphanCloudCount, 1);
    assert.equal(summary.edgeResultCount, 1);
    assert.equal(summary.cloudResultCount, 2);
  });
});
