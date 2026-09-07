import type { SpecimenOrderedTest, SpecimenRow } from "./api";

export type OrderSelectionSnapshot = {
  kind: "panel" | "test";
  code: string;
};

export type AccessionSession = {
  /** Stable key for list selection (batch / requisition / single id). */
  key: string;
  tubes: SpecimenRow[];
  /** Earliest accession in the batch (primary tube). */
  primary: SpecimenRow;
  registeredAt: string;
  specimenTypes: string[];
  orderedTests: SpecimenOrderedTest[];
  /** Original Accession ticks (panels and/or individual tests). */
  orderedSelections: OrderSelectionSnapshot[];
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

const SPECIMEN_TYPE_ORDER = ["blood", "serum", "urine", "stool", "other"];

function sortTubes(a: SpecimenRow, b: SpecimenRow): number {
  const ai = SPECIMEN_TYPE_ORDER.indexOf(
    (a.specimenType ?? "blood").toLowerCase(),
  );
  const bi = SPECIMEN_TYPE_ORDER.indexOf(
    (b.specimenType ?? "blood").toLowerCase(),
  );
  const ao = ai === -1 ? 99 : ai;
  const bo = bi === -1 ? 99 : bi;
  if (ao !== bo) return ao - bo;
  return a.accessionNumber.localeCompare(b.accessionNumber);
}

/**
 * Group flat specimen/tube rows into Accession sessions (one submit → N tubes).
 * Panels that expand across blood/serum/urine used to look like separate
 * wrong orders when listed flat (urine often appeared first).
 */
export function groupSpecimensIntoSessions(
  rows: SpecimenRow[],
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
    const sorted = [...tubes].sort(sortTubes);
    const primary = sorted[0]!;
    const registeredAt = sorted.reduce(
      (latest, t) => (t.registeredAt > latest ? t.registeredAt : latest),
      primary.registeredAt,
    );
    const types = [
      ...new Set(
        sorted.map((t) => (t.specimenType?.trim() || "blood").toLowerCase()),
      ),
    ];
    sessions.push({
      key,
      tubes: sorted,
      primary,
      registeredAt,
      specimenTypes: types,
      orderedTests: mergeOrderedTests(sorted),
      orderedSelections: mergeOrderedSelections(sorted),
      accessionNumbers: sorted.map((t) => t.accessionNumber),
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
