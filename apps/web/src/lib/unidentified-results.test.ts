import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatUnidentifiedResultBody } from "./unidentified-results.ts";

describe("formatUnidentifiedResultBody", () => {
  it("instructs a re-run and forbids LIS assignment", () => {
    const body = formatUnidentifiedResultBody({
      analyzerLabel: "Diamond ProLyte",
      items: [
        { testCode: "NA", value: "140", units: "mmol/L" },
        { testCode: "K", value: "4.1", units: "mmol/L" },
        { testCode: "CL", value: "102", units: "mmol/L" },
      ],
    });
    assert.match(body, /Diamond ProLyte/);
    assert.match(body, /NA 140 mmol\/L/);
    assert.match(body, /no specimen ID/);
    assert.match(body, /Do not assign in LIS/);
  });
});
