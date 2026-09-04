import type { ExpandedOrderedTest } from "./expand-selection";

export type SpecimenBucket =
  | "blood"
  | "serum"
  | "urine"
  | "stool"
  | "other";

export type SpecimenBucketGroup = {
  specimenType: SpecimenBucket;
  tests: ExpandedOrderedTest[];
};

const BUCKET_ORDER: SpecimenBucket[] = [
  "blood",
  "serum",
  "urine",
  "stool",
  "other",
];

function hintToBucket(hint: string | undefined): SpecimenBucket {
  const h = hint?.trim().toLowerCase();
  if (h === "blood") return "blood";
  if (h === "serum") return "serum";
  if (h === "urine") return "urine";
  if (h === "stool") return "stool";
  if (h === "other") return "other";
  return "blood";
}

/** Group expanded tests into physical collection tubes by catalog specimen hint. */
export function groupTestsBySpecimenBucket(
  tests: ExpandedOrderedTest[],
): SpecimenBucketGroup[] {
  const map = new Map<SpecimenBucket, ExpandedOrderedTest[]>();
  for (const test of tests) {
    const bucket = hintToBucket(test.specimenHint);
    const list = map.get(bucket) ?? [];
    list.push(test);
    map.set(bucket, list);
  }
  return BUCKET_ORDER.filter((bucket) => map.has(bucket)).map(
    (specimenType) => ({
      specimenType,
      tests: map.get(specimenType)!,
    }),
  );
}
