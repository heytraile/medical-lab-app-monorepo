import {
  ActorSnapshotSchema,
  CollectorSnapshotSchema,
  MissingExpectedResultSchema,
  resolveDisplayFlag,
  type ActorSnapshot,
  type CollectorSnapshot,
  type ReleaseQueueGroup,
  type ReleaseQueuePatient,
  type ReleaseQueuePhase,
} from "@drax-lis/contracts";
import {
  getClinicalLimits,
  resolveClinicalDisplayFlag,
} from "@drax-lis/catalog";

export function parseActorSnapshot(raw: unknown): ActorSnapshot | null {
  const parsed = ActorSnapshotSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseCollectorSnapshot(
  raw: unknown,
): CollectorSnapshot | null {
  const parsed = CollectorSnapshotSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function flagSeverity(flag: string | null | undefined): number {
  switch (flag) {
    case "critical_high":
    case "critical_low":
      return 4;
    case "high":
    case "low":
    case "abnormal":
      return 3;
    case "unknown":
      return 0;
    case "normal":
      return 1;
    default:
      return 0;
  }
}

export function worstFlag(flags: string[]): string {
  if (flags.length === 0) return "normal";
  let worst = flags[0]!;
  for (const flag of flags.slice(1)) {
    if (flagSeverity(flag) > flagSeverity(worst)) worst = flag;
  }
  return worst;
}

function isAlarmFlag(flag: string): boolean {
  return (
    flag === "critical_high" || flag === "critical_low" || flag === "high"
  );
}

function isCriticalFlag(flag: string): boolean {
  return flag === "critical_high" || flag === "critical_low";
}

function limitsContextFromRow(row: {
  ordered_test_code?: string | null;
  result_component_code?: string | null;
  test_code?: string | null;
}): {
  orderedTestCode?: string;
  resultComponentCode?: string;
} {
  const ordered =
    row.ordered_test_code?.trim() ||
    row.test_code?.split(":")[0]?.trim() ||
    undefined;
  const component =
    row.result_component_code?.trim() ||
    (row.test_code?.includes(":")
      ? row.test_code.split(":")[1]?.trim()
      : undefined);
  return { orderedTestCode: ordered, resultComponentCode: component };
}

export function resolveQueueDisplayFlag(row: {
  flag?: string | null;
  value?: string | null;
  reference_low?: number | null;
  reference_high?: number | null;
  ordered_test_code?: string | null;
  result_component_code?: string | null;
  test_code?: string | null;
}): string {
  const { orderedTestCode, resultComponentCode } = limitsContextFromRow(row);
  if (
    orderedTestCode &&
    getClinicalLimits(orderedTestCode, resultComponentCode)
  ) {
    return resolveClinicalDisplayFlag(
      row.flag,
      row.value ?? undefined,
      orderedTestCode,
      resultComponentCode,
    );
  }
  return resolveDisplayFlag(
    row.flag,
    row.value ?? undefined,
    row.reference_low,
    row.reference_high,
  );
}

type ResultRow = {
  id: string;
  accession_number: string;
  barcode?: string;
  analyzer_id: string;
  test_code: string;
  test_name?: string | null;
  value: string;
  units?: string | null;
  flag: string;
  ordered_test_code?: string | null;
  result_component_code?: string | null;
  reference_low?: number | null;
  reference_high?: number | null;
  observed_at: string;
  submitted_at?: string | null;
  submitted_by_snapshot?: unknown;
  released_at?: string | null;
  released_by_snapshot?: unknown;
  manual_entered_by_snapshot?: unknown;
  manual_entered_at?: string | null;
  manual_last_edited_by_snapshot?: unknown;
  manual_last_edited_at?: string | null;
};

export type SpecimenContext = {
  accession_number: string;
  barcode: string;
  registered_at?: string | null;
  registered_by_snapshot?: unknown;
  collected_at?: string | null;
  collected_by_snapshot?: unknown;
  patient_json?: unknown;
  submit_missing_expected?: unknown;
  patients?: {
    edge_patient_id?: string;
    mrn?: string;
    first_name?: string;
    middle_name?: string | null;
    last_name?: string;
    date_of_birth?: string | null;
    sex?: string | null;
  } | null;
};

export function patientFromSpecimen(
  accession: string,
  specimen?: SpecimenContext,
): ReleaseQueuePatient {
  const patients = specimen?.patients;
  if (patients?.last_name || patients?.first_name) {
    const displayName = [
      patients.first_name,
      patients.middle_name,
      patients.last_name,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      edgePatientId: patients.edge_patient_id,
      displayName: displayName || "Unknown patient",
      mrn: String(patients.mrn ?? "—"),
      dateOfBirth: patients.date_of_birth ?? null,
      sex: patients.sex ?? null,
    };
  }

  const json = specimen?.patient_json as Record<string, unknown> | null;
  if (json) {
    if (typeof json.patientName === "string" && json.patientName.trim()) {
      return {
        edgePatientId:
          typeof json.id === "string" ? json.id : undefined,
        displayName: json.patientName,
        mrn: String(json.mrn ?? "—"),
        dateOfBirth: (json.dateOfBirth as string | null) ?? null,
        sex: (json.sex as string | null) ?? null,
      };
    }
    const firstName = String(json.firstName ?? "");
    const middleName = (json.middleName as string | null) ?? null;
    const lastName = String(json.lastName ?? "");
    const displayName = [firstName, middleName, lastName]
      .filter(Boolean)
      .join(" ");
    if (displayName) {
      return {
        edgePatientId:
          typeof json.id === "string" ? json.id : undefined,
        displayName,
        mrn: String(json.mrn ?? "—"),
        dateOfBirth: (json.dateOfBirth as string | null) ?? null,
        sex: (json.sex as string | null) ?? null,
      };
    }
  }

  return {
    displayName: "Unknown patient",
    mrn: "—",
    dateOfBirth: null,
    sex: null,
  };
}

export function assembleReleaseQueueGroups(
  results: ResultRow[],
  specimenByAccession: Map<string, SpecimenContext>,
  queuePhase: ReleaseQueuePhase,
): ReleaseQueueGroup[] {
  const byAccession = new Map<string, ResultRow[]>();
  for (const row of results) {
    const acc = row.accession_number;
    const list = byAccession.get(acc) ?? [];
    list.push(row);
    byAccession.set(acc, list);
  }

  const groups: ReleaseQueueGroup[] = [];

  for (const [accessionNumber, rows] of byAccession.entries()) {
    const specimen = specimenByAccession.get(accessionNumber);
    const sorted = [...rows].sort((a, b) =>
      String(b.observed_at).localeCompare(String(a.observed_at)),
    );
    const first = sorted[0]!;
    const resolvedResults = sorted.map((r) => {
      const displayFlag = resolveQueueDisplayFlag(r);
      return { row: r, displayFlag };
    });
    const flags = resolvedResults.map((entry) => entry.displayFlag);
    const worst = worstFlag(flags);
    const releasedRow = sorted.find((r) => r.released_at) ?? first;
    const missingParsed = Array.isArray(specimen?.submit_missing_expected)
      ? specimen.submit_missing_expected
          .map((row) => MissingExpectedResultSchema.safeParse(row))
          .filter((row) => row.success)
          .map((row) => row.data)
      : [];

    groups.push({
      accessionNumber,
      barcode: String(
        first.barcode ?? specimen?.barcode ?? accessionNumber,
      ),
      patient: patientFromSpecimen(accessionNumber, specimen),
      queuePhase,
      submittedBy: parseActorSnapshot(first.submitted_by_snapshot),
      submittedAt: first.submitted_at
        ? String(first.submitted_at)
        : null,
      accessionedBy: parseActorSnapshot(
        specimen?.registered_by_snapshot,
      ),
      accessionedAt: specimen?.registered_at
        ? String(specimen.registered_at)
        : null,
      collectedBy: parseCollectorSnapshot(specimen?.collected_by_snapshot),
      collectedAt: specimen?.collected_at
        ? String(specimen.collected_at)
        : null,
      releasedBy:
        queuePhase === "released"
          ? parseActorSnapshot(releasedRow.released_by_snapshot)
          : null,
      releasedAt:
        queuePhase === "released" && releasedRow.released_at
          ? String(releasedRow.released_at)
          : null,
      results: resolvedResults.map(({ row: r, displayFlag }) => ({
        id: String(r.id),
        testCode: String(r.test_code),
        testName: (r.test_name as string | null) ?? null,
        value: String(r.value),
        units: (r.units as string | null) ?? null,
        flag: displayFlag,
        orderedTestCode: r.ordered_test_code ?? null,
        resultComponentCode: r.result_component_code ?? null,
        observedAt: String(r.observed_at),
        analyzerId: String(r.analyzer_id ?? "unknown"),
        manualEnteredBy: parseActorSnapshot(
          r.manual_entered_by_snapshot,
        ),
        manualEnteredAt: r.manual_entered_at
          ? String(r.manual_entered_at)
          : null,
        manualLastEditedBy: parseActorSnapshot(
          r.manual_last_edited_by_snapshot,
        ),
        manualLastEditedAt: r.manual_last_edited_at
          ? String(r.manual_last_edited_at)
          : null,
      })),
      missingExpectedResults: missingParsed,
      submittedIncomplete: missingParsed.length > 0,
      testCount: sorted.length,
      worstFlag: worst,
      hasAlarm: flags.some((flag) => isAlarmFlag(flag)),
      hasCritical: flags.some((flag) => isCriticalFlag(flag)),
    });
  }

  groups.sort((a, b) => {
    const crit =
      flagSeverity(b.worstFlag) - flagSeverity(a.worstFlag);
    if (crit !== 0) return crit;
    const sortTime =
      queuePhase === "released"
        ? (g: ReleaseQueueGroup) => g.releasedAt ?? g.submittedAt ?? ""
        : (g: ReleaseQueueGroup) => g.submittedAt ?? "";
    return sortTime(b).localeCompare(sortTime(a));
  });

  return groups;
}

type ReleasedResultRow = {
  edge_result_id?: string | null;
};

/**
 * Drop cloud "released" rows that no longer exist on the current edge bench, or
 * where edge still shows pending_review (stale generation after edge DB reset).
 */
export function filterReleasedResultsVerifiedOnEdge<T extends ReleasedResultRow>(
  results: T[],
  edgeStatusById: Map<string, string> | null,
): T[] {
  // When edge is unreachable, hide Ready rows rather than show stale cloud data.
  if (!edgeStatusById) return [];
  return results.filter((row) => {
    const edgeId = String(row.edge_result_id ?? "").trim();
    if (!edgeId) return false;
    const edgeStatus = edgeStatusById.get(edgeId);
    if (!edgeStatus) return false;
    return edgeStatus === "released" || edgeStatus === "pending_authorization";
  });
}

/** Released wins: an accession must not stay on Authorization once it is Ready. */
export function mergeReleaseQueueGroups(
  pending: ReleaseQueueGroup[],
  released: ReleaseQueueGroup[],
): ReleaseQueueGroup[] {
  const releasedAccessions = new Set(
    released.map((group) => group.accessionNumber),
  );
  return [
    ...pending.filter(
      (group) => !releasedAccessions.has(group.accessionNumber),
    ),
    ...released,
  ];
}

export function actorDisplayName(actor: ActorSnapshot | null): string {
  if (!actor) return "Unknown";
  if (actor.fullName?.trim()) return actor.fullName.trim();
  if (actor.email?.trim()) return actor.email.trim();
  return actor.role;
}
