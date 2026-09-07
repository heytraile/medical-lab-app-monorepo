import type { ActorSnapshot } from "@drax-lis/contracts";

export type OrderedTestSnapshot = {
  code: string;
  name?: string;
};

export type PatientJsonSnapshot = {
  id?: string;
  mrn?: string;
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  dateOfBirth?: string | null;
  sex?: string | null;
  identityOrigin?: string;
  syncStatus?: string;
};

/** Display name from specimen patientJson (first + middle + last, else MRN). */
export function patientDisplayNameFromJson(
  json: string | null | undefined,
): string {
  const p = parsePatientJson(json);
  if (!p) return "—";
  const name = [p.firstName, p.middleName, p.lastName]
    .filter((part) => Boolean(part && String(part).trim()))
    .join(" ");
  if (name) return name;
  if (p.mrn?.trim()) return p.mrn.trim();
  return "—";
}

export function parsePatientJson(
  json: string | null | undefined,
): PatientJsonSnapshot | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as PatientJsonSnapshot;
  } catch {
    return null;
  }
}

export function parseOrderedTests(
  json: string | null | undefined,
): OrderedTestSnapshot[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as Array<{ code?: string; name?: string }>;
    return parsed
      .filter((t) => Boolean(t?.code))
      .map((t) => ({
        code: String(t.code),
        name: t.name?.trim() || undefined,
      }));
  } catch {
    return [];
  }
}

export function orderedTestCodesFromJson(
  json: string | null | undefined,
): string[] {
  return parseOrderedTests(json).map((t) => t.code);
}

export function actorDisplayName(
  snapshot: ActorSnapshot | string | null | undefined,
): string | null {
  if (!snapshot) return null;
  let actor: ActorSnapshot | null = null;
  if (typeof snapshot === "string") {
    try {
      actor = JSON.parse(snapshot) as ActorSnapshot;
    } catch {
      return null;
    }
  } else {
    actor = snapshot;
  }
  const name = actor.fullName?.trim();
  if (name) return name;
  const email = actor.email?.trim();
  if (email) return email;
  return actor.userId?.trim() || null;
}

/** Case-insensitive match for specimen history search. */
export function specimenMatchesQuery(
  row: {
    accessionNumber: string;
    barcode: string;
    patientJson: string | null;
    patientDisplayName?: string;
  },
  q: string,
): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if (row.accessionNumber.toLowerCase().includes(needle)) return true;
  if (row.barcode.toLowerCase().includes(needle)) return true;
  const patient = parsePatientJson(row.patientJson);
  if (patient?.mrn?.toLowerCase().includes(needle)) return true;
  const display =
    row.patientDisplayName ?? patientDisplayNameFromJson(row.patientJson);
  if (display.toLowerCase().includes(needle)) return true;
  if (patient?.firstName?.toLowerCase().includes(needle)) return true;
  if (patient?.lastName?.toLowerCase().includes(needle)) return true;
  if (patient?.middleName?.toLowerCase().includes(needle)) return true;
  return false;
}
