import type { LabelPreviewFields, SpecimenRow } from "./api";
import { api } from "./api";
import {
  LABEL_SIZES,
  DEFAULT_LABEL_SIZE_ID,
  formatSpecimenLabel,
  formattedToPreviewFields,
} from "@drax-lis/contracts";

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

export function orderedTestCodesFromJson(
  json: string | null | undefined,
): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as Array<{ code?: string }>;
    return parsed.map((t) => t.code).filter(Boolean) as string[];
  } catch {
    return [];
  }
}

/** Same payload accession + labels use for edge ZPL preview. */
export function printPreviewPayloadFromSpecimen(row: SpecimenRow) {
  const client = buildLabelPreviewFromSpecimen(row);
  return {
    accessionNumber: row.accessionNumber,
    patientName: client.patientName,
    barcode: row.barcode,
    dateOfBirth: client.dateOfBirth,
    orderedTests: orderedTestCodesFromJson(row.orderedTestsJson),
    specimenType: row.specimenType?.trim() || "blood",
    mrn: client.mrn,
  };
}

/** Edge preview with client fallback — one code path for Labels + reprint. */
export async function fetchEdgeLabelPreviewForSpecimen(
  row: SpecimenRow,
): Promise<{ fields: LabelPreviewFields; edgeFailed: boolean }> {
  const client = buildLabelPreviewFromSpecimen(row);
  try {
    const res = await api.printPreview(printPreviewPayloadFromSpecimen(row));
    return { fields: res.fields, edgeFailed: false };
  } catch {
    return { fields: client, edgeFailed: true };
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
  const formatted = formatSpecimenLabel(
    {
      accessionNumber: row.accessionNumber,
      patientName: patient.displayName,
      barcode: row.barcode,
      dateOfBirth: patient.dateOfBirth,
      orderedTests: orderedTestCodesFromJson(row.orderedTestsJson),
      specimenType: row.specimenType?.trim() || "blood",
      mrn: patient.mrn,
    },
    LABEL_SIZES[DEFAULT_LABEL_SIZE_ID],
    row.registeredAt,
  );
  return formattedToPreviewFields(formatted);
}

export const TEST_LABEL_PREVIEW: LabelPreviewFields = formattedToPreviewFields(
  formatSpecimenLabel(
    {
      accessionNumber: "DH202608260001",
      patientName: "Test Patient",
      barcode: "DH202608260001",
      dateOfBirth: "1980-01-01",
      orderedTests: ["CBC", "BMP"],
      specimenType: "blood",
      mrn: "MRN-TEST",
    },
    LABEL_SIZES[DEFAULT_LABEL_SIZE_ID],
  ),
);

export const PRINT_API_UNAVAILABLE_MSG =
  "Printing is not available right now. Try again in a moment.";
