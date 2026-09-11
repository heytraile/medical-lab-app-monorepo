import type { SpecimenRow } from "./api";
import { groupSpecimensIntoSessions } from "./accession-sessions";

export type ParsedOrderedTest = { code: string; name?: string };

export function parseOrderedTestsJson(
  json: string | null | undefined,
): ParsedOrderedTest[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as Array<{ code?: string; name?: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t) => t.code)
      .map((t) => ({ code: String(t.code), name: t.name }));
  } catch {
    return [];
  }
}

export function orderedTestsForPatient(
  specimens: SpecimenRow[],
  patientId: string,
): Array<{ accessionNumber: string; tests: ParsedOrderedTest[] }> {
  return groupSpecimensIntoSessions(
    specimens.filter((s) => s.patientId === patientId),
  )
    .map((session) => ({
      accessionNumber:
        session.accessionNumbers[0] ?? session.primary.accessionNumber,
      tests: session.orderedTests.map((t) => ({
        code: t.code,
        name: t.name,
      })),
    }))
    .filter((row) => row.accessionNumber && row.tests.length > 0);
}

export type CloudSpecimenLookup = {
  accessionNumber: string;
  orderedTests: ParsedOrderedTest[];
};

export {
  filterSpecimensByAccessionQuery,
  findExactSpecimenMatch,
  specimenMatchesQuery,
  specimenSearchHaystack,
} from "./specimen-query";

/** Prefer cloud specimen, then cloud requisition, then edge specimen. */
export function mergeOrderedTestsLookup(sources: {
  cloudSpecimen?: ParsedOrderedTest[] | null;
  cloudRequisition?: ParsedOrderedTest[] | null;
  edgeSpecimen?: ParsedOrderedTest[] | null;
}): ParsedOrderedTest[] {
  for (const list of [
    sources.cloudSpecimen,
    sources.cloudRequisition,
    sources.edgeSpecimen,
  ]) {
    if (list?.length) return list;
  }
  return [];
}
