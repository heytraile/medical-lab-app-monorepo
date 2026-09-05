import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assembleReleaseQueueGroups,
  worstFlag,
} from "./release-queue.helpers.js";

describe("worstFlag", () => {
  it("returns normal when all results are normal", () => {
    assert.equal(worstFlag(["normal", "normal"]), "normal");
  });

  it("returns the highest-severity flag in a mixed group", () => {
    assert.equal(worstFlag(["normal", "high", "low"]), "high");
    assert.equal(worstFlag(["normal", "critical_low"]), "critical_low");
  });

  it("prefers classified flags over unknown", () => {
    assert.equal(worstFlag(["unknown", "normal"]), "normal");
    assert.equal(worstFlag(["unknown", "high"]), "high");
  });

  it("returns normal for an empty flag list", () => {
    assert.equal(worstFlag([]), "normal");
  });
});

describe("assembleReleaseQueueGroups", () => {
  const specimenByAccession = new Map([
    [
      "ACC-1",
      {
        accession_number: "ACC-1",
        barcode: "BC-1",
        registered_at: "2026-01-01T10:00:00.000Z",
        registered_by_snapshot: null,
        patient_json: {
          displayName: "Jane Doe",
          mrn: "MRN1",
        },
        patients: null,
      },
    ],
  ]);

  it("tags pending groups with queuePhase pending_authorization", () => {
    const groups = assembleReleaseQueueGroups(
      [
        {
          id: "r1",
          accession_number: "ACC-1",
          analyzer_id: "a1",
          test_code: "WBC",
          value: "5.0",
          flag: "normal",
          observed_at: "2026-01-01T11:00:00.000Z",
          submitted_at: "2026-01-01T12:00:00.000Z",
        },
      ],
      specimenByAccession,
      "pending_authorization",
    );

    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.queuePhase, "pending_authorization");
    assert.equal(groups[0]?.releasedAt, null);
    assert.equal(groups[0]?.worstFlag, "normal");
  });

  it("exposes the acknowledged missing-result snapshot", () => {
    const specimens = new Map([
      [
        "ACC-1",
        {
          ...specimenByAccession.get("ACC-1")!,
          submit_missing_expected: [
            {
              orderedTestCode: "ESR",
              orderedTestName: "ESR",
              componentCode: "RESULT",
              componentName: "Manual result",
              workflow: "manual_only",
              confirmationStatus: "provisional",
            },
          ],
        },
      ],
    ]);
    const groups = assembleReleaseQueueGroups(
      [
        {
          id: "r1",
          accession_number: "ACC-1",
          analyzer_id: "mindray_bs240",
          test_code: "CREATININE",
          value: "0.9",
          flag: "normal",
          observed_at: "2026-01-01T11:00:00.000Z",
          submitted_at: "2026-01-01T12:00:00.000Z",
        },
      ],
      specimens,
      "pending_authorization",
    );

    assert.equal(groups[0]?.submittedIncomplete, true);
    assert.equal(
      groups[0]?.missingExpectedResults[0]?.orderedTestCode,
      "ESR",
    );
  });

  it("tags released groups with released metadata", () => {
    const groups = assembleReleaseQueueGroups(
      [
        {
          id: "r1",
          accession_number: "ACC-1",
          analyzer_id: "a1",
          test_code: "WBC",
          value: "5.0",
          flag: "normal",
          observed_at: "2026-01-01T11:00:00.000Z",
          submitted_at: "2026-01-01T12:00:00.000Z",
          released_at: "2026-01-01T13:00:00.000Z",
          released_by_snapshot: {
            userId: "auth-1",
            role: "authorizer",
            fullName: "Dr. Smith",
          },
        },
      ],
      specimenByAccession,
      "released",
    );

    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.queuePhase, "released");
    assert.equal(groups[0]?.releasedAt, "2026-01-01T13:00:00.000Z");
    assert.equal(groups[0]?.releasedBy?.fullName, "Dr. Smith");
  });

  it("includes released accessions without a cloud specimen row", () => {
    const groups = assembleReleaseQueueGroups(
      [
        {
          id: "r1",
          accession_number: "ACC-ORPHAN",
          analyzer_id: "a1",
          test_code: "WBC",
          value: "5.0",
          flag: "normal",
          observed_at: "2026-01-01T11:00:00.000Z",
          released_at: "2026-01-01T13:00:00.000Z",
        },
      ],
      new Map(),
      "released",
    );

    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.accessionNumber, "ACC-ORPHAN");
    assert.equal(groups[0]?.queuePhase, "released");
    assert.equal(groups[0]?.patient.displayName, "Unknown patient");
  });

  it("sets worstFlag to normal when all results are normal (Andre Bailey scenario)", () => {
    const groups = assembleReleaseQueueGroups(
      [
        {
          id: "r1",
          accession_number: "ACC-1",
          analyzer_id: "sysmex_xs1000i",
          test_code: "WBC",
          value: "6.5",
          flag: "normal",
          observed_at: "2026-01-01T11:00:00.000Z",
          submitted_at: "2026-01-01T12:00:00.000Z",
        },
        {
          id: "r2",
          accession_number: "ACC-1",
          analyzer_id: "sysmex_xs1000i",
          test_code: "HGB",
          value: "13.8",
          flag: "normal",
          observed_at: "2026-01-01T11:00:00.000Z",
          submitted_at: "2026-01-01T12:00:00.000Z",
        },
        {
          id: "r3",
          accession_number: "ACC-1",
          analyzer_id: "mindray_bs240",
          test_code: "GLUCOSE",
          value: "92",
          flag: "normal",
          observed_at: "2026-01-01T11:05:00.000Z",
          submitted_at: "2026-01-01T12:00:00.000Z",
        },
      ],
      new Map([
        [
          "ACC-1",
          {
            accession_number: "ACC-1",
            barcode: "BC-1",
            patient_json: {
              firstName: "Andre",
              middleName: "M.",
              lastName: "Bailey",
              mrn: "MRN-7007",
            },
            patients: null,
          },
        ],
      ]),
      "pending_authorization",
    );

    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.patient.displayName, "Andre M. Bailey");
    assert.equal(groups[0]?.worstFlag, "normal");
    assert.ok(
      groups[0]?.results.every((r) => r.flag === "normal"),
      "all underlying flags should remain normal",
    );
  });

  it("resolves stored unknown flags to normal/high/low for display", () => {
    const groups = assembleReleaseQueueGroups(
      [
        {
          id: "r1",
          accession_number: "ACC-1",
          analyzer_id: "a1",
          test_code: "WBC",
          value: "6.5",
          reference_low: 4,
          reference_high: 11,
          flag: "unknown",
          observed_at: "2026-01-01T11:00:00.000Z",
          submitted_at: "2026-01-01T12:00:00.000Z",
        },
        {
          id: "r2",
          accession_number: "ACC-1",
          analyzer_id: "a1",
          test_code: "GLUCOSE",
          value: "180",
          reference_low: 70,
          reference_high: 110,
          flag: "unknown",
          observed_at: "2026-01-01T11:00:00.000Z",
          submitted_at: "2026-01-01T12:00:00.000Z",
        },
      ],
      specimenByAccession,
      "pending_authorization",
    );

    assert.equal(groups[0]?.results[0]?.flag, "normal");
    assert.equal(groups[0]?.results[1]?.flag, "high");
    assert.equal(groups[0]?.worstFlag, "high");
  });
});
