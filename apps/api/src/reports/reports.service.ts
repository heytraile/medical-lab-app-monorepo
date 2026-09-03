import { Injectable, NotFoundException } from "@nestjs/common";
import { DRAX_HALL_LAB } from "@drax-lis/catalog";
import type {
  LabReportBranding,
  PatientReportPayload,
} from "@drax-lis/contracts";
import { SupabaseService } from "../supabase/supabase.module";
import { SyncService } from "../sync/sync.service";

const DEFAULT_REPORT_BRANDING: Omit<LabReportBranding, "name"> = {
  logoUrl: null,
  addressLines: [
    "Drax Hall Medical Centre",
    "St. Ann, Jamaica",
  ],
  phone: "+1 (876) 555-0100",
  email: "lab@draxhall.local",
  website: "https://draxhall.local",
  disclaimer:
    "For clinical use only. Verify critical values before therapeutic decisions. This report contains released results only.",
};

type CloudPatientRow = {
  id: string;
  edge_patient_id: string;
  mrn: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  date_of_birth: string | null;
  sex: string | null;
};

type CloudSpecimenRow = {
  accession_number: string;
  barcode: string;
  specimen_type: string;
  registered_at: string;
  ordered_tests: Array<{ code?: string; name?: string }> | null;
};

type CloudResultRow = {
  accession_number: string;
  test_code: string;
  test_name: string | null;
  value: string;
  units: string | null;
  reference_low: number | null;
  reference_high: number | null;
  flag: string;
  observed_at: string;
  released_at: string | null;
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly sync: SyncService,
  ) {}

  async buildPatientReport(edgePatientId: string): Promise<PatientReportPayload> {
    const generatedAt = new Date().toISOString();
    const lab = await this.loadLabBranding();

    if (this.supabase.enabled && this.supabase.client) {
      return this.buildFromSupabase(edgePatientId, generatedAt, lab);
    }

    return this.buildFromMemory(edgePatientId, generatedAt, lab);
  }

  private async loadLabBranding(): Promise<LabReportBranding> {
    const base: LabReportBranding = {
      name: DRAX_HALL_LAB.name,
      ...DEFAULT_REPORT_BRANDING,
    };

    if (!this.supabase.enabled || !this.supabase.client) {
      return base;
    }

    const { data, error } = await this.supabase.client
      .from("labs")
      .select("name, settings")
      .eq("id", DRAX_HALL_LAB.id)
      .maybeSingle();

    if (error || !data) return base;

    const settings = (data.settings ?? {}) as {
      report?: Partial<Omit<LabReportBranding, "name">> & {
        addressLines?: string[];
      };
    };
    const report = settings.report ?? {};

    return {
      name: (data.name as string) || base.name,
      logoUrl: report.logoUrl ?? base.logoUrl,
      addressLines:
        report.addressLines?.length ? report.addressLines : base.addressLines,
      phone: report.phone ?? base.phone,
      email: report.email ?? base.email,
      website: report.website ?? base.website,
      disclaimer: report.disclaimer ?? base.disclaimer,
    };
  }

  private async buildFromSupabase(
    edgePatientId: string,
    generatedAt: string,
    lab: LabReportBranding,
  ): Promise<PatientReportPayload> {
    const client = this.supabase.client!;

    const { data: patient, error: patientErr } = await client
      .from("patients")
      .select(
        "id, edge_patient_id, mrn, first_name, middle_name, last_name, date_of_birth, sex",
      )
      .eq("edge_patient_id", edgePatientId)
      .maybeSingle();

    if (patientErr) throw patientErr;
    if (!patient) {
      throw new NotFoundException(`Patient ${edgePatientId} not found in cloud`);
    }

    const p = patient as CloudPatientRow;
    const displayName = [p.first_name, p.middle_name, p.last_name]
      .filter(Boolean)
      .join(" ");

    const { data: specimens, error: specErr } = await client
      .from("specimens")
      .select(
        "accession_number, barcode, specimen_type, registered_at, ordered_tests",
      )
      .eq("patient_id", p.id)
      .order("registered_at", { ascending: false });

    if (specErr) throw specErr;

    const specRows = (specimens ?? []) as CloudSpecimenRow[];
    const accessionNumbers = specRows.map((s) => s.accession_number);

    let resultRows: CloudResultRow[] = [];
    if (accessionNumbers.length > 0) {
      const { data: results, error: resErr } = await client
        .from("results")
        .select(
          "accession_number, test_code, test_name, value, units, reference_low, reference_high, flag, observed_at, released_at",
        )
        .in("accession_number", accessionNumbers)
        .eq("status", "released")
        .order("observed_at", { ascending: false });

      if (resErr) throw resErr;
      resultRows = (results ?? []) as CloudResultRow[];
    }

    return this.assemblePayload({
      generatedAt,
      lab,
      patient: {
        mrn: p.mrn,
        displayName,
        dateOfBirth: p.date_of_birth,
        sex: p.sex,
      },
      specimens: specRows,
      results: resultRows,
    });
  }

  /** Dev fallback when Supabase is unset — uses in-memory sync projection. */
  private buildFromMemory(
    edgePatientId: string,
    generatedAt: string,
    lab: LabReportBranding,
  ): PatientReportPayload {
    const snapshot = this.sync.getMemoryPatientReportData(edgePatientId);
    if (!snapshot) {
      throw new NotFoundException(`Patient ${edgePatientId} not found in cloud`);
    }

    return this.assemblePayload({
      generatedAt,
      lab,
      patient: snapshot.patient,
      specimens: snapshot.specimens,
      results: snapshot.results,
    });
  }

  assemblePayload(input: {
    generatedAt: string;
    lab: LabReportBranding;
    patient: PatientReportPayload["patient"];
    specimens: CloudSpecimenRow[];
    results: CloudResultRow[];
  }): PatientReportPayload {
    const resultsByAccession = new Map<string, CloudResultRow[]>();
    for (const r of input.results) {
      const list = resultsByAccession.get(r.accession_number) ?? [];
      list.push(r);
      resultsByAccession.set(r.accession_number, list);
    }

    const accessions = input.specimens
      .filter((s) => (resultsByAccession.get(s.accession_number)?.length ?? 0) > 0)
      .map((s) => {
        const orderedRaw = s.ordered_tests ?? [];
        const orderedTests = orderedRaw
          .filter((t) => t.code)
          .map((t) => ({
            code: String(t.code),
            name: t.name ? String(t.name) : undefined,
          }));

        const rows = resultsByAccession.get(s.accession_number) ?? [];
        return {
          accessionNumber: s.accession_number,
          barcode: s.barcode,
          specimenType: s.specimen_type,
          registeredAt: s.registered_at,
          orderedTests,
          results: rows.map((r) => ({
            testCode: r.test_code,
            testName: r.test_name,
            value: r.value,
            units: r.units,
            referenceLow: r.reference_low,
            referenceHigh: r.reference_high,
            flag: r.flag,
            observedAt: r.observed_at,
            releasedAt: r.released_at,
          })),
        };
      });

    const resultCount = accessions.reduce((n, a) => n + a.results.length, 0);

    return {
      generatedAt: input.generatedAt,
      lab: input.lab,
      patient: input.patient,
      accessions,
      summary: {
        accessionCount: accessions.length,
        resultCount,
      },
    };
  }
}
