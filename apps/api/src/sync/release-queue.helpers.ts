import {
  ActorSnapshotSchema,
  MissingExpectedResultSchema,
  type ActorSnapshot,
  type ReleaseQueueGroup,
  type ReleaseQueuePatient,
  type ReleaseQueuePhase,
} from "@drax-lis/contracts";
import { resolveDisplayFlag } from "@drax-lis/contracts";

export function parseActorSnapshot(raw: unknown): ActorSnapshot | null {
  const parsed = ActorSnapshotSchema.safeParse(raw);
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
  reference_low?: number | null;
  reference_high?: number | null;
  observed_at: string;
  submitted_at?: string | null;
  submitted_by_snapshot?: unknown;
  released_at?: string | null;
  released_by_snapshot?: unknown;
};

export type SpecimenContext = {
  accession_number: string;
  barcode: string;
  registered_at?: string | null;
  registered_by_snapshot?: unknown;
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
      const displayFlag = resolveDisplayFlag(
        String(r.flag ?? "unknown"),
        String(r.value ?? ""),
        r.reference_low ?? null,
        r.reference_high ?? null,
      );
      return { row: r, displayFlag };
    });
    const flags = resolvedResults.map((entry) => entry.displayFlag);
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
        observedAt: String(r.observed_at),
        analyzerId: String(r.analyzer_id ?? "unknown"),
      })),
      missingExpectedResults: missingParsed,
      submittedIncomplete: missingParsed.length > 0,
      testCount: sorted.length,
      worstFlag: worstFlag(flags),
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

export function actorDisplayName(actor: ActorSnapshot | null): string {
  if (!actor) return "Unknown";
  if (actor.fullName?.trim()) return actor.fullName.trim();
  if (actor.email?.trim()) return actor.email.trim();
  return actor.role;
}
