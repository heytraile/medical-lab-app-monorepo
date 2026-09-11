import {
  ROUTING_PRESET_GRANULAR,
  routingDepartmentSortIndex,
  type LabRoutingSettings,
} from "@drax-lis/catalog";
import type { SpecimenOrderedTest, SpecimenRow } from "./api";

export type OrderSelectionSnapshot = {
  kind: "panel" | "test";
  code: string;
};

export type AccessionSession = {
  /** Stable key for list selection (batch / requisition / accession). */
  key: string;
  tubes: SpecimenRow[];
  /** Earliest container in the session (primary routing label). */
  primary: SpecimenRow;
  registeredAt: string;
  specimenTypes: string[];
  departmentLabels: string[];
  orderedTests: SpecimenOrderedTest[];
  /** Original Accession ticks (panels and/or individual tests). */
  orderedSelections: OrderSelectionSnapshot[];
  /** One accession number per doctor form. */
  accessionNumbers: string[];
};

function specimenTests(row: SpecimenRow): SpecimenOrderedTest[] {
  if (row.orderedTests?.length) return row.orderedTests;
  if (!row.orderedTestsJson) return [];
  try {
    const parsed = JSON.parse(row.orderedTestsJson) as Array<{
      code?: string;
      name?: string;
    }>;
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

function sessionKeyFor(row: SpecimenRow): string {
  // One doctor form → one accession; department routing labels share it.
  if (row.accessionNumber?.trim()) {
    return `acc:${row.accessionNumber.trim().toUpperCase()}`;
  }
  if (row.registrationBatchId?.trim()) {
    return `batch:${row.registrationBatchId.trim()}`;
  }
  if (row.requisitionId?.trim()) {
    return `req:${row.requisitionId.trim()}`;
  }
  const collected = row.collectedAt?.trim();
  if (row.patientId?.trim() && collected) {
    return `patient-collected:${row.patientId.trim()}:${collected}`;
  }
  return `specimen:${row.id}`;
}

function mergeOrderedTests(tubes: SpecimenRow[]): SpecimenOrderedTest[] {
  const seen = new Set<string>();
  const out: SpecimenOrderedTest[] = [];
  for (const tube of tubes) {
    for (const test of specimenTests(tube)) {
      const code = test.code.trim().toUpperCase();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      out.push(test);
    }
  }
  return out;
}

function mergeOrderedSelections(
  tubes: SpecimenRow[],
): OrderSelectionSnapshot[] {
  const seen = new Set<string>();
  const out: OrderSelectionSnapshot[] = [];
  for (const tube of tubes) {
    for (const sel of tube.orderedSelections ?? []) {
      if (sel.kind !== "panel" && sel.kind !== "test") continue;
      const code = sel.code?.trim();
      if (!code) continue;
      const key = `${sel.kind}:${code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: sel.kind, code });
    }
  }
  return out;
}

const COLLECTION_TYPE_ORDER = ["blood", "urine", "stool", "other"];

function sortTubes(
  a: SpecimenRow,
  b: SpecimenRow,
  routing: LabRoutingSettings = ROUTING_PRESET_GRANULAR,
): number {
  const aKey = a.departmentKey ?? "";
  const bKey = b.departmentKey ?? "";
  const ao = routingDepartmentSortIndex(aKey, routing);
  const bo = routingDepartmentSortIndex(bKey, routing);
  if (ao !== bo) return ao - bo;
  const aiType = COLLECTION_TYPE_ORDER.indexOf(
    (a.collectionType ?? a.specimenType ?? "blood").toLowerCase(),
  );
  const biType = COLLECTION_TYPE_ORDER.indexOf(
    (b.collectionType ?? b.specimenType ?? "blood").toLowerCase(),
  );
  if (aiType !== biType) return aiType - biType;
  return a.id.localeCompare(b.id);
}

/**
 * Group flat routing-label rows into Accession sessions (one form → one accession).
 */
export function groupSpecimensIntoSessions(
  rows: SpecimenRow[],
  routing: LabRoutingSettings = ROUTING_PRESET_GRANULAR,
): AccessionSession[] {
  const byKey = new Map<string, SpecimenRow[]>();
  for (const row of rows) {
    const key = sessionKeyFor(row);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(row);
    else byKey.set(key, [row]);
  }

  const sessions: AccessionSession[] = [];
  for (const [key, tubes] of byKey) {
    const sorted = [...tubes].sort((a, b) => sortTubes(a, b, routing));
    const primary = sorted[0]!;
    const registeredAt = sorted.reduce(
      (latest, t) => (t.registeredAt > latest ? t.registeredAt : latest),
      primary.registeredAt,
    );
    const types = [
      ...new Set(
        sorted.map((t) =>
          (t.collectionType ?? t.specimenType ?? "blood").toLowerCase(),
        ),
      ),
    ];
    const departmentLabels = [
      ...new Set(
        sorted
          .map((t) => t.departmentLabel?.trim())
          .filter((label): label is string => Boolean(label)),
      ),
    ];
    const accessionNumber = primary.accessionNumber;
    sessions.push({
      key,
      tubes: sorted,
      primary,
      registeredAt,
      specimenTypes: types,
      departmentLabels,
      orderedTests: mergeOrderedTests(sorted),
      orderedSelections: mergeOrderedSelections(sorted),
      accessionNumbers: accessionNumber ? [accessionNumber] : [],
    });
  }

  sessions.sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));
  return sessions;
}

export function findSessionByAccession(
  sessions: AccessionSession[],
  accession: string,
): AccessionSession | undefined {
  const needle = accession.trim().toUpperCase();
  if (!needle) return undefined;
  return sessions.find((s) =>
    s.tubes.some(
      (t) =>
        t.accessionNumber.toUpperCase() === needle ||
        t.barcode.toUpperCase() === needle,
    ),
  );
}

/** Apply hydrated selections (e.g. from cloud requisition) onto a session. */
export function withSessionSelections(
  session: AccessionSession,
  selections: OrderSelectionSnapshot[] | undefined | null,
): AccessionSession {
  if (!selections?.length) return session;
  if (session.orderedSelections.length > 0) return session;
  return { ...session, orderedSelections: selections };
}
