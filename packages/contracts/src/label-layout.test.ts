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
  });
});

describe("formatSpecimenLabel", () => {
  it("does not duplicate mrn when already present on the name line", () => {
    const formatted = formatSpecimenLabel(
      {
        accessionNumber: "DH202608260001",
        specimenNumber: "DH202608260001-01",
        patientName: "Ricardo D Bennett · MRN7011",
        barcode: "DH202608260001-01",
        mrn: "MRN7011",
        departmentLabel: "Blood Chemistry",
        dateOfBirth: "1959-03-08",
      },
      LABEL_SIZES.tube_2x1,
    );
    assert.equal(formatted.patientName, "Ricardo D Bennett · MRN7011");
  });

  it("keeps full accession and specimen ids without ellipsis", () => {
    const formatted = formatSpecimenLabel(
      {
        accessionNumber: "DH202608260001",
        specimenNumber: "DH202608260001-01",
        patientName: "Very Long Patient Name That Should Not Fit",
        barcode: "DH202608260001-01",
        mrn: "MRN-1001",
        departmentLabel: "Blood Chemistry",
        dateOfBirth: "1988-03-14",
      },
      LABEL_SIZES.tube_2x1,
    );
    assert.equal(formatted.accessionNumber, "DH202608260001");
    assert.equal(formatted.specimenNumber, "DH202608260001-01");
    assert.match(formatted.patientName, /MRN-1001/);
    assert.equal(formatted.routingLine, "Blood Chemistry · 1988-03-14");
  });

  it("formats short routing line with collection and test block", () => {
    const { zpl, formatted } = buildSpecimenLabelDocument(
      {
        accessionNumber: "DH202608260001",
        specimenNumber: "DH202608260001-01",
        patientName: "Jane Doe",
        barcode: "DH202608260001-01",
        orderedTests: ["CBC", "CREATININE"],
        specimenType: "blood",
        departmentLabel: "Chemistry",
        departmentLabelShort: "Chem",
        collectionLabelShort: "Bld",
        includeCollectionOnRouting: true,
        mrn: "MRN-1001",
        dateOfBirth: "1990-01-15",
      },
      LABEL_SIZES.tube_2x1,
    );
    assert.equal(formatted.routingLine, "Chem · Bld · 1990-01-15");
    assert.ok(formatted.testLines.length > 0);
    assert.match(zpl, /Chem · Bld · 1990-01-15/);
    assert.match(zpl, /CBC/);
  });

  it("builds compact zpl without timestamp or 2d barcode", () => {
    const { zpl, formatted } = buildSpecimenLabelDocument(
      {
        accessionNumber: "DH202608260001",
        specimenNumber: "DH202608260001-01",
        patientName: "Jane Doe",
        barcode: "DH202608260001-01",
        orderedTests: ["CBC", "BMP"],
        specimenType: "blood",
        departmentLabel: "Haematology",
        mrn: "MRN-1001",
        dateOfBirth: "1990-01-15",
      },
      LABEL_SIZES.tube_2x1,
    );
    assert.match(zpl, /\^LL203/);
    assert.match(zpl, /\^PW406/);
    assert.match(zpl, /DH202608260001-01/);
    assert.match(zpl, /\^FB/);
    assert.doesNotMatch(zpl, /\^BXN/);
    assert.doesNotMatch(zpl, /2026-/);
    assert.match(formatted.patientName, /MRN-1001/);
    assert.equal(formatted.heightDots, 203);
  });
});
