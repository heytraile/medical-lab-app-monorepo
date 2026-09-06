import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NotFoundException } from "@nestjs/common";
import { ReportsService } from "./reports.service.js";
import type { SupabaseService } from "../supabase/supabase.module.js";
import type { SyncService } from "../sync/sync.service.js";

const snapshot = {
  patient: {
    mrn: "MRN-1",
    displayName: "Test Patient",
    dateOfBirth: null,
    sex: null,
  },
  specimens: [
    {
      accession_number: "ACC-1",
      barcode: "BC-1",
      specimen_type: "blood",
      registered_at: "2026-09-05T12:00:00.000Z",
      ordered_tests: [{ code: "CBC" }],
    },
    {
      accession_number: "ACC-2",
      barcode: "BC-2",
      specimen_type: "blood",
      registered_at: "2026-09-05T13:00:00.000Z",
      ordered_tests: [{ code: "CMP" }],
    },
  ],
  results: [
    {
      accession_number: "ACC-1",
      test_code: "WBC",
      test_name: "White blood cells",
      value: "7.0",
      units: "10^9/L",
      reference_low: 4,
      reference_high: 11,
      flag: "normal",
      observed_at: "2026-09-05T12:30:00.000Z",
      released_at: "2026-09-05T14:00:00.000Z",
    },
    {
      accession_number: "ACC-2",
      test_code: "GLU",
      test_name: "Glucose",
      value: "5.1",
      units: "mmol/L",
      reference_low: 3.9,
      reference_high: 5.5,
      flag: "normal",
      observed_at: "2026-09-05T13:30:00.000Z",
      released_at: "2026-09-05T14:00:00.000Z",
    },
  ],
};

function service() {
  const supabase = { enabled: false, client: null } as SupabaseService;
  const sync = {
    getMemoryPatientReportData: (patientId: string) =>
      patientId === "patient-1" ? snapshot : null,
  } as unknown as SyncService;
  return new ReportsService(supabase, sync);
}

describe("ReportsService accession scope", () => {
  it("returns only the requested patient accession", async () => {
    const report = await service().buildPatientReport("patient-1", "ACC-2");

    assert.equal(report.summary.accessionCount, 1);
    assert.equal(report.summary.resultCount, 1);
    assert.equal(report.accessions[0]?.accessionNumber, "ACC-2");
  });

  it("rejects an accession that does not belong to the patient", async () => {
    await assert.rejects(
      service().buildPatientReport("patient-1", "ACC-OTHER"),
      NotFoundException,
    );
  });
});
