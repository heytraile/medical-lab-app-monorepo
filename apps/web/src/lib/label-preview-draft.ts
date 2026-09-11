import {
  buildSpecimenLabelInput,
  type LabRoutingSettings,
} from "@drax-lis/catalog";
import {
  DEFAULT_LABEL_SIZE_ID,
  LABEL_SIZES,
  formatSpecimenLabel,
  formattedToPreviewFields,
} from "@drax-lis/contracts";
import type { LabelPreviewFields, PatientListItem } from "./api";
import type { CollectionType, ExpandedOrderedTest } from "@drax-lis/catalog";

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
  group: {
    departmentKey: string;
    departmentLabel: string;
    collectionType: CollectionType | string;
    tests: ExpandedOrderedTest[];
  },
  labelRouting?: LabRoutingSettings,
): LabelPreviewFields {
  const formatted = formatSpecimenLabel(
    buildSpecimenLabelInput({
      accessionNumber: "Assigns on accession",
      specimenNumber: "Assigns per tube",
      patientName: patient.displayName,
      barcode: "Assigns per tube",
      dateOfBirth: patient.dateOfBirth,
      collectionType: group.collectionType,
      departmentKey: group.departmentKey,
      departmentLabel: group.departmentLabel,
      orderedTestCodes: group.tests.map((t) => t.code),
      catalogCategory: group.departmentKey,
      mrn: patient.mrn,
      routing: labelRouting,
    }),
    LABEL_SIZES[DEFAULT_LABEL_SIZE_ID],
  );
  return formattedToPreviewFields(formatted);
}

export const ACCESSION_RE = /^DH\d{12}$/i;
