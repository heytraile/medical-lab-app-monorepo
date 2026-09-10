/** Physical collection container — not processed material (no serum). */
export type CollectionType = "blood" | "urine" | "stool" | "other";

const COLLECTION_ORDER: CollectionType[] = [
  "blood",
  "urine",
  "stool",
  "other",
];

/** Map legacy catalog hints to collection types. Serum draws are blood tubes. */
export function normalizeCollectionType(hint: string | undefined): CollectionType {
  const h = hint?.trim().toLowerCase();
  if (h === "urine") return "urine";
  if (h === "stool") return "stool";
  if (h === "other") return "other";
  return "blood";
}

export function collectionTypeLabel(type: CollectionType): string {
  switch (type) {
    case "blood":
      return "Blood";
    case "urine":
      return "Urine";
    case "stool":
      return "Stool";
    default:
      return "Other";
  }
}

export function pickCollectionTypeForTests(
  hints: Array<string | undefined>,
): CollectionType {
  const normalized = hints.map(normalizeCollectionType);
  for (const type of COLLECTION_ORDER) {
    if (normalized.includes(type)) return type;
  }
  return "blood";
}
