import type { LabelPreviewFields, PatientListItem } from "./api";

/** Instant client-side preview before accession is issued. */
export function buildDraftLabelPreview(
  patient: PatientListItem,
  testCodes: string[],
): LabelPreviewFields {
  return {
    accessionNumber: "Assigns on register",
    patientName: patient.displayName,
    barcode: patient.mrn,
    dateOfBirth: patient.dateOfBirth?.trim() || "DOB —",
    orderedTests: testCodes.length > 0 ? testCodes.join(", ") : "—",
    specimenType: "blood",
    mrn: patient.mrn,
    printedAt: new Date().toISOString(),
    widthDots: 406,
    heightDots: 203,
  };
}

export const ACCESSION_RE = /^DH\d{12}$/i;
