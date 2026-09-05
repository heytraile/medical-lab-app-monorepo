import { DHMS_CATALOG_ITEMS, type CatalogItemSeed } from "./dhms-catalog";
import { buildCatalogMaps } from "./expand-selection";

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export type AnalyzerId =
  | "sysmex_xs1000i"
  | "mindray_bs240"
  | "yhlo_iflash1200"
  | "diamond_prolyte";

export type Fulfillment = "instrument" | "manual" | "send_out";

export type SimAnalyte = {
  instrumentCode: string;
  catalogCodes: string[];
  value: string;
  units: string;
  referenceLow?: number;
  referenceHigh?: number;
  flag?: "normal" | "high" | "low" | "unknown";
};

/** Categories whose tests are not run on the four bench analyzers. */
export const MANUAL_CATEGORIES = new Set([
  "bacteriology",
  "faeces_misc",
  "urine_chemistry",
  "special_chemistry",
]);

/** Individual form codes handled manually or off-instrument. */
export const MANUAL_CATALOG_CODES = new Set(
  [
    "GROUP_RH",
    "CROSS_MATCH",
    "SICKLE_TEST",
    "COOMBS_DCT",
    "COOMBS_ICT",
    "G6PD",
    "HB_ELECTROPHORESIS",
    "PROTEIN_ELECTROPHORESIS",
    "LIPO_ELECTROPHORESIS",
    "PAP_SMEAR",
    "SEMEN_ANALYSIS",
    "STONE_ANALYSIS",
    "CULT_SENS_ROUTINE",
    "CULT_SENS_FUNGAL",
    "AFB_SMEAR_CULTURE",
    "GRAM_SMEAR",
    "WET_PREP",
    "CHLAMYDIA",
    "SPECIMEN",
    "AMOEBA",
    "OCCULT_BLOOD",
    "OVA_PARASITES",
    "LUPUS_ANTICOAG",
    "FIBRINOGEN",
    "PT_INR",
    "PTT",
    "MONO",
    "INDICES",
    "ESR",
  ].map(normalizeCode),
);

