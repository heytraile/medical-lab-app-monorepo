import type { SpecimenRow } from "./api";

const SPECIMEN_SUGGESTION_CAP = 20;

/** Lowercase haystack for client-side specimen search (accession, specimen ID, patient). */
export function specimenSearchHaystack(s: SpecimenRow): string {
  const parts = [
    s.accessionNumber,
    s.specimenNumber,
    s.barcode,
    s.patientDisplayName,
    s.patientMrn ?? "",
    s.departmentLabel ?? "",
  ];
  if (s.patientJson) {
    try {
      const p = JSON.parse(s.patientJson) as {
        firstName?: string;
        lastName?: string;
        middleName?: string;
      };
      parts.push(p.firstName, p.lastName, p.middleName);
    } catch {
      /* ignore */
    }
  }
  return parts
    .filter((v): v is string => Boolean(v?.trim()))
    .join(" ")
    .toLowerCase();
}

export function specimenMatchesQuery(s: SpecimenRow, filter: string): boolean {
  const q = filter.trim().toLowerCase();
  if (!q) return true;
  return specimenSearchHaystack(s).includes(q);
}

/** Partial match on accession, specimen ID, barcode, or patient for type-ahead. */
export function filterSpecimensByAccessionQuery(
  specimens: SpecimenRow[],
  filter: string,
  limit = SPECIMEN_SUGGESTION_CAP,
): SpecimenRow[] {
  const q = filter.trim();
  if (!q) return specimens.slice(0, limit);
  const out: SpecimenRow[] = [];
  for (const s of specimens) {
    if (specimenMatchesQuery(s, q)) {
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
      (s.barcode ?? "").toLowerCase() === q ||
      (s.specimenNumber ?? "").toLowerCase() === q,
  );
}
