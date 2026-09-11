import {
  analyzerHasWork,
  type AnalyzerId,
} from "@drax-lis/catalog";
import type {
  BenchPatientSummary,
  BenchResult,
  SpecimenRow,
} from "./api";
import { groupSpecimensIntoSessions } from "./accession-sessions";
import {
  parsePatientJson,
  patientDisplayNameFromJson,
} from "./specimen-display";
import { specimenMatchesQuery } from "./specimen-query";
import {
  accessionHasIncompleteWork,
  buildWorkQueueTestItems,
  isAccessionTerminalForQueue,
  queueRowMatchesAnalyzerFilter,
  toCompletenessResultsForAccession,
  type BenchWorkQueueRow,
} from "./bench-work-queue";

function patientSummaryFromSpecimen(
  row: SpecimenRow,
): BenchPatientSummary | null {
  const p = parsePatientJson(row.patientJson);
  const id = row.patientId ?? p?.id;
  if (!id) return null;
  return {
    id,
    mrn: row.patientMrn ?? p?.mrn ?? "",
    displayName:
      row.patientDisplayName?.trim() ||
      patientDisplayNameFromJson(row.patientJson),
    firstName: p?.firstName,
    lastName: p?.lastName,
    dateOfBirth: p?.dateOfBirth ?? null,
    sex: p?.sex ?? null,
    status: row.status ?? "active",
    identityOrigin: p?.identityOrigin ?? "upstream",
  };
}

export function buildBenchWorkQueue(input: {
  specimens: SpecimenRow[];
  results: BenchResult[];
  analyzerId?: string;
  query?: string;
}): BenchWorkQueueRow[] {
  const sessions = groupSpecimensIntoSessions(input.specimens);
  const rows: BenchWorkQueueRow[] = [];

  for (const session of sessions) {
    if (isAccessionTerminalForQueue(session, input.results)) continue;

    const accessionNumber =
      session.accessionNumbers[0] ?? session.primary.accessionNumber;
    if (!accessionNumber) continue;

    const orderedCodes = session.orderedTests.map((t) => t.code);
    if (orderedCodes.length === 0) continue;

    const completeness = toCompletenessResultsForAccession(
      input.results,
      accessionNumber,
    );
    if (!accessionHasIncompleteWork(orderedCodes, completeness)) continue;

    const tests = buildWorkQueueTestItems(orderedCodes, completeness);
    const tubes = session.tubes.map((tube) => ({
      specimenId: tube.specimenNumber ?? tube.barcode,
      departmentLabel: tube.departmentLabel?.trim() || "General",
    }));

    const row: BenchWorkQueueRow = {
      session,
      accessionNumber,
      patientId: session.primary.patientId ?? null,
      patientDisplayName:
        session.primary.patientDisplayName?.trim() ||
        patientDisplayNameFromJson(session.primary.patientJson),
      patientMrn: session.primary.patientMrn ?? null,
      patientSummary: patientSummaryFromSpecimen(session.primary),
      tubes,
      tests,
      missingInstrumentCount: tests.filter(
        (t) => t.status === "awaiting_instrument",
      ).length,
      missingManualCount: tests.filter(
        (t) => t.status === "awaiting_manual",
      ).length,
      receivedCount: tests.filter((t) => t.status === "received").length,
      registeredAt: session.registeredAt,
      collectedByName: session.primary.collectedByName?.trim() || null,
      status: session.primary.status,
    };

    if (!queueRowMatchesAnalyzerFilter(row, input.analyzerId)) continue;

    const q = input.query?.trim();
    if (q) {
      const hay = [
        row.accessionNumber,
        row.patientDisplayName,
        row.patientMrn ?? "",
        ...row.tubes.map((t) => t.specimenId),
        ...row.tests.map((t) => `${t.code} ${t.name}`),
      ].join(" ");
      if (
        !hay.toLowerCase().includes(q.toLowerCase()) &&
        !session.tubes.some((tube) => specimenMatchesQuery(tube, q))
      ) {
        continue;
      }
    }

    rows.push(row);
  }

  return rows;
}