/** Canned analytes per machine (simulator + remap source of truth). */
export const ANALYZER_SIM_ANALYTES: Record<AnalyzerId, SimAnalyte[]> = {
  sysmex_xs1000i: [
    {
      instrumentCode: "WBC",
      catalogCodes: ["CBC", "WBC_DIFF"],
      value: "6.5",
      units: "10*3/uL",
      referenceLow: 4,
      referenceHigh: 11,
      flag: "normal",
    },
    {
      instrumentCode: "RBC",
      catalogCodes: ["CBC", "RBC"],
      value: "4.6",
      units: "10*6/uL",
      referenceLow: 3.8,
      referenceHigh: 5.5,
      flag: "normal",
    },
    {
      instrumentCode: "HGB",
      catalogCodes: ["CBC", "HB", "HB_PCV"],
      value: "13.8",
      units: "g/dL",
      referenceLow: 12,
      referenceHigh: 16,
      flag: "normal",
    },
    {
      instrumentCode: "HCT",
      catalogCodes: ["CBC", "HB_PCV"],
      value: "41.2",
      units: "%",
      referenceLow: 36,
      referenceHigh: 46,
      flag: "normal",
    },
    {
      instrumentCode: "PLT",
      catalogCodes: ["CBC", "PLATELETS"],
      value: "245",
      units: "10*3/uL",
      referenceLow: 150,
      referenceHigh: 400,
      flag: "normal",
    },
    {
      instrumentCode: "RETIC",
      catalogCodes: ["RETICULOCYTE"],
      value: "1.2",
      units: "%",
      referenceLow: 0.5,
      referenceHigh: 2.5,
      flag: "normal",
    },
  ],
  mindray_bs240: [
    {
      instrumentCode: "GLU",
      catalogCodes: [
        "GLUCOSE_RAND",
        "GLUCOSE_FAST",
        "GLUCOSE_2HR_PP",
        "GLUCOSE_OSULLIVAN",
        "GTT_2_3_4_6HR",
      ],
      value: "95",
      units: "mg/dL",
      referenceLow: 70,
      referenceHigh: 100,
      flag: "normal",
    },
    {
      instrumentCode: "BUN",
      catalogCodes: ["UREA_BUN"],
      value: "18",
      units: "mg/dL",
      referenceLow: 7,
      referenceHigh: 20,
      flag: "normal",
    },
    {
      instrumentCode: "CREA",
      catalogCodes: ["CREATININE"],
      value: "0.9",
      units: "mg/dL",
      referenceLow: 0.6,
      referenceHigh: 1.2,
      flag: "normal",
    },
    {
      instrumentCode: "ALT",
      catalogCodes: ["ALT_SGPT"],
      value: "55",
      units: "U/L",
      referenceLow: 7,
      referenceHigh: 56,
      flag: "normal",
    },
    {
      instrumentCode: "AST",
      catalogCodes: ["AST_SGOT", "AST_SGOT_CARDIAC"],
      value: "42",
      units: "U/L",
      referenceLow: 10,
      referenceHigh: 40,
      flag: "high",
    },
    {
      instrumentCode: "CHOL",
      catalogCodes: ["TOTAL_CHOLESTEROL", "LIPIDS"],
      value: "185",
      units: "mg/dL",
      referenceLow: 0,
      referenceHigh: 200,
      flag: "normal",
    },
    {
      instrumentCode: "HDL",
      catalogCodes: ["HDL_CHOLESTEROL", "LIPIDS"],
      value: "52",
      units: "mg/dL",
      referenceLow: 40,
      referenceHigh: 999,
      flag: "normal",
    },
    {
      instrumentCode: "LDL",
      catalogCodes: ["LDL_CHOLESTEROL", "LIPIDS"],
      value: "110",
      units: "mg/dL",
      referenceLow: 0,
      referenceHigh: 130,
      flag: "normal",
    },
    {
      instrumentCode: "TRIG",
      catalogCodes: ["TRIGLYCERIDE", "LIPIDS"],
      value: "120",
      units: "mg/dL",
      referenceLow: 0,
      referenceHigh: 150,
      flag: "normal",
    },
    {
      instrumentCode: "HBA1C",
      catalogCodes: ["HBA1C"],
      value: "5.8",
      units: "%",
      referenceLow: 4,
      referenceHigh: 6,
      flag: "normal",
    },
    {
      instrumentCode: "CKMB",
      catalogCodes: ["CK_MB"],
      value: "2.1",
      units: "ng/mL",
      referenceLow: 0,
      referenceHigh: 5,
      flag: "normal",
    },
    {
      instrumentCode: "CPK",
      catalogCodes: ["CPK_TOTAL"],
      value: "88",
      units: "U/L",
      referenceLow: 20,
      referenceHigh: 200,
      flag: "normal",
    },
  ],
  diamond_prolyte: [
    {
      instrumentCode: "NA",
      catalogCodes: ["ELECTROLYTES"],
      value: "140.2",
      units: "mmol/L",
      referenceLow: 136,
      referenceHigh: 145,
      flag: "normal",
    },
    {
      instrumentCode: "K",
      catalogCodes: ["ELECTROLYTES"],
      value: "4.15",
      units: "mmol/L",
      referenceLow: 3.5,
      referenceHigh: 5,
      flag: "normal",
    },
    {
      instrumentCode: "CL",
      catalogCodes: ["ELECTROLYTES"],
      value: "102.0",
      units: "mmol/L",
      referenceLow: 98,
      referenceHigh: 106,
      flag: "normal",
    },
    {
      instrumentCode: "LI",
      catalogCodes: ["LITHIUM"],
      value: "0.85",
      units: "mmol/L",
      referenceLow: 0.6,
      referenceHigh: 1.2,
      flag: "normal",
    },
  ],
  yhlo_iflash1200: [
    {
      instrumentCode: "TSH",
      catalogCodes: ["TSH", "HS_TSH"],
      value: "2.45",
      units: "mIU/L",
      referenceLow: 0.35,
      referenceHigh: 4.94,
      flag: "normal",
    },
    {
      instrumentCode: "T4",
      catalogCodes: ["T4_TOTAL", "T4_FREE"],
      value: "8.2",
      units: "µg/dL",
      referenceLow: 4.5,
      referenceHigh: 12,
      flag: "normal",
    },
    {
      instrumentCode: "FSH",
      catalogCodes: ["FSH"],
      value: "6.1",
      units: "mIU/mL",
      referenceLow: 1,
      referenceHigh: 12,
      flag: "normal",
    },
    {
      instrumentCode: "LH",
      catalogCodes: ["LH"],
      value: "5.4",
      units: "mIU/mL",
      referenceLow: 1,
      referenceHigh: 10,
      flag: "normal",
    },
    {
      instrumentCode: "PROLACTIN",
      catalogCodes: ["PROLACTIN"],
      value: "11.2",
      units: "ng/mL",
      referenceLow: 2,
      referenceHigh: 18,
      flag: "normal",
    },
    {
      instrumentCode: "FERRITIN",
      catalogCodes: ["FERRITIN"],
      value: "85",
      units: "ng/mL",
      referenceLow: 12,
      referenceHigh: 300,
      flag: "normal",
    },
    {
      instrumentCode: "TROPONIN",
      catalogCodes: ["TROPONIN_I", "TROPONIN_I_QUANT", "TROPONIN_I_QUAL"],
      value: "0.01",
      units: "ng/mL",
      referenceLow: 0,
      referenceHigh: 0.04,
      flag: "normal",
    },
    {
      instrumentCode: "HIV",
      catalogCodes: ["HIV_1_2"],
      value: "Non-Reactive",
      units: "",
      flag: "normal",
    },
  ],
};

