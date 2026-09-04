import {
  DEFAULT_LABEL_SIZE_ID,
  LABEL_SIZES,
  formatSpecimenLabel,
  formattedToPreviewFields,
} from "@drax-lis/contracts";
import type { LabelPreviewFields, PatientListItem } from "./api";

export {
  labelPreviewWidthPx,
  labelPreviewHeightPx,
  DEFAULT_LABEL_WIDTH_DOTS,
  DEFAULT_LABEL_HEIGHT_DOTS,
  LABEL_PREVIEW_SCALE,
} from "@drax-lis/contracts";

/** Instant client-side preview before accession is issued. */
export function buildDraftLabelPreview(
  patient: PatientListItem,
  testCodes: string[],
  specimenType = "blood",
): LabelPreviewFields {
  const formatted = formatSpecimenLabel(
    {
      accessionNumber: "Assigns on accession",
      patientName: patient.displayName,
      barcode: patient.mrn,
      dateOfBirth: patient.dateOfBirth,
      orderedTests: testCodes,
      specimenType,
      mrn: patient.mrn,
    },
    LABEL_SIZES[DEFAULT_LABEL_SIZE_ID],
  );
  return formattedToPreviewFields(formatted);
}

export const ACCESSION_RE = /^DH\d{12}$/i;
