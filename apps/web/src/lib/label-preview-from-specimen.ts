import type { LabelPreviewFields, SpecimenRow } from "./api";

function patientFromSpecimenJson(json: string | null): {
  displayName: string;
  dateOfBirth: string;
  mrn?: string;
} {
  if (!json) {
    return { displayName: "Unknown", dateOfBirth: "DOB —" };
  }
  try {
    const p = JSON.parse(json) as {
      firstName?: string;
      middleName?: string | null;
      lastName?: string;
      dateOfBirth?: string | null;
      mrn?: string;
    };
    const displayName =
      [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ") ||
      "Unknown";
    return {
      displayName,
      dateOfBirth: p.dateOfBirth?.trim() || "DOB —",
      mrn: p.mrn,
    };
  } catch {
    return { displayName: "Unknown", dateOfBirth: "DOB —" };
  }
}

function orderedTestsFromJson(json: string | null | undefined): string {
  if (!json) return "—";
  try {
    const parsed = JSON.parse(json) as Array<{ code?: string }>;
    const codes = parsed.map((t) => t.code).filter(Boolean) as string[];
    return codes.length > 0 ? codes.join(", ") : "—";
  } catch {
    return "—";
  }
}

export function findSpecimenByAccession(
  specimens: SpecimenRow[],
  accession: string,
): SpecimenRow | undefined {
  const trimmed = accession.trim();
  if (!trimmed) return undefined;
  return specimens.find(
    (s) => s.accessionNumber === trimmed || s.barcode === trimmed,
  );
}

/** Instant client-side preview from a registered specimen row. */
export function buildLabelPreviewFromSpecimen(
  row: SpecimenRow,
): LabelPreviewFields {
  const patient = patientFromSpecimenJson(row.patientJson);
  return {
    accessionNumber: row.accessionNumber,
    patientName: patient.displayName,
    barcode: row.barcode,
    dateOfBirth: patient.dateOfBirth,
    orderedTests: orderedTestsFromJson(row.orderedTestsJson),
    specimenType: row.specimenType?.trim() || "blood",
    mrn: patient.mrn,
    printedAt: row.registeredAt,
    widthDots: 406,
    heightDots: 203,
  };
}

export const TEST_LABEL_PREVIEW: LabelPreviewFields = {
  accessionNumber: "DH202608260001",
  patientName: "Test Patient",
  barcode: "DH202608260001",
  dateOfBirth: "1980-01-01",
  orderedTests: "CBC, BMP",
  specimenType: "blood",
  mrn: "MRN-TEST",
  printedAt: new Date().toISOString(),
  widthDots: 406,
  heightDots: 203,
};

export const PRINT_API_UNAVAILABLE_MSG =
  "Print API unavailable — restart edge-engine (pnpm --filter @drax-lis/edge-engine build, then restart dev).";
