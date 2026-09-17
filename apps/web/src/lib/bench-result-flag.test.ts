import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolvedResultFlag,
  resultHasAlarmFlag,
  resultHasCriticalFlag,
  summarizeResultFlags,
} from "./bench-result-flag.ts";

describe("resolvedResultFlag", () => {
  it("upgrades stored low to critical for panic sodium", () => {
    assert.equal(
      resolvedResultFlag({
        flag: "low",
        value: "0",
        orderedTestCode: "ELECTROLYTES",
        resultComponentCode: "NA",
      }),
      "critical_low",
    );
  });

  it("keeps borderline sodium as low, not critical", () => {
    assert.equal(
      resolvedResultFlag({
        flag: "low",
        value: "130",
        orderedTestCode: "ELECTROLYTES",
        resultComponentCode: "NA",
      }),
      "low",
    );
  });

  it("leaves stored low as-is when ordered test context is missing", () => {
    assert.equal(
      resolvedResultFlag({
        flag: "low",
        value: "0",
      }),
      "low",
    );
  });
});

describe("summarizeResultFlags", () => {
  it("surfaces critical low on the collapsed group for a legacy panic row", () => {
    const summary = summarizeResultFlags([
      {
        id: "na-0",
        flag: "low",
        value: "0",
        orderedTestCode: "ELECTROLYTES",
        resultComponentCode: "NA",
      },
    ]);
    assert.equal(summary.worstFlag, "critical_low");
    assert.equal(summary.worstResultId, "na-0");
    assert.equal(summary.hasCritical, true);
    assert.equal(summary.hasAlarm, true);
    assert.equal(
      resultHasCriticalFlag({
        flag: "low",
        value: "0",
        orderedTestCode: "ELECTROLYTES",
        resultComponentCode: "NA",
      }),
      true,
    );
    assert.equal(
      resultHasAlarmFlag({
        flag: "low",
        value: "0",
        orderedTestCode: "ELECTROLYTES",
        resultComponentCode: "NA",
      }),
      true,
    );
  });

  it("does not treat borderline low as critical", () => {
    const summary = summarizeResultFlags([
      {
        id: "na-130",
        flag: "low",
        value: "130",
        orderedTestCode: "ELECTROLYTES",
        resultComponentCode: "NA",
      },
    ]);
    assert.equal(summary.worstFlag, "low");
    assert.equal(summary.hasCritical, false);
    assert.equal(summary.hasAlarm, false);
  });

  it("uses the critical child as worst when the group is mixed", () => {
    const summary = summarizeResultFlags([
      {
        id: "k-normal",
        flag: "normal",
        value: "4.1",
        orderedTestCode: "ELECTROLYTES",
        resultComponentCode: "K",
      },
      {
        id: "na-0",
        flag: "low",
        value: "0",
        orderedTestCode: "ELECTROLYTES",
        resultComponentCode: "NA",
      },
      {
        id: "cl-normal",
        flag: "normal",
        value: "102",
        orderedTestCode: "ELECTROLYTES",
        resultComponentCode: "CL",
      },
    ]);
    assert.equal(summary.worstFlag, "critical_low");
    assert.equal(summary.worstResultId, "na-0");
    assert.equal(summary.hasCritical, true);
    assert.equal(summary.hasAlarm, true);
  });
});
