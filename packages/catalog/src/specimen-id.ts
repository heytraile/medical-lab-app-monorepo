/** True when an instrument message carried a usable specimen / sample ID. */
export function isPresentSpecimenId(
  value: string | null | undefined,
): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Quarantine (do not attach to an accession) when the analyzer sent
 * clinical values but no specimen ID. Empty frames with no analytes are
 * stored as raw messages only — they do not raise the unidentified alert.
 */
export function shouldQuarantineMissingSpecimenId(
  barcode: string | null | undefined,
  analyteCount: number,
): boolean {
  return analyteCount > 0 && !isPresentSpecimenId(barcode);
}
