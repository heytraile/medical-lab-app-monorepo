export type CatalogItemSeed = {
  code: string;
  name: string;
  category: string;
  specimenHint?: "serum" | "urine" | "blood";
  fastingRequired?: boolean;
  sortOrder?: number;
};

export type PanelSeed = {
  code: string;
  name: string;
  description?: string;
  memberCodes: string[];
  sortOrder?: number;
};
