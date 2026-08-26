export type UpstreamPatient = {
  mrn: string;
  externalId?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth?: string;
  sex?: string;
};

export function normalizeMrn(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s._-]+/g, "");
}

export function normalizeNamePart(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeSex(raw: string | undefined | null): string {
  if (!raw) return "";
  const s = raw.trim().toUpperCase();
  if (s === "M" || s === "MALE") return "M";
  if (s === "F" || s === "FEMALE") return "F";
  if (s === "O" || s === "OTHER") return "O";
  if (s === "U" || s === "UNKNOWN") return "U";
  return s.slice(0, 1);
}

/** Demographic collision key — name + DOB + sex (not MRN). */
export function demographicKey(p: {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  dateOfBirth?: string | null;
  sex?: string | null;
}): string {
  return [
    normalizeNamePart(p.firstName),
    normalizeNamePart(p.middleName),
    normalizeNamePart(p.lastName),
    (p.dateOfBirth ?? "").trim(),
    normalizeSex(p.sex),
  ].join("|");
}

export function displayName(p: {
  firstName: string;
  middleName?: string | null;
  lastName: string;
}): string {
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
}

/** True when demographics are present enough to compare and they conflict. */
export function demographicsConflict(
  a: {
    firstName: string;
    middleName?: string | null;
    lastName: string;
    dateOfBirth?: string | null;
    sex?: string | null;
  },
  b: {
    firstName: string;
    middleName?: string | null;
    lastName: string;
    dateOfBirth?: string | null;
    sex?: string | null;
  },
): boolean {
  const nameClash =
    normalizeNamePart(a.firstName) !== normalizeNamePart(b.firstName) ||
    normalizeNamePart(a.lastName) !== normalizeNamePart(b.lastName);
  const dobA = (a.dateOfBirth ?? "").trim();
  const dobB = (b.dateOfBirth ?? "").trim();
  const dobClash = Boolean(dobA && dobB && dobA !== dobB);
  const sexA = normalizeSex(a.sex);
  const sexB = normalizeSex(b.sex);
  const sexClash = Boolean(sexA && sexB && sexA !== sexB);
  return nameClash || dobClash || sexClash;
}
