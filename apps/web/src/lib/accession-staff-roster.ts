import type { BenchResult, SpecimenRow } from "./api";
import { analyzerLabel } from "./analyzers";
import { actorName, parseActor } from "./result-attribution";

export type CollectorSnapshot = {
  staffId?: string;
  fullName?: string;
  jobTitle?: string;
};

export type StaffPersonLine = {
  name: string;
  jobTitle?: string | null;
};

export type ManualContributor = StaffPersonLine & {
  testCodes: string[];
};

export type AccessionStaffRoster = {
  collectedBy: StaffPersonLine | null;
  accessionedBy: StaffPersonLine | null;
  manualContributors: ManualContributor[];
  submittedBy: (StaffPersonLine & { at?: string | null }) | null;
  instruments: string[];
};

function parseCollectorSnapshot(
  raw: string | null | undefined,
): CollectorSnapshot | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CollectorSnapshot;
  } catch {
    return null;
  }
}

function collectorFromSpecimen(row: SpecimenRow): StaffPersonLine | null {
  const snap = parseCollectorSnapshot(row.collectedBySnapshot);
  const name =
    row.collectedByName?.trim() ||
    snap?.fullName?.trim() ||
    snap?.staffId?.trim() ||
    null;
  if (!name) return null;
  return {
    name,
    jobTitle: snap?.jobTitle ?? null,
  };
}

function registrantFromSpecimen(row: SpecimenRow): StaffPersonLine | null {
  const name =
    row.registeredByName?.trim() ||
    actorName(row.registeredBySnapshot);
  if (!name || name === "Unknown staff") return null;
  const actor = parseActor(row.registeredBySnapshot);
  return {
    name,
    jobTitle: actor?.jobTitle ?? null,
  };
}

export function buildAccessionStaffRoster(
  accessionNumber: string,
  specimens: SpecimenRow[],
  results: BenchResult[],
): AccessionStaffRoster {
  const accessionSpecimens = specimens.filter(
    (row) => row.accessionNumber === accessionNumber,
  );
  const accessionResults = results.filter(
    (row) => row.accessionNumber === accessionNumber,
  );

  let collectedBy: StaffPersonLine | null = null;
  for (const specimen of accessionSpecimens) {
    const line = collectorFromSpecimen(specimen);
    if (line) {
      collectedBy = line;
      break;
    }
  }

  let accessionedBy: StaffPersonLine | null = null;
  for (const specimen of accessionSpecimens) {
    const line = registrantFromSpecimen(specimen);
    if (line) {
      accessionedBy = line;
      break;
    }
  }

  const contributorMap = new Map<string, ManualContributor>();
  for (const result of accessionResults) {
    if (result.analyzerId !== "manual") continue;
    const actor = parseActor(
      result.manualLastEditedBySnapshot ?? result.manualEnteredBySnapshot,
    );
    const key =
      actor?.userId ||
      actorName(result.manualEnteredBySnapshot) ||
      result.id;
    const name = actorName(result.manualEnteredBySnapshot);
    const testLabel = result.testCode;
    const existing = contributorMap.get(key);
    if (existing) {
      if (!existing.testCodes.includes(testLabel)) {
        existing.testCodes.push(testLabel);
      }
      continue;
    }
    contributorMap.set(key, {
      name,
      jobTitle: actor?.jobTitle ?? null,
      testCodes: [testLabel],
    });
  }

  let submittedBy: AccessionStaffRoster["submittedBy"] = null;
  for (const result of accessionResults) {
    const actor = parseActor(result.submittedBySnapshot);
    if (!actor) continue;
    submittedBy = {
      name: actorName(result.submittedBySnapshot),
      jobTitle: actor.jobTitle ?? null,
      at: result.submittedAt ?? null,
    };
    break;
  }

  const instruments = [
    ...new Set(
      accessionResults
        .filter((result) => result.analyzerId !== "manual")
        .map((result) => analyzerLabel(result.analyzerId)),
    ),
  ].sort();

  return {
    collectedBy,
    accessionedBy,
    manualContributors: [...contributorMap.values()],
    submittedBy,
    instruments,
  };
}

export function formatPersonLine(person: StaffPersonLine): string {
  if (person.jobTitle?.trim()) {
    return `${person.name} (${person.jobTitle.trim()})`;
  }
  return person.name;
}
