import {
  missingManualResultRequirements,
  normalizeCode,
  type MissingExpectedResult,
} from "@drax-lis/catalog";
import type { BenchResult } from "./api";
import {
  buildWorkQueueTestItems,
  toCompletenessResultsForAccession,
  type WorkQueueTestItem,
} from "./bench-work-queue";
import {
  manualAccessionAccess,
  type ManualAccessionAccess,
} from "./manual-results";
export type AccessionPendingOverview = {
  accessionNumber: string;
  pendingTests: WorkQueueTestItem[];
  manualComponents: MissingExpectedResult[];
  manualAccess: ManualAccessionAccess;
};

export function groupPendingManualByTest(
  items: MissingExpectedResult[],
): Map<string, MissingExpectedResult[]> {
  const map = new Map<string, MissingExpectedResult[]>();
  for (const item of items) {
    const key = normalizeCode(item.orderedTestCode);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}

export function buildAccessionPendingOverviewFromOrder(input: {
  accessionNumber: string;
  orderedCodes: string[];
  results: BenchResult[];
}): AccessionPendingOverview | null {
  const { accessionNumber, orderedCodes, results } = input;
  if (orderedCodes.length === 0) return null;

  const accessionResults = results.filter(
    (result) => result.accessionNumber === accessionNumber,
  );
  const completeness = toCompletenessResultsForAccession(
    results,
    accessionNumber,
  );
  const pendingTests = buildWorkQueueTestItems(orderedCodes, completeness).filter(
    (test) => test.status !== "received",
  );
  const manualComponents = missingManualResultRequirements(
    orderedCodes,
    accessionResults,
  );

  if (pendingTests.length === 0 && manualComponents.length === 0) {
    return null;
  }

  return {
    accessionNumber,
    pendingTests,
    manualComponents,
    manualAccess: manualAccessionAccess(accessionResults),
  };
}
