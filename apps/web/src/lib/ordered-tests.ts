import type { SpecimenRow } from "./api";

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
  return specimens
    .filter((s) => s.patientId === patientId)
    .map((s) => ({
      accessionNumber: s.accessionNumber,
      tests: parseOrderedTestsJson(s.orderedTestsJson),
    }))
    .filter((row) => row.tests.length > 0);
}

export type CloudSpecimenLookup = {
  accessionNumber: string;
  orderedTests: ParsedOrderedTest[];
};

const SPECIMEN_SUGGESTION_CAP = 20;

/** Partial match on accession or barcode for type-ahead suggestions. */
export function filterSpecimensByAccessionQuery(
  specimens: SpecimenRow[],
  filter: string,
  limit = SPECIMEN_SUGGESTION_CAP,
): SpecimenRow[] {
  const q = filter.trim().toLowerCase();
  if (!q) return specimens.slice(0, limit);
  const out: SpecimenRow[] = [];
  for (const s of specimens) {
    const acc = s.accessionNumber.toLowerCase();
    const bar = (s.barcode ?? "").toLowerCase();
    if (acc.includes(q) || bar.includes(q)) {
      out.push(s);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function findExactSpecimenMatch(
  specimens: SpecimenRow[],
  value: string,
): SpecimenRow | undefined {
  const q = value.trim().toLowerCase();
  if (!q) return undefined;
  return specimens.find(
    (s) =>
      s.accessionNumber.toLowerCase() === q ||
      (s.barcode ?? "").toLowerCase() === q,
  );
}

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