const catalogByCode = buildCatalogMaps(DHMS_CATALOG_ITEMS);

const instrumentCatalogCodes = new Set<string>();
const catalogToAnalyzer = new Map<string, AnalyzerId>();

for (const [analyzerId, analytes] of Object.entries(ANALYZER_SIM_ANALYTES) as [
  AnalyzerId,
  SimAnalyte[],
][]) {
  for (const analyte of analytes) {
    for (const code of analyte.catalogCodes) {
      const key = normalizeCode(code);
      instrumentCatalogCodes.add(key);
      if (!catalogToAnalyzer.has(key)) {
        catalogToAnalyzer.set(key, analyzerId);
      }
    }
  }
}

const instrumentLookup = new Map<string, SimAnalyte>();
for (const [analyzerId, analytes] of Object.entries(ANALYZER_SIM_ANALYTES) as [
  AnalyzerId,
  SimAnalyte[],
][]) {
  for (const analyte of analytes) {
    instrumentLookup.set(`${analyzerId}:${analyte.instrumentCode}`, analyte);
  }
}

export function getCatalogItem(code: string): CatalogItemSeed | undefined {
  return catalogByCode.get(normalizeCode(code));
}

export function getCatalogDisplayName(code: string): string {
  return getCatalogItem(code)?.name ?? code;
}

export function getFulfillment(catalogCode: string): Fulfillment {
  const key = normalizeCode(catalogCode);
  const item = catalogByCode.get(key);
  if (MANUAL_CATALOG_CODES.has(key)) return "manual";
  if (item && MANUAL_CATEGORIES.has(item.category)) return "manual";
  if (instrumentCatalogCodes.has(key)) return "instrument";
  if (item?.category === "drugs_of_abuse") return "send_out";
  return "manual";
}

