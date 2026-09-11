import {
  CATALOG_CATEGORY_ORDER,
  type CatalogCategory,
} from "./catalog-categories";
import { normalizeCode } from "./test-fulfillment";

/** Long catalog codes → compact label text (still recognizable to lab staff). */
const LABEL_ABBREV: Record<string, string> = {
  URINALYSIS_COMPLETE: "UA Cmp",
  TOTAL_CHOLESTEROL: "T.Chol",
  HDL_CHOLESTEROL: "HDL",
  LDL_CHOLESTEROL: "LDL",
  MICROALBUMIN_24HR: "mAlb 24h",
  IRON_TIBC_SATURATION: "Fe/TIBC",
  PROTEIN_ELECTROPHORESIS: "Prot Elph",
  LIPO_ELECTROPHORESIS: "Lipo Elph",
  HB_ELECTROPHORESIS: "Hb Elph",
  BILIRUBIN_TOT_DIRECT: "Bili T/D",
  GLUCOSE_2HR_PP: "Glu 2hr",
  CULT_SENS_ROUTINE: "C+S",
  CULT_SENS_FUNGAL: "Fung C+S",
  AFB_SMEAR_CULTURE: "AFB",
  TOXOPLASMA_IGM: "Toxo IgM",
  RUBELLA_IGM: "Rub IgM",
  CMV_IGM: "CMV IgM",
  HERPES_I_IGM: "HSV IgM",
};

const CATEGORY_SORT_INDEX = new Map(
  CATALOG_CATEGORY_ORDER.map((c, i) => [c, i]),
);

export function abbreviateTestCodeForLabel(code: string): string {
  const normalized = normalizeCode(code);
  return LABEL_ABBREV[normalized] ?? normalized;
}

export function abbreviateTestsForLabel(
  codes: string[],
  categories?: Array<string | undefined>,
): string[] {
  const indexed = codes.map((code, i) => ({
    code,
    abbrev: abbreviateTestCodeForLabel(code),
    sort:
      CATEGORY_SORT_INDEX.get(
        (categories?.[i]?.trim() ?? "") as CatalogCategory,
      ) ?? 999,
  }));
  indexed.sort((a, b) => {
    if (a.sort !== b.sort) return a.sort - b.sort;
    return a.abbrev.localeCompare(b.abbrev);
  });
  return indexed.map((x) => x.abbrev);
}
