import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LABEL_SIZE_ID,
  LABEL_SIZES,
  buildSpecimenLabelDocument,
  formatSpecimenLabel,
  formatTestLines,
  resolveLabelSize,
} from "./label-layout";

describe("resolveLabelSize", () => {
  it("defaults to tube_2x1", () => {
    const s = resolveLabelSize();
    assert.equal(s.id, DEFAULT_LABEL_SIZE_ID);
    assert.equal(s.widthDots, 406);
    assert.equal(s.heightDots, 203);
  });

  it("resolves by size id", () => {
    const s = resolveLabelSize({ sizeId: "tube_4x2" });
    assert.equal(s.widthDots, 812);
  });
});

describe("formatTestLines", () => {
  it("wraps codes onto multiple lines", () => {
    const codes = ["CBC", "CREATININE", "GLUCOSE_RAND", "ALT_SGPT"];
    const { lines, overflowCount } = formatTestLines(codes, 2, 24);
    assert.equal(lines.length, 2);
    assert.equal(overflowCount, 0);
    assert.ok(lines[0]?.includes("CBC"));
  });

  it("reports overflow when codes do not fit", () => {
    const codes = Array.from({ length: 12 }, (_, i) => `TEST_${i}`);
    const { lines, overflowCount } = formatTestLines(codes, 2, 18);
    assert.equal(lines.length, 2);
    assert.ok(overflowCount > 0);
    assert.match(lines[1] ?? "", /\+\d+$/);
  });
});

describe("formatSpecimenLabel", () => {
  it("truncates long patient names on 2x1", () => {
    const formatted = formatSpecimenLabel(
      {
        accessionNumber: "DH202608260001",
        patientName: "Very Long Patient Name That Should Not Fit",
        barcode: "DH202608260001",
        orderedTests: ["CBC"],
      },
      LABEL_SIZES.tube_2x1,
    );
    assert.ok(formatted.patientName.length <= 28);
    assert.ok(formatted.patientName.endsWith("…") || formatted.patientName.length < 40);
  });

  it("builds zpl with fixed label length", () => {
    const { zpl, formatted } = buildSpecimenLabelDocument(
      {
        accessionNumber: "DH202608260001",
        patientName: "Jane Doe",
        barcode: "DH202608260001",
        orderedTests: ["CBC", "BMP"],
        specimenType: "blood",
      },
      LABEL_SIZES.tube_2x1,
    );
    assert.match(zpl, /\^LL203/);
    assert.match(zpl, /\^PW406/);
    assert.equal(formatted.heightDots, 203);
  });
});
