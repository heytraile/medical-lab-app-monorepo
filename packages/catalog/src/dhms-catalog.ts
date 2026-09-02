/** Drax Hall DHMS requisition form — catalog seed (page 1 panels + individual tests). */

import { DHMS_CATALOG_ITEMS } from "./dhms-catalog-items";
import type { CatalogItemSeed, PanelSeed } from "./dhms-catalog-types";

export type { CatalogItemSeed, PanelSeed } from "./dhms-catalog-types";
export { DHMS_CATALOG_ITEMS };

export const CATALOG_VERSION = 2;

export const DRAX_HALL_LAB = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  code: "drax-hall",
  name: "Drax Hall Clinical Laboratory",
} as const;

/** Test profiles & panels from DHMS form page 1. */
export const DHMS_PANELS: PanelSeed[] = [
  { code: "AMENORRHOEA_I", name: "Amenorrhoea I", memberCodes: ["PROLACTIN", "FSH", "T4_TOTAL", "TSH"], sortOrder: 10 },
  { code: "AMENORRHOEA_II", name: "Amenorrhoea II", memberCodes: ["PROLACTIN", "LH", "FSH"], sortOrder: 20 },
  { code: "ANAEMIA_I", name: "Anaemia I", memberCodes: ["CBC", "RETICULOCYTE", "SICKLE_TEST", "FERRITIN"], sortOrder: 30 },
  { code: "ANAEMIA_II", name: "Anaemia II", memberCodes: ["CBC", "RETICULOCYTE", "SICKLE_TEST", "FERRITIN", "IRON_TIBC_SATURATION", "ESR"], sortOrder: 40 },
  { code: "ANAEMIA_III", name: "Anaemia III", memberCodes: ["CBC", "RETICULOCYTE", "SICKLE_TEST", "B12_FOLATE"], sortOrder: 50 },
  { code: "ARTHRITIS_I", name: "Arthritis I", memberCodes: ["ASLO", "CRP", "RA", "URIC_ACID", "ESR"], sortOrder: 60 },
  { code: "ARTHRITIS_II", name: "Arthritis II", memberCodes: ["ASLO", "CRP", "RA", "URIC_ACID", "ESR", "ANA"], sortOrder: 70 },
  { code: "BONE_JOINT_I", name: "Bone & Joint I", memberCodes: ["CBC", "CALCIUM", "PHOSPHORUS", "ALK_PHOS", "URIC_ACID", "PROTEIN_ELECTROPHORESIS"], sortOrder: 80 },
  { code: "BONE_JOINT_II", name: "Bone & Joint II", memberCodes: ["CALCIUM", "PHOSPHORUS", "ALK_PHOS"], sortOrder: 90 },
  { code: "CARDIAC_I", name: "Cardiac Number I", memberCodes: ["AST_SGOT", "CPK_TOTAL", "CK_MB"], sortOrder: 100 },
  { code: "CARDIAC_II", name: "Cardiac Number II", memberCodes: ["CK_MB", "TROPONIN_I"], sortOrder: 110 },
  { code: "CARDIAC_NUCLEAR_SCREEN", name: "Cardiac Nuclear Screen", memberCodes: ["ASLO", "ESR", "ANA", "CRP", "RA", "RUBELLA_IGG", "URIC_ACID", "ANTI_DNA"], sortOrder: 120 },
  { code: "CARDIAC_NUCLEAR", name: "Cardiac Nuclear", memberCodes: ["ASTO", "ANTI_DNA", "C3", "C4", "ESR", "TROPONIN_I"], sortOrder: 130 },
  { code: "CORONARY_RISK_I", name: "Coronary Risk I", memberCodes: ["TOTAL_CHOLESTEROL", "HDL_CHOLESTEROL", "TRIGLYCERIDE", "LDL_CHOLESTEROL"], sortOrder: 140 },
  { code: "CORONARY_RISK_II", name: "Coronary Risk II", memberCodes: ["LIPO_ELECTROPHORESIS", "TOTAL_CHOLESTEROL", "HDL_CHOLESTEROL", "LDL_CHOLESTEROL", "TRIGLYCERIDE", "HS_CRP"], sortOrder: 150 },
  { code: "DIABETES_I", name: "Diabetes Control I", memberCodes: ["GLUCOSE_2HR_PP", "LIPIDS", "CREATININE", "CBC"], sortOrder: 160 },
  { code: "DIABETES_II", name: "Diabetes Control II", memberCodes: ["LIPIDS", "CREATININE", "MICROALBUMIN_24HR", "HBA1C"], sortOrder: 170 },
  {
    code: "EXECUTIVE_I",
    name: "Executive I",
    memberCodes: ["CBC", "GROUP_RH", "LIPIDS", "URIC_ACID", "CREATININE", "ELECTROLYTES", "URINALYSIS_COMPLETE", "VDRL", "PSA_TOTAL", "BILIRUBIN_TOT_DIRECT"],
    sortOrder: 180,
  },
  { code: "EXECUTIVE_II", name: "Executive II", memberCodes: ["CBC", "GROUP_RH", "LIPIDS", "URIC_ACID", "CREATININE", "ELECTROLYTES", "URINALYSIS_COMPLETE", "VDRL", "PSA_TOTAL", "BILIRUBIN_TOT_DIRECT", "HBA1C"], sortOrder: 190 },
  { code: "HIV_REFLEX", name: "HIV Reflex", memberCodes: ["HIV_1_2", "HIV_CONFIRM"], sortOrder: 200 },
  {
    code: "HYPERTENSION",
    name: "Hypertension",
    description: "Patient must be fasting 10–14 hours",
    memberCodes: ["CBC", "UREA_BUN", "CREATININE", "ELECTROLYTES", "TOTAL_CHOLESTEROL", "URINALYSIS_COMPLETE"],
    sortOrder: 210,
  },
  { code: "LIVER_FUNCTION", name: "Liver Function", memberCodes: ["PROTEINS", "A_G", "ALK_PHOS", "ALT_SGPT", "GGTP", "BILIRUBIN_TOT_DIRECT"], sortOrder: 220 },
  { code: "LIVER_FUNCTION_A", name: "Liver Function A", memberCodes: ["PROTEINS", "A_G", "ALK_PHOS", "ALT_SGPT", "AST_SGOT", "GGTP", "LDH", "BILIRUBIN_TOT_DIRECT"], sortOrder: 230 },
  { code: "PAEDIATRIC", name: "Paediatric", memberCodes: ["HB", "GROUP_RH"], sortOrder: 240 },
  { code: "PITUITARY_GONADAL_I", name: "Pituitary – Gonadal I", memberCodes: ["FSH", "LH", "TSH", "PROLACTIN", "TESTOSTERONE"], sortOrder: 250 },
  { code: "PITUITARY_GONADAL_II", name: "Pituitary – Gonadal II", memberCodes: ["FSH", "LH", "TSH", "PROLACTIN"], sortOrder: 260 },
  { code: "PRENATAL_I", name: "Prenatal I", memberCodes: ["HB_PCV", "GROUP_RH", "SICKLE_TEST", "VDRL", "RUBELLA_IGG", "HIV_1_2"], sortOrder: 270 },
  { code: "PRENATAL_II", name: "Prenatal II", memberCodes: ["HB_PCV", "GROUP_RH", "SICKLE_TEST", "RUBELLA_IGG", "HIV_1_2", "HBSAG"], sortOrder: 280 },
  { code: "PROSTATIC", name: "Prostatic", memberCodes: ["PSA_TOTAL", "PSA_FREE", "ESR", "ALK_PHOS"], sortOrder: 290 },
  { code: "RENAL", name: "Renal", memberCodes: ["UREA_BUN", "CREATININE", "ELECTROLYTES", "A_G", "TOTAL_CHOLESTEROL", "URINALYSIS_COMPLETE"], sortOrder: 300 },
  { code: "THYROID_SCREEN_I", name: "Thyroid Screen I", memberCodes: ["T4_TOTAL", "T3_UPTAKE", "T4_FREE", "T3_TOTAL", "TSH"], sortOrder: 310 },
  { code: "THYROID_SCREEN_II", name: "Thyroid Screen II", memberCodes: ["T4_TOTAL", "TSH"], sortOrder: 320 },
  { code: "HYPOTHYROID_I", name: "Hypothyroid I", memberCodes: ["T4_TOTAL", "T3_UPTAKE", "T4_FREE", "T3_TOTAL"], sortOrder: 330 },
  { code: "HYPOTHYROID_II", name: "Hypothyroid II", memberCodes: ["T4_TOTAL", "TSH", "T3_FREE"], sortOrder: 340 },
  { code: "HYPERTHYROID_I", name: "Hyperthyroid I", memberCodes: ["T4_TOTAL", "T3_UPTAKE", "T4_FREE", "T3_TOTAL"], sortOrder: 350 },
  { code: "HYPERTHYROID_II", name: "Hyperthyroid II", memberCodes: ["T4_TOTAL", "TSH", "T3_FREE"], sortOrder: 360 },
  { code: "TORCH_NEONATES", name: "Torch Screen (Neonates)", memberCodes: ["TOXOPLASMA_IGM", "RUBELLA_IGM", "CMV_IGM", "HERPES_I_IGM"], sortOrder: 370 },
  { code: "OVARIAN_FUNCTION", name: "Ovarian Function", memberCodes: ["FSH", "LH", "ESTRADIOL"], sortOrder: 380 },
];

export const CATALOG_CATEGORIES = [
  { id: "blood_chemistry", label: "Blood Chemistry" },
  { id: "haematology", label: "Haematology" },
  { id: "endocrinology", label: "Endocrinology" },
  { id: "urine_chemistry", label: "Urine Chemistry" },
  { id: "immunology", label: "Immunology" },
  { id: "anaemia", label: "Anaemia" },
  { id: "special_chemistry", label: "Special Chemistry" },
  { id: "cardiac_enzymes", label: "Cardiac Enzymes" },
  { id: "bacteriology", label: "Bacteriology" },
  { id: "faeces_misc", label: "Faeces / Miscellaneous" },
  { id: "drugs_of_abuse", label: "Drugs of Abuse" },
  { id: "therapeutic_drug", label: "Therapeutic Drug" },
] as const;
