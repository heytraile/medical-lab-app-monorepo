import {
  buildSpecimenLabelInput,
  groupSpecimensForLabelPrint,
  type LabelPrintGroup,
  type LabRoutingSettings,
} from "@drax-lis/catalog";
import {
  DEFAULT_LABEL_SIZE_ID,
  LABEL_SIZES,
  formatSpecimenLabel,
  formattedToPreviewFields,
} from "@drax-lis/contracts";
import type { LabelPreviewFields, SpecimenRow } from "./api";
import {
  parsePatientJson,
  patientDisplayNameFromJson,
} from "./specimen-display";

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

export function labelPrintGroupsFromSpecimenRows(
  rows: SpecimenRow[],
  labelRouting?: LabRoutingSettings,
): LabelPrintGroup[] {
  return groupSpecimensForLabelPrint(
    rows.map((row) => ({
      id: row.id,
      accessionNumber: row.accessionNumber,
      specimenNumber: row.specimenNumber ?? row.barcode,
      barcode: row.barcode,
      departmentKey: row.departmentKey ?? "general",
      departmentLabel: row.departmentLabel,
      collectionType: row.collectionType ?? row.specimenType,
      orderedTestCodes: orderedTestCodesFromRow(row),
    })),
    labelRouting,
  );
}

export function buildLabelPreviewFromPrintGroup(
  group: LabelPrintGroup,
  patientRow: SpecimenRow,
  labelRouting?: LabRoutingSettings,
): LabelPreviewFields {
  const patient = parsePatientJson(patientRow.patientJson);
  const displayName = patientDisplayNameFromJson(patientRow.patientJson);
  const formatted = formatSpecimenLabel(
    buildSpecimenLabelInput({
      accessionNumber: patientRow.accessionNumber,
      specimenNumber: group.primarySpecimenNumber,
      patientName: displayName === "—" ? "Unknown" : displayName,
      barcode: group.primaryBarcode,
      dateOfBirth: patient?.dateOfBirth?.trim() || "DOB —",
      collectionType: group.collectionType,
      departmentKey: group.departmentKey,
      catalogCategory: group.catalogCategory,
      departmentLabel: group.departmentLabel,
      orderedTestCodes: group.orderedTestCodes,
      mrn: patient?.mrn,
      routing: labelRouting,
    }),
    LABEL_SIZES[DEFAULT_LABEL_SIZE_ID],
    patientRow.registeredAt,
  );
  return formattedToPreviewFields(formatted);
}
