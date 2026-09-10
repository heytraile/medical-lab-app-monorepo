export type CatalogItemSeed = {
  code: string;
  name: string;
  category: string;
  specimenHint?: "blood" | "urine" | "stool" | "other";
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
