import type { BenchResult, SpecimenRow } from "./api";
import { groupSpecimensIntoSessions } from "./accession-sessions";
import {
  buildAccessionPendingOverviewFromOrder,
  type AccessionPendingOverview,
} from "./bench-pending-overview";

export type { AccessionPendingOverview };
export { groupPendingManualByTest } from "./bench-pending-overview";

export function buildAccessionPendingOverview(
  accessionNumber: string,
  specimens: SpecimenRow[],
  results: BenchResult[],
): AccessionPendingOverview | null {
  const tubesForAccession = specimens.filter(
    (row) => row.accessionNumber === accessionNumber,
  );
  const session = groupSpecimensIntoSessions(tubesForAccession)[0];
  if (!session) return null;

  return buildAccessionPendingOverviewFromOrder({
    accessionNumber,
    orderedCodes: session.orderedTests.map((test) => test.code),
    results,
  });
}

export function buildGroupPendingOverview(input: {
  accessionNumbers: string[];
  specimens: SpecimenRow[];
  results: BenchResult[];
}): AccessionPendingOverview[] {
  const out: AccessionPendingOverview[] = [];
  for (const accessionNumber of input.accessionNumbers) {
    const row = buildAccessionPendingOverview(
      accessionNumber,
      input.specimens,
      input.results,
    );
    if (row) out.push(row);
  }
  return out;
}
