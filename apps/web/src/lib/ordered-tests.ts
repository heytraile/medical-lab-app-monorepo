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

export function orderedTestsForAccession(
  specimens: SpecimenRow[],
  accession: string,
): ParsedOrderedTest[] {
  const row = specimens.find(
    (s) =>
      s.accessionNumber.toLowerCase() === accession.trim().toLowerCase(),
  );
  return parseOrderedTestsJson(row?.orderedTestsJson);
}
