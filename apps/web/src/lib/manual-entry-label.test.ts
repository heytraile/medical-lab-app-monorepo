import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { manualEntryButtonLabel } from "./manual-entry-label.ts";

describe("manualEntryButtonLabel", () => {
  it("uses generic label for single manual-only tests", () => {
    assert.equal(
      manualEntryButtonLabel({
        isEdit: false,
        resultComponentName: "Manual result",
        resultComponentCode: "RESULT",
      }),
      "Enter result",
    );
  });

  it("names urinalysis chemistry and microscopy distinctly", () => {
    assert.equal(
      manualEntryButtonLabel({
        isEdit: false,
        resultComponentName: "Urine chemistry / strip observations",
        resultComponentCode: "CHEMISTRY",
        siblingManualCount: 2,
      }),
      "Enter Urine chemistry / strip observations",
    );
    assert.equal(
      manualEntryButtonLabel({
        isEdit: false,
        resultComponentName: "Urine microscopy observations",
        resultComponentCode: "MICROSCOPY",
        siblingManualCount: 2,
      }),
      "Enter Urine microscopy observations",
    );
  });

  it("falls back to component code when multiple siblings lack display names", () => {
    assert.equal(
      manualEntryButtonLabel({
        isEdit: false,
        resultComponentCode: "CHEMISTRY",
        siblingManualCount: 2,
      }),
      "Enter Chemistry",
    );
  });

  it("uses component code for edit actions", () => {
    assert.equal(
      manualEntryButtonLabel({
        isEdit: true,
        resultComponentCode: "MICROSCOPY",
      }),
      "Edit Microscopy",
    );
  });
});
