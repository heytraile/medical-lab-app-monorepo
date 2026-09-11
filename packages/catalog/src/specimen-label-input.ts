import { abbreviateTestsForLabel } from "./label-test-abbrev";
import {
  collectionTypeLabelShort,
  normalizeCollectionType,
} from "./collection-type";
import {
  DRAX_HALL_ROUTING_SETTINGS,
  resolveRoutingDepartment,
  resolveRoutingDepartmentByKey,
  type LabRoutingSettings,
} from "./routing-departments";

/** Shape consumed by `formatSpecimenLabel` in `@drax-lis/contracts`. */
export type SpecimenLabelInputFields = {
  accessionNumber: string;
  specimenNumber?: string;
  patientName: string;
  barcode: string;
  dateOfBirth?: string | null;
  orderedTests?: string[];
  specimenType?: string;
  departmentLabel?: string;
  departmentLabelShort?: string;
  collectionLabelShort?: string;
  includeCollectionOnRouting?: boolean;
  mrn?: string;
};

export function buildSpecimenLabelInput(args: {
  accessionNumber: string;
  specimenNumber?: string;
  patientName: string;
  barcode: string;
  dateOfBirth?: string | null;
  departmentKey?: string;
  /** Granular catalog category — used for consolidated label routing. */
  catalogCategory?: string;
  departmentLabel?: string;
  collectionType?: string;
  specimenType?: string;
  mrn?: string;
  orderedTestCodes?: string[];
  routing?: LabRoutingSettings;
}): SpecimenLabelInputFields {
  const routing = args.routing ?? DRAX_HALL_ROUTING_SETTINGS;
  const category =
    args.catalogCategory?.trim() || args.departmentKey?.trim() || "";
  const resolved = category
    ? routing.departments.some((d) => d.key === category)
      ? resolveRoutingDepartmentByKey(category, routing)
      : routing.mode === "consolidated"
        ? resolveRoutingDepartment(category, routing)
        : resolveRoutingDepartmentByKey(category, routing)
    : {
        key: "",
        label: args.departmentLabel?.trim() || "General",
        labelShort: args.departmentLabel?.trim()?.slice(0, 8) || "Gen",
      };
  const collectionType = normalizeCollectionType(
    args.collectionType ?? args.specimenType,
  );
  const includeCollection = routing.splitByCollectionType;
  const abbrevTests = abbreviateTestsForLabel(args.orderedTestCodes ?? []);

  return {
    accessionNumber: args.accessionNumber,
    specimenNumber: args.specimenNumber,
    patientName: args.patientName,
    barcode: args.barcode,
    dateOfBirth: args.dateOfBirth,
    specimenType: collectionType,
    departmentLabel: args.departmentLabel?.trim() || resolved.label,
    departmentLabelShort: resolved.labelShort,
    collectionLabelShort: includeCollection
      ? collectionTypeLabelShort(collectionType)
      : undefined,
    includeCollectionOnRouting: includeCollection,
    orderedTests: abbrevTests,
    mrn: args.mrn,
  };
}
