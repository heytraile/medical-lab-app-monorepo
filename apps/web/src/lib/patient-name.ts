type NameParts = {
  displayName: string;
  firstName?: string;
  lastName?: string;
};

/**
 * "Last, First M" — the order a tech scans a worklist in.
 *
 * Falls back to displayName when the parts are missing, so an older edge build
 * that only sends the joined name still renders something sensible.
 */
export function formatPatientName(p: NameParts): string {
  if (!p.lastName) return p.displayName;
  // Anything between the first and last name in displayName is the middle
  // name(s); reduced to initials so the pill stays scannable.
  const middle = p.displayName
    .replace(p.firstName ?? "", "")
    .replace(p.lastName, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0]}.`)
    .join(" ");
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
