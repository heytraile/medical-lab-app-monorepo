import {
  collectionTypeLabel,
  collectionTypeLabelShort,
  normalizeCollectionType,
  type CollectionType,
} from "./collection-type";
import {
  resolveRoutingDepartment,
  routingDepartmentSortIndex,
  ROUTING_PRESET_GRANULAR,
  type LabRoutingSettings,
} from "./routing-departments";

export type SpecimenForLabelPrint = {
  id?: string;
  accessionNumber: string;
  specimenNumber?: string;
  barcode: string;
  /** Granular catalog category id stored on the specimen row. */
  departmentKey: string;
  departmentLabel?: string;
  collectionType?: string;
  orderedTestCodes: string[];
};

export type LabelPrintGroup = {
  /** Consolidated routing department key (e.g. chemistry). */
  departmentKey: string;
  departmentLabel: string;
  departmentLabelShort: string;
  /** Granular catalog category on the specimen row — used for routing resolution. */
  catalogCategory: string;
  collectionType: CollectionType;
  collectionLabel: string;
  collectionLabelShort: string;
  orderedTestCodes: string[];
  specimenIds: string[];
  specimenNumbers: string[];
  barcodes: string[];
  primarySpecimenNumber: string;
  primaryBarcode: string;
};

/** One label print entry per specimen; consolidated routing metadata only. */
export function groupSpecimensForLabelPrint(
  specimens: SpecimenForLabelPrint[],
  labelRouting: LabRoutingSettings = ROUTING_PRESET_GRANULAR,
): LabelPrintGroup[] {
  const collectionOrder: CollectionType[] = [
    "blood",
    "urine",
    "stool",
    "other",
  ];

  const entries = specimens.map((row) => {
    const collectionType = normalizeCollectionType(row.collectionType);
    const routing = resolveRoutingDepartment(row.departmentKey, labelRouting);
    return { row, collectionType, routing };
  });

  entries.sort((a, b) => {
    const ai = routingDepartmentSortIndex(a.routing.key, labelRouting);
    const bi = routingDepartmentSortIndex(b.routing.key, labelRouting);
    if (ai !== bi) return ai - bi;
    const ci =
      collectionOrder.indexOf(a.collectionType) -
      collectionOrder.indexOf(b.collectionType);
    if (ci !== 0) return ci;
    const an = a.row.specimenNumber ?? a.row.barcode;
    const bn = b.row.specimenNumber ?? b.row.barcode;
    return an.localeCompare(bn);
  });

  return entries.map(({ row, collectionType, routing }) => ({
    departmentKey: routing.key,
    departmentLabel: routing.label,
    departmentLabelShort: routing.labelShort,
    catalogCategory: row.departmentKey,
    collectionType,
    collectionLabel: collectionTypeLabel(collectionType),
    collectionLabelShort: collectionTypeLabelShort(collectionType),
    orderedTestCodes: row.orderedTestCodes,
    specimenIds: row.id ? [row.id] : [],
    specimenNumbers: [row.specimenNumber ?? row.barcode].filter(Boolean),
    barcodes: [row.barcode],
    primarySpecimenNumber: row.specimenNumber ?? row.barcode,
    primaryBarcode: row.barcode,
  }));
}
