import {
  analyzerHasWork,
  getAnalyzerForCatalogCode,
  getCatalogDisplayName,
  getTestResultRequirement,
  missingManualResultRequirements,
  normalizeCode,
  type AnalyzerId,
  type MissingExpectedResult,
  type ReceivedResultForCompleteness,
} from "@drax-lis/catalog";
import type { BenchResult, SpecimenRow } from "./api";
import type { AccessionSession } from "./accession-sessions";

export type WorkQueueTestStatus =
  | "awaiting_instrument"
  | "awaiting_manual"
  | "received"
  | "send_out";

export type WorkQueueTestItem = {
  code: string;
  name: string;
  status: WorkQueueTestStatus;
  analyzerId: AnalyzerId | null;
};

export type WorkQueueTube = {
  specimenId: string;
  departmentLabel: string;
};

export type BenchWorkQueueRow = {
  session: AccessionSession;
  accessionNumber: string;
  patientId: string | null;
  patientDisplayName: string;
  patientMrn: string | null;
  patientSummary: import("./api").BenchPatientSummary | null;
  tubes: WorkQueueTube[];
  tests: WorkQueueTestItem[];
  missingInstrumentCount: number;
  missingManualCount: number;
  receivedCount: number;
  registeredAt: string;
  collectedByName: string | null;
  status: string;
};

function toCompletenessResults(
  results: BenchResult[],
  accessionNumber: string,
): ReceivedResultForCompleteness[] {
  return results
    .filter((r) => r.accessionNumber === accessionNumber)
    .map((r) => ({
      testCode: r.testCode,
      analyzerId: r.analyzerId,
      orderedTestCode: r.orderedTestCode,
      resultComponentCode: r.resultComponentCode,
    }));
}

export function hasInstrumentResultForTest(
  orderedCode: string,
  results: Iterable<ReceivedResultForCompleteness>,
): boolean {
  const code = normalizeCode(orderedCode);
  for (const r of results) {
    if (r.analyzerId === "manual") continue;
    const testCode = normalizeCode(r.testCode);
    const orderedTestCode = normalizeCode(r.orderedTestCode || r.testCode);
    if (testCode === code || orderedTestCode === code) return true;
  }
  return false;
}

export function missingInstrumentTests(
  orderedCodes: string[],
  results: Iterable<ReceivedResultForCompleteness>,
): Array<{ code: string; name: string; analyzerId: AnalyzerId | null }> {
  const missing: Array<{
    code: string;
    name: string;
    analyzerId: AnalyzerId | null;
  }> = [];
  for (const rawCode of orderedCodes) {
    const requirement = getTestResultRequirement(rawCode);
    if (!requirement.instrumentRequired) continue;
    if (hasInstrumentResultForTest(rawCode, results)) continue;
    const code = normalizeCode(rawCode);
    missing.push({
      code,
      name: getCatalogDisplayName(code),
      analyzerId: getAnalyzerForCatalogCode(code),
    });
  }
  return missing;
}

function manualMissingForTest(
  orderedCode: string,
  missingManual: MissingExpectedResult[],
): MissingExpectedResult[] {
  const code = normalizeCode(orderedCode);
  return missingManual.filter(
    (item) => normalizeCode(item.orderedTestCode) === code,
  );
}

export function buildWorkQueueTestItems(
  orderedCodes: string[],
  results: Iterable<ReceivedResultForCompleteness>,
): WorkQueueTestItem[] {
  const missingManual = missingManualResultRequirements(orderedCodes, results);
  const items: WorkQueueTestItem[] = [];

  for (const rawCode of orderedCodes) {
    const code = normalizeCode(rawCode);
    const requirement = getTestResultRequirement(code);
    const name = getCatalogDisplayName(code);
    const analyzerId = getAnalyzerForCatalogCode(code);

    if (requirement.workflow === "send_out") {
      items.push({ code, name, status: "send_out", analyzerId });
      continue;
    }

    const instrumentPending =
      requirement.instrumentRequired &&
      !hasInstrumentResultForTest(code, results);
    const manualPending = manualMissingForTest(code, missingManual).length > 0;

    if (instrumentPending) {
      items.push({
        code,
        name,
        status: "awaiting_instrument",
        analyzerId,
      });
    } else if (manualPending) {
      items.push({
        code,
        name,
        status: "awaiting_manual",
        analyzerId,
      });
    } else {
      items.push({ code, name, status: "received", analyzerId });
    }
  }

  return items;
}

export function accessionHasIncompleteWork(
  orderedCodes: string[],
  results: Iterable<ReceivedResultForCompleteness>,
): boolean {
  if (missingInstrumentTests(orderedCodes, results).length > 0) return true;
  if (missingManualResultRequirements(orderedCodes, results).length > 0) {
    return true;
  }
  return false;
}

function isTerminalForQueue(
  session: AccessionSession,
  results: BenchResult[],
): boolean {
  if (session.primary.status === "released") return true;
  const accessionNumber = session.primary.accessionNumber;
  const accResults = results.filter(
    (r) => r.accessionNumber === accessionNumber,
  );
  if (accResults.some((r) => r.status === "pending_authorization")) {
    return true;
  }
  if (
    accResults.length > 0 &&
    accResults.every((r) => r.status === "released")
  ) {
    return true;
  }
  return false;
}

export function isAccessionTerminalForQueue(
  session: AccessionSession,
  results: BenchResult[],
): boolean {
  return isTerminalForQueue(session, results);
}

export function toCompletenessResultsForAccession(
  results: BenchResult[],
  accessionNumber: string,
): ReceivedResultForCompleteness[] {
  return toCompletenessResults(results, accessionNumber);
}

export function queueRowMatchesAnalyzerFilter(
  row: Pick<BenchWorkQueueRow, "tests">,
  analyzerId: string | undefined,
): boolean {
  if (!analyzerId?.trim()) return true;
  const analyzer = analyzerId.trim() as AnalyzerId;
  const orderedCodes = row.tests.map((t) => t.code);
  if (!analyzerHasWork(analyzer, orderedCodes)) return false;
  return row.tests.some(
    (t) =>
      t.status === "awaiting_instrument" && t.analyzerId === analyzer,
  );
}