export function getAnalyzerForCatalogCode(
  catalogCode: string,
): AnalyzerId | null {
  return catalogToAnalyzer.get(normalizeCode(catalogCode)) ?? null;
}

export function instrumentToCatalogCodes(
  analyzerId: AnalyzerId,
  instrumentCode: string,
): string[] {
  const analyte = instrumentLookup.get(
    `${analyzerId}:${instrumentCode.toUpperCase()}`,
  );
  return analyte?.catalogCodes.map(normalizeCode) ?? [];
}

export function pickCatalogCodeForResult(
  analyzerId: AnalyzerId,
  instrumentCode: string,
  orderedCatalogCodes: Iterable<string>,
): { catalogCode: string; expected: boolean; instrumentCode: string } {
  const mapped = instrumentToCatalogCodes(analyzerId, instrumentCode);
  if (mapped.length === 0) {
    return {
      catalogCode: normalizeCode(instrumentCode),
      expected: false,
      instrumentCode: instrumentCode.toUpperCase(),
    };
  }

  const ordered = new Set(
    [...orderedCatalogCodes].map(normalizeCode).filter(Boolean),
  );

  for (const code of mapped) {
    if (ordered.has(code)) {
      return { catalogCode: code, expected: true, instrumentCode: instrumentCode.toUpperCase() };
    }
  }

  return {
    catalogCode: mapped[0]!,
    expected: ordered.size === 0,
    instrumentCode: instrumentCode.toUpperCase(),
  };
}

export function analytesForOrder(
  analyzerId: AnalyzerId,
  orderedCatalogCodes: string[],
): SimAnalyte[] {
  const ordered = new Set(orderedCatalogCodes.map(normalizeCode));
  if (ordered.size === 0) {
    return ANALYZER_SIM_ANALYTES[analyzerId];
  }

  return ANALYZER_SIM_ANALYTES[analyzerId].filter((analyte) =>
    analyte.catalogCodes.some((code) => ordered.has(normalizeCode(code))),
  );
}

export function analyzerHasWork(
  analyzerId: AnalyzerId,
  orderedCatalogCodes: string[],
): boolean {
  return analytesForOrder(analyzerId, orderedCatalogCodes).length > 0;
}

export function parseOrderedTestCodes(
  orderedTestsJson: string | null | undefined,
): string[] {
  if (!orderedTestsJson) return [];
  try {
    const parsed = JSON.parse(orderedTestsJson) as Array<{ code?: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => row.code)
      .filter((code): code is string => Boolean(code?.trim()))
      .map(normalizeCode);
  } catch {
    return [];
  }
}

export function isResultExpectedOnOrder(
  catalogCode: string,
  orderedCatalogCodes: string[],
): boolean {
  const ordered = new Set(orderedCatalogCodes.map(normalizeCode));
  if (ordered.size === 0) return true;
  return ordered.has(normalizeCode(catalogCode));
}

export function manualTestsInOrder(orderedCatalogCodes: string[]): string[] {
  return orderedCatalogCodes.filter(
    (code) => getFulfillment(code) === "manual",
  );
}

export function nonInstrumentTestsInOrder(codes: string[]): string[] {
  return codes.filter((c) => {
    const f = getFulfillment(c);
    return f === "manual" || f === "send_out";
  });
}

export function pendingNonInstrumentTests(
  orderedCodes: string[],
  receivedTestCodes: Iterable<string>,
): string[] {
  const received = new Set([...receivedTestCodes].map(normalizeCode));
  return nonInstrumentTestsInOrder(orderedCodes).filter(
    (c) => !received.has(normalizeCode(c)),
  );
}

export function allSimulatorInstrumentCodes(): string[] {
  const codes = new Set<string>();
  for (const analytes of Object.values(ANALYZER_SIM_ANALYTES)) {
    for (const a of analytes) {
      codes.add(a.instrumentCode);
    }
  }
  return [...codes];
}
