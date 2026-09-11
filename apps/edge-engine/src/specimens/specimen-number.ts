/** Format a per-tube specimen ID tied to the parent accession number. */
export function formatSpecimenNumber(
  accessionNumber: string,
  sequence: number,
): string {
  return `${accessionNumber}-${String(sequence).padStart(2, "0")}`;
}
