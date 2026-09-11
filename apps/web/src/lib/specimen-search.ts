import { api, type SpecimenRow } from "./api";
import { findExactSpecimenMatch } from "./specimen-query";

/** Resolve a scanned or typed value to the parent accession when possible. */
export async function resolveAccessionFromSearch(
  specimens: SpecimenRow[],
  value: string,
): Promise<string | undefined> {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const exact = findExactSpecimenMatch(specimens, trimmed);
  if (exact) return exact.accessionNumber;

  try {
    const hit = await api.specimenByBarcode(trimmed);
    if (hit?.accessionNumber?.trim()) return hit.accessionNumber.trim();
  } catch {
    /* not found */
  }

  return undefined;
}
