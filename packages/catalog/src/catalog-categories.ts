/** Requisition form section keys (matches `category` on catalog items). */
export type CatalogCategory =
  | "blood_chemistry"
  | "haematology"
  | "endocrinology"
  | "urine_chemistry"
  | "immunology"
  | "anaemia"
  | "special_chemistry"
  | "cardiac_enzymes"
  | "bacteriology"
  | "faeces_misc"
  | "drugs_of_abuse"
  | "therapeutic_drug";

export const CATALOG_CATEGORY_LABELS: Record<CatalogCategory, string> = {
  blood_chemistry: "Blood Chemistry",
  haematology: "Haematology",
  endocrinology: "Endocrinology",
  urine_chemistry: "Urine Chemistry",
  immunology: "Immunology",
  anaemia: "Anaemia",
  special_chemistry: "Special Chemistry",
  cardiac_enzymes: "Cardiac Enzymes",
  bacteriology: "Bacteriology",
  faeces_misc: "Faeces / Miscellaneous",
  drugs_of_abuse: "Drugs of Abuse",
  therapeutic_drug: "Therapeutic Drug",
};

/** Print / routing label order (matches requisition form). */
export const CATALOG_CATEGORY_ORDER: CatalogCategory[] = [
  "haematology",
  "blood_chemistry",
  "cardiac_enzymes",
  "endocrinology",
  "immunology",
  "anaemia",
  "special_chemistry",
  "urine_chemistry",
  "bacteriology",
  "faeces_misc",
  "drugs_of_abuse",
  "therapeutic_drug",
];

export function categoryLabel(category: string | undefined): string {
  const key = category?.trim() as CatalogCategory;
  return CATALOG_CATEGORY_LABELS[key] ?? category?.trim() ?? "General";
}
