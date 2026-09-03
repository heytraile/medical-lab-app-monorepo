export type PatientNameOrder = "last-first" | "first-last";

type NameParts = {
  displayName: string;
  firstName?: string;
  lastName?: string;
};

function middleInitials(p: NameParts): string {
  return p.displayName
    .replace(p.firstName ?? "", "")
    .replace(p.lastName ?? "", "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0]}.`)
    .join(" ");
}

/**
 * Formats a patient name for worklists.
 *
 * - `last-first`: "Last, First M." — default lab sort order
 * - `first-last`: "First M. Last"
 *
 * Falls back to displayName when parts are missing.
 */
export function formatPatientName(
  p: NameParts,
  order: PatientNameOrder = "last-first",
): string {
  if (!p.lastName) return p.displayName;
  const middle = middleInitials(p);
  if (order === "first-last") {
    return [p.firstName, middle, p.lastName].filter(Boolean).join(" ");
  }
  const given = [p.firstName, middle].filter(Boolean).join(" ");
  return given ? `${p.lastName}, ${given}` : p.lastName;
}

/**
 * Case-folded "last\u0000first" so a comparator is a plain string compare.
 *
 * The NUL separator is deliberate: joining with a space would sort "Vandyke,
 * Al" before "Van Dyke, Bo", because a space outranks every letter.
 */
export function patientSortKey(p: NameParts): string {
  const last = (p.lastName ?? p.displayName).toLowerCase();
  const first = (p.firstName ?? "").toLowerCase();
  return `${last}\u0000${first}`;
}
