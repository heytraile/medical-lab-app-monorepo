import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BenchResult } from "./api.ts";
import {
  accessionHasIncompleteWork,
  buildWorkQueueTestItems,
  queueRowMatchesAnalyzerFilter,
} from "./bench-work-queue.ts";

function result(
  partial: Pick<BenchResult, "id" | "accessionNumber" | "testCode"> &
    Partial<BenchResult>,
): BenchResult {
  return {
    barcode: partial.accessionNumber,
    analyzerId: partial.analyzerId ?? "sysmex_xs1000i",
    value: "1",
    units: null,
    flag: "normal",
    status: "pending_review",
    observedAt: "2026-09-11T12:05:00.000Z",
    ...partial,
  };
}

describe("bench work queue helpers", () => {
  it("treats zero-result CBC order as incomplete", () => {
    assert.equal(
      accessionHasIncompleteWork(["CBC"], []),
      true,
    );
  });

  it("keeps accessions with remaining instrument work after partial results", () => {
    const completeness = [
      {
        testCode: "CBC",
        analyzerId: "sysmex_xs1000i",
        orderedTestCode: "CBC",
        resultComponentCode: null,
      },
    ];
    assert.equal(
      accessionHasIncompleteWork(["CBC", "CREATININE"], completeness),
      true,
    );
    const tests = buildWorkQueueTestItems(
      ["CBC", "CREATININE"],
      completeness,
    );
    assert.equal(tests.filter((t) => t.status === "received").length, 1);
    assert.ok(
      tests.some(
        (t) =>
          t.code === "CREATININE" && t.status === "awaiting_instrument",
      ),
    );
  });

  it("excludes accessions when instrument work is complete", () => {
    const completeness = [
      {
        testCode: "CREATININE",
        analyzerId: "mindray_bs240",
        orderedTestCode: "CREATININE",
        resultComponentCode: null,
      },
    ];
    assert.equal(
      accessionHasIncompleteWork(["CREATININE"], completeness),
      false,
    );
  });

  it("filters queue rows by analyzer pending instrument work", () => {
    const mixed = buildWorkQueueTestItems(["CBC", "CREATININE"], []);
    assert.equal(
      queueRowMatchesAnalyzerFilter({ tests: mixed }, "sysmex_xs1000i"),
      true,
    );

    const cbcOnly = buildWorkQueueTestItems(["CBC"], []);
    assert.equal(
      queueRowMatchesAnalyzerFilter({ tests: cbcOnly }, "mindray_bs240"),
      false,
    );
  });

  it("maps received instrument results to received test status", () => {
    const tests = buildWorkQueueTestItems(
      ["CBC"],
      [
        result({
          id: "r1",
          accessionNumber: "DH1",
          testCode: "CBC",
        }),
      ],
    );
    assert.equal(tests[0]?.status, "received");
  });

  it("surfaces awaiting manual alongside received instrument results", () => {
    const tests = buildWorkQueueTestItems(
      ["CBC", "GROUP_RH"],
      [
        result({
          id: "r1",
          accessionNumber: "DH1",
          testCode: "CBC",
          analyzerId: "sysmex_xs1000i",
        }),
      ],
    );
    assert.ok(
      tests.some(
        (t) => t.code === "GROUP_RH" && t.status === "awaiting_manual",
      ),
    );
    assert.equal(tests.filter((t) => t.status !== "received").length, 1);
  });

  it("marks manual-only orders as awaiting manual before any results", () => {
    const tests = buildWorkQueueTestItems(["GROUP_RH"], []);
    assert.equal(tests[0]?.status, "awaiting_manual");
  });
});
