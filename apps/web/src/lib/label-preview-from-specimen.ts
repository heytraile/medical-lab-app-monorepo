import type { LabelPreviewFields, SpecimenRow } from "./api";
import { api } from "./api";
import {
  DRAX_HALL_ROUTING_POLICY,
  buildSpecimenLabelInput,
  resolveRoutingForScope,
  type LabRoutingSettings,
  type SpecimenLabelInputFields,
} from "@drax-lis/catalog";
import {
  LABEL_SIZES,
  DEFAULT_LABEL_SIZE_ID,
  formatSpecimenLabel,
  formattedToPreviewFields,
} from "@drax-lis/contracts";
import {
  parsePatientJson,
  patientDisplayNameFromJson,
} from "./specimen-display";
import {
  findSessionByAccession,
  groupSpecimensIntoSessions,
} from "./accession-sessions";

export { orderedTestCodesFromJson } from "./specimen-display";

function patientFromSpecimenJson(json: string | null): {
  displayName: string;
  dateOfBirth: string;
  mrn?: string;
} {
  const p = parsePatientJson(json);
  if (!p) {
    return { displayName: "Unknown", dateOfBirth: "DOB —" };
  }
  const displayName = patientDisplayNameFromJson(json);
  return {
    displayName: displayName === "—" ? "Unknown" : displayName,
    dateOfBirth: p.dateOfBirth?.trim() || "DOB —",
    mrn: p.mrn,
  };
}

function orderedTestCodesFromRow(row: SpecimenRow): string[] {
  if (row.orderedTests?.length) {
    return row.orderedTests.map((t) => t.code);
  }
  if (!row.orderedTestsJson) return [];
  try {
    const parsed = JSON.parse(row.orderedTestsJson) as Array<{ code?: string }>;
    return parsed.map((t) => String(t.code ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function labelInputFromRow(
  row: SpecimenRow,
  routing?: LabRoutingSettings,
) {
  const patient = patientFromSpecimenJson(row.patientJson);
  const labelRouting =
    routing ?? resolveRoutingForScope(DRAX_HALL_ROUTING_POLICY, "labels");
  return buildSpecimenLabelInput({
    accessionNumber: row.accessionNumber,
    specimenNumber: row.specimenNumber ?? row.barcode,
    patientName: patient.displayName,
    barcode: row.barcode,
    dateOfBirth: patient.dateOfBirth,
    departmentKey: row.departmentKey,
    catalogCategory: row.departmentKey,
    departmentLabel: row.departmentLabel,
    collectionType: row.collectionType ?? row.specimenType,
    mrn: patient.mrn,
    orderedTestCodes: orderedTestCodesFromRow(row),
    routing: labelRouting,
  });
}

/** Same payload accession + labels use for edge ZPL preview. */
export function printPreviewPayloadFromSpecimen(
  row: SpecimenRow,
  routing?: LabRoutingSettings,
): SpecimenLabelInputFields {
  return labelInputFromRow(row, routing);
}

/** Edge preview with client fallback — one code path for Labels + reprint. */
export async function fetchEdgeLabelPreviewForSpecimen(
  row: SpecimenRow,
  routing?: LabRoutingSettings,
): Promise<{ fields: LabelPreviewFields; edgeFailed: boolean }> {
  const client = buildLabelPreviewFromSpecimen(row, routing);
  try {
    const res = await api.printPreview(labelInputFromRow(row, routing));
    return { fields: res.fields, edgeFailed: false };
  } catch {
    return { fields: client, edgeFailed: true };
  }
}

export function findSpecimenByAccession(
  specimens: SpecimenRow[],
  accession: string,
): SpecimenRow | undefined {
  return findContainersByAccession(specimens, accession)[0];
}

/** Every routing label / container for one accession (one form → N labels). */
export function findContainersByAccession(
  specimens: SpecimenRow[],
  accession: string,
): SpecimenRow[] {
  const trimmed = accession.trim();
  if (!trimmed) return [];
  const sessions = groupSpecimensIntoSessions(specimens);
  const session = findSessionByAccession(sessions, trimmed);
  if (session?.tubes.length) return session.tubes;
  const needle = trimmed.toUpperCase();
  const match = specimens.find(
    (s) =>
      s.accessionNumber.toUpperCase() === needle ||
      s.barcode.toUpperCase() === needle ||
      s.specimenNumber?.toUpperCase() === needle,
  );
  return match ? [match] : [];
}

/** Instant client-side preview from a registered specimen row. */
export function buildLabelPreviewFromSpecimen(
  row: SpecimenRow,
  routing?: LabRoutingSettings,
): LabelPreviewFields {
  const formatted = formatSpecimenLabel(
    labelInputFromRow(row, routing),
    LABEL_SIZES[DEFAULT_LABEL_SIZE_ID],
    row.registeredAt,
  );
  return formattedToPreviewFields(formatted);
}

export const TEST_LABEL_PREVIEW: LabelPreviewFields = formattedToPreviewFields(
  formatSpecimenLabel(
    buildSpecimenLabelInput({
      accessionNumber: "DH202608260001",
      specimenNumber: "DH202608260001-01",
      patientName: "Test Patient",
      barcode: "DH202608260001-01",
      dateOfBirth: "1980-01-01",
      collectionType: "blood",
      departmentKey: "chemistry",
      departmentLabel: "Chemistry",
      orderedTestCodes: ["CREATININE", "LIPIDS"],
      mrn: "MRN-TEST",
    }),
    LABEL_SIZES[DEFAULT_LABEL_SIZE_ID],
  ),
);

export const PRINT_API_UNAVAILABLE_MSG =
  "Printing is not available right now. Try again in a moment.";
