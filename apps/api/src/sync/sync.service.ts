import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { ActorSnapshot } from "@drax-lis/contracts";
import { SupabaseService } from "../supabase/supabase.module";
import { AuditService } from "../audit/audit.service";
import type {
  SyncEventsRequest,
  SyncEventsResponse,
  PatientReportPayload,
  ReleaseQueueGroup,
  ReleaseAccessionResponse,
} from "@drax-lis/contracts";
import { assembleReleaseQueueGroups, type SpecimenContext } from "./release-queue.helpers";

type StoredEvent = {
  eventId: string;
  type: string;
  sequence: number;
  payload: Record<string, unknown>;
  edgeNodeId: string;
  receivedAt: string;
};

/**
 * Idempotent ingest of edge outbox events + projection into clinical tables.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly memory = new Map<string, StoredEvent>();

  constructor(
    private readonly supabase: SupabaseService,
    private readonly audit: AuditService,
  ) {}

  async ingest(request: SyncEventsRequest): Promise<SyncEventsResponse> {
    const ackedEventIds: string[] = [];
    const duplicateEventIds: string[] = [];

    for (const event of request.events) {
      if (this.supabase.enabled && this.supabase.client) {
        const client = this.supabase.client;
        const { data: existing } = await client
          .from("sync_events")
          .select("event_id")
          .eq("event_id", event.eventId)
          .maybeSingle();

        if (existing) {
          duplicateEventIds.push(event.eventId);
          continue;
        }

        const { error } = await client.from("sync_events").insert({
          event_id: event.eventId,
          edge_node_id: request.edgeNodeId,
          type: event.type,
          sequence: event.sequence,
          payload: event.payload,
          created_at: event.createdAt,
          received_at: new Date().toISOString(),
        });

        if (error) {
          this.logger.error(`Supabase sync_events insert failed: ${error.message}`);
          throw error;
        }

        try {
          await this.projectEvent(
            event.type,
            event.payload,
            request.edgeNodeId,
          );
        } catch (projErr) {
          this.logger.error(
            `Projection failed for ${event.eventId}: ${
              projErr instanceof Error ? projErr.message : String(projErr)
            }`,
          );
          // Event is recorded; do not ack so edge retries after fix
          throw projErr;
        }

        ackedEventIds.push(event.eventId);
      } else {
        if (this.memory.has(event.eventId)) {
          duplicateEventIds.push(event.eventId);
          continue;
        }
        this.memory.set(event.eventId, {
          eventId: event.eventId,
          type: event.type,
          sequence: event.sequence,
          payload: event.payload,
          edgeNodeId: request.edgeNodeId,
          receivedAt: new Date().toISOString(),
        });
        // Also keep a projected in-memory clinical store for local demos
        await this.projectMemory(event.type, event.payload);
        ackedEventIds.push(event.eventId);
      }
    }

    this.logger.log(
      `Sync from ${request.edgeNodeId}: acked=${ackedEventIds.length} dup=${duplicateEventIds.length}`,
    );

    return { ackedEventIds, duplicateEventIds };
  }

  /** In-memory clinical rows when Supabase is unset (dev). */
  private memoryPatients = new Map<string, Record<string, unknown>>();
  private memorySpecimens = new Map<string, Record<string, unknown>>();
  private memoryResults = new Map<string, Record<string, unknown>>();

  private async projectMemory(type: string, payload: Record<string, unknown>) {
    if (type === "patient.provisional_created") {
      const id = String(payload.patientId ?? "");
      if (id) this.memoryPatients.set(id, { ...payload, id });
      return;
    }
    if (type === "specimen.registered") {
      const accession = String(payload.accessionNumber ?? "");
      if (accession) {
        this.memorySpecimens.set(accession, {
          id: accession,
          ...payload,
          status: "registered",
        });
      }
      return;
    }
    if (type === "result.batch" || type === "result.received") {
      const results = (payload.results as Array<Record<string, unknown>>) ?? [];
      for (const r of results) {
        const id = String(r.id ?? `${payload.accessionNumber}-${r.testCode}`);
        this.memoryResults.set(id, {
          ...r,
          id,
          accession_number: payload.accessionNumber,
          barcode: payload.barcode,
          analyzer_id: payload.analyzerId,
          status: r.status ?? "pending_review",
        });
      }
      return;
    }

    if (type === "result.submitted") {
      const edgeResults =
        (payload.results as Array<Record<string, unknown>>) ?? [];
      const submittedAt = String(
        payload.submittedAt ?? new Date().toISOString(),
      );
      for (const r of edgeResults) {
        const id = String(r.id ?? "");
        if (!id) continue;
        const accessionNumbers = (payload.accessionNumbers as string[]) ?? [];
        const accession = String(
          r.accessionNumber ?? accessionNumbers[0] ?? "",
        );
        const existing = this.memoryResults.get(id);
        const base = existing ?? {
          id,
          accession_number: accession,
          barcode: r.barcode ?? accession,
          analyzer_id: r.analyzerId ?? "unknown",
          test_code: r.testCode,
          test_name: r.testName,
          value: r.value,
          units: r.units,
          reference_low: r.referenceLow,
          reference_high: r.referenceHigh,
          flag: r.flag ?? "unknown",
          observed_at: r.observedAt ?? submittedAt,
        };
        this.memoryResults.set(id, {
          ...base,
          status: "pending_authorization",
        });
      }

      const accessionNumbers = (payload.accessionNumbers as string[]) ?? [];
      if (accessionNumbers.length && edgeResults.length === 0) {
        for (const [id, row] of this.memoryResults.entries()) {
          if (
            accessionNumbers.includes(String(row.accession_number)) &&
            row.status === "pending_review"
          ) {
            this.memoryResults.set(id, {
              ...row,
              status: "pending_authorization",
            });
          }
        }
      }

      const specimensByAccession =
        (payload.specimensByAccession as Record<
          string,
          Record<string, unknown>
        >) ?? {};
      for (const [accession, specData] of Object.entries(
        specimensByAccession,
      )) {
        if (!this.memorySpecimens.has(accession)) {
          this.memorySpecimens.set(accession, {
            accessionNumber: accession,
            ...specData,
            status: "registered",
          });
        }
        const patient = specData.patient as Record<string, unknown> | undefined;
        if (patient?.id) {
          this.memoryPatients.set(String(patient.id), patient);
        }
      }
      return;
    }

    if (type === "result.recalled") {
      const accessionNumbers = (payload.accessionNumbers as string[]) ?? [];
      for (const [id, row] of this.memoryResults.entries()) {
        if (
          accessionNumbers.includes(String(row.accession_number)) &&
          row.status === "pending_authorization"
        ) {
          this.memoryResults.set(id, {
            ...row,
            status: "pending_review",
            submitted_at: null,
            submitted_by: null,
            submitted_by_snapshot: null,
          });
        }
      }
    }
  }

  private async upsertSpecimenRegistration(
    client: NonNullable<SupabaseService["client"]>,
    opts: {
      accessionNumber: string;
      barcode: string;
      edgePatientId?: string | null;
      patient?: Record<string, unknown> | null;
      patientName?: unknown;
      orderedTests?: unknown;
      specimenType?: string;
      identityConfirmation?: unknown;
      registeredBy?: string | null;
      registeredBySnapshot?: unknown;
      registeredAt?: string | null;
    },
  ) {
    const accession = opts.accessionNumber;
    const barcode = opts.barcode || accession;
    if (!accession) return;

    let patientUuid: string | null = null;
    const edgePatientId = opts.edgePatientId ?? null;
    const patient = opts.patient ?? null;

    if (edgePatientId) {
      const { data: existing } = await client
        .from("patients")
        .select("id")
        .eq("edge_patient_id", edgePatientId)
        .maybeSingle();
      if (existing?.id) {
        patientUuid = existing.id as string;
      } else if (patient) {
        const mrn = String(patient.mrn ?? `EDGE-${edgePatientId.slice(0, 8)}`);
        const { data: upserted, error } = await client
          .from("patients")
          .upsert(
            {
              edge_patient_id: edgePatientId,
              mrn,
              first_name: String(patient.firstName ?? "Unknown"),
              middle_name: (patient.middleName as string | null) ?? null,
              last_name: String(patient.lastName ?? ""),
              date_of_birth: (patient.dateOfBirth as string | null) ?? null,
              sex: (patient.sex as string | null) ?? null,
              identity_origin: String(
                patient.identityOrigin ?? "upstream",
              ),
              sync_status: String(patient.syncStatus ?? "n_a"),
              status: "active",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "edge_patient_id" },
          )
          .select("id")
          .single();
        if (error) throw error;
        patientUuid = upserted.id as string;
      }
    }

    const { error } = await client.from("specimens").upsert(
      {
        accession_number: accession,
        barcode,
        patient_id: patientUuid,
        patient_json: patient ?? { patientName: opts.patientName },
        ordered_tests: opts.orderedTests ?? [],
        specimen_type: String(opts.specimenType ?? "blood"),
        status: "registered",
        identity_confirmation: opts.identityConfirmation ?? null,
        registered_by: opts.registeredBy ?? null,
        registered_by_snapshot: opts.registeredBySnapshot ?? null,
        registered_at: opts.registeredAt ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "accession_number" },
    );
    if (error) throw error;
  }

  private async ensureSpecimensFromSubmitPayload(
    client: NonNullable<SupabaseService["client"]>,
    specimensByAccession: Record<string, Record<string, unknown>>,
  ) {
    for (const [accession, specData] of Object.entries(specimensByAccession)) {
      const { data: existing } = await client
        .from("specimens")
        .select("id, patient_id, patient_json")
        .eq("accession_number", accession)
        .maybeSingle();

      const patient = specData.patient as Record<string, unknown> | null;
      const edgePatientId = specData.patientId
        ? String(specData.patientId)
        : patient?.id
          ? String(patient.id)
          : null;

      if (!existing) {
        await this.upsertSpecimenRegistration(client, {
          accessionNumber: accession,
          barcode: String(specData.barcode ?? accession),
          edgePatientId,
          patient,
          registeredBy: specData.registeredBy
            ? String(specData.registeredBy)
            : null,
          registeredBySnapshot: specData.registeredBySnapshot ?? null,
          registeredAt: specData.registeredAt
            ? String(specData.registeredAt)
            : null,
        });
        continue;
      }

      const hasPatientLink =
        existing.patient_id ||
        (existing.patient_json &&
          typeof existing.patient_json === "object" &&
          Object.keys(existing.patient_json as object).length > 0);

      if (!hasPatientLink && patient) {
        let patientUuid: string | null = (existing.patient_id as string) ?? null;
        if (edgePatientId) {
          const { data: patientRow } = await client
            .from("patients")
            .select("id")
            .eq("edge_patient_id", edgePatientId)
            .maybeSingle();
          if (patientRow?.id) {
            patientUuid = patientRow.id as string;
          } else {
            const mrn = String(
              patient.mrn ?? `EDGE-${edgePatientId.slice(0, 8)}`,
            );
            const { data: upserted, error } = await client
              .from("patients")
              .upsert(
                {
                  edge_patient_id: edgePatientId,
                  mrn,
                  first_name: String(patient.firstName ?? "Unknown"),
                  middle_name: (patient.middleName as string | null) ?? null,
                  last_name: String(patient.lastName ?? ""),
                  date_of_birth: (patient.dateOfBirth as string | null) ?? null,
                  sex: (patient.sex as string | null) ?? null,
                  identity_origin: String(
                    patient.identityOrigin ?? "upstream",
                  ),
                  sync_status: String(patient.syncStatus ?? "n_a"),
                  status: "active",
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "edge_patient_id" },
              )
              .select("id")
              .single();
            if (error) throw error;
            patientUuid = upserted.id as string;
          }
        }

        const { error } = await client
          .from("specimens")
          .update({
            patient_id: patientUuid,
            patient_json: patient,
            updated_at: new Date().toISOString(),
          })
          .eq("accession_number", accession);
        if (error) throw error;
      }
    }
  }

  private async projectEvent(
    type: string,
    payload: Record<string, unknown>,
    edgeNodeId?: string,
  ) {
    const client = this.supabase.client;
    if (!client) return;

    if (type === "patient.provisional_created") {
      const edgeId = String(payload.patientId ?? "");
      const mrn = String(payload.mrn ?? "");
      if (!edgeId || !mrn) return;
      const row = {
        edge_patient_id: edgeId,
        mrn,
        first_name: String(payload.firstName ?? ""),
        middle_name: (payload.middleName as string | null) ?? null,
        last_name: String(payload.lastName ?? ""),
        date_of_birth: (payload.dateOfBirth as string | null) ?? null,
        sex: (payload.sex as string | null) ?? null,
        identity_origin: String(payload.identityOrigin ?? "local_provisional"),
        sync_status: String(payload.syncStatus ?? "pending_upstream"),
        status: "active",
        updated_at: new Date().toISOString(),
      };
      const { error } = await client.from("patients").upsert(row, {
        onConflict: "edge_patient_id",
      });
      if (error) throw error;
      return;
    }

    if (type === "specimen.registered") {
      const accession = String(payload.accessionNumber ?? "");
      const barcode = String(payload.barcode ?? accession);
      if (!accession) return;

      const edgePatientId = payload.patientId
        ? String(payload.patientId)
        : null;
      const patient = payload.patient as Record<string, unknown> | undefined;

      await this.upsertSpecimenRegistration(client, {
        accessionNumber: accession,
        barcode,
        edgePatientId,
        patient: patient ?? null,
        patientName: payload.patientName,
        orderedTests: payload.orderedTests ?? [],
        specimenType: String(payload.specimenType ?? "blood"),
        identityConfirmation: payload.identityConfirmation ?? null,
        registeredBy: payload.registeredBy
          ? String(payload.registeredBy)
          : null,
        registeredBySnapshot: payload.registeredBySnapshot ?? null,
      });
      return;
    }

    if (type === "result.batch" || type === "result.received") {
      const results = (payload.results as Array<Record<string, unknown>>) ?? [];
      const accession = String(payload.accessionNumber ?? "");
      const barcode = String(payload.barcode ?? accession);
      const analyzerId = String(payload.analyzerId ?? "unknown");

      for (const r of results) {
        const edgeResultId = String(r.id ?? "");
        if (!edgeResultId) continue;
        const { error } = await client.from("results").upsert(
          {
            edge_result_id: edgeResultId,
            accession_number: accession,
            barcode,
            analyzer_id: analyzerId,
            test_code: String(r.testCode ?? ""),
            test_name: (r.testName as string | null) ?? null,
            value: String(r.value ?? ""),
            units: (r.units as string | null) ?? null,
            reference_low:
              typeof r.referenceLow === "number" ? r.referenceLow : null,
            reference_high:
              typeof r.referenceHigh === "number" ? r.referenceHigh : null,
            flag: String(r.flag ?? "unknown"),
            status: String(r.status ?? "pending_review"),
            observed_at: String(
              r.observedAt ?? new Date().toISOString(),
            ),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "edge_result_id" },
        );
        if (error) throw error;
      }
      return;
    }

    if (type === "result.submitted") {
      const accessionNumbers = (payload.accessionNumbers as string[]) ?? [];
      const submittedBy = payload.submittedBy
        ? String(payload.submittedBy)
        : null;
      const submittedBySnapshot = payload.submittedBySnapshot ?? null;
      const submittedAt = String(
        payload.submittedAt ?? new Date().toISOString(),
      );
      const edgeResults =
        (payload.results as Array<Record<string, unknown>>) ?? [];

      for (const r of edgeResults) {
        const edgeResultId = String(r.id ?? "");
        if (!edgeResultId) continue;
        const accession = String(
          r.accessionNumber ?? accessionNumbers[0] ?? "",
        );
        const barcode = String(r.barcode ?? accession);
        const analyzerId = String(r.analyzerId ?? "unknown");
        const row = {
          edge_result_id: edgeResultId,
          accession_number: accession,
          barcode,
          analyzer_id: analyzerId,
          test_code: String(r.testCode ?? ""),
          test_name: (r.testName as string | null) ?? null,
          value: String(r.value ?? ""),
          units: (r.units as string | null) ?? null,
          reference_low:
            typeof r.referenceLow === "number" ? r.referenceLow : null,
          reference_high:
            typeof r.referenceHigh === "number" ? r.referenceHigh : null,
          flag: String(r.flag ?? "unknown"),
          status: "pending_authorization",
          observed_at: String(r.observedAt ?? new Date().toISOString()),
          submitted_by: submittedBy,
          submitted_by_snapshot: submittedBySnapshot,
          submitted_at: submittedAt,
          updated_at: new Date().toISOString(),
        };
        const { error } = await client
          .from("results")
          .upsert(row, { onConflict: "edge_result_id" });
        if (error) throw error;
      }

      if (accessionNumbers.length && edgeResults.length === 0) {
        const { error } = await client
          .from("results")
          .update({
            status: "pending_authorization",
            submitted_by: submittedBy,
            submitted_by_snapshot: submittedBySnapshot,
            submitted_at: submittedAt,
            updated_at: new Date().toISOString(),
          })
          .in("accession_number", accessionNumbers)
          .eq("status", "pending_review");
        if (error) throw error;
      }

      const specimensByAccession =
        (payload.specimensByAccession as Record<
          string,
          Record<string, unknown>
        >) ?? {};
      if (Object.keys(specimensByAccession).length > 0) {
        await this.ensureSpecimensFromSubmitPayload(
          client,
          specimensByAccession,
        );
      }

      const actor = submittedBySnapshot as ActorSnapshot | null;
      const resultIds = edgeResults
        .map((r) => String(r.id ?? ""))
        .filter(Boolean);
      await this.audit.log({
        eventType: "result.submitted_for_release",
        entityType: "accession",
        entityId: accessionNumbers.join(",") || "unknown",
        actor,
        payload: {
          accessionNumbers,
          resultIds,
          resultCount: edgeResults.length || accessionNumbers.length,
        },
        edgeNodeId: edgeNodeId ?? null,
      });
      return;
    }

    if (type === "result.recalled") {
      const accessionNumbers = (payload.accessionNumbers as string[]) ?? [];
      if (!accessionNumbers.length) return;

      const { error } = await client
        .from("results")
        .update({
          status: "pending_review",
          submitted_by: null,
          submitted_by_snapshot: null,
          submitted_at: null,
          updated_at: new Date().toISOString(),
        })
        .in("accession_number", accessionNumbers)
        .eq("status", "pending_authorization");
      if (error) throw error;

      const actor = payload.recalledBySnapshot as ActorSnapshot | null;
      const isAuthorizerReject =
        actor?.role === "authorizer" || actor?.role === "admin";
      const auditEventType = isAuthorizerReject
        ? "result.accession_rejected"
        : "result.accession_recalled";

      await this.audit.log({
        eventType: auditEventType,
        entityType: "accession",
        entityId: accessionNumbers.join(",") || "unknown",
        actor,
        payload: {
          accessionNumbers,
          reason: payload.reason ?? null,
        },
        edgeNodeId: edgeNodeId ?? null,
      });
      return;
    }
  }

  listMemory() {
    return Array.from(this.memory.values()).sort(
      (a, b) => a.sequence - b.sequence,
    );
  }

  async listResults(opts: { status?: string }) {
    if (this.supabase.enabled && this.supabase.client) {
      let q = this.supabase.client
        .from("results")
        .select("*")
        .order("observed_at", { ascending: false })
        .limit(200);
      if (opts.status) q = q.eq("status", opts.status);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    }
    let rows = Array.from(this.memoryResults.values());
    if (opts.status) {
      rows = rows.filter((r) => r.status === opts.status);
    }
    return rows;
  }

  async listSpecimens() {
    if (this.supabase.enabled && this.supabase.client) {
      const { data, error } = await this.supabase.client
        .from("specimens")
        .select("*")
        .order("registered_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    }
    return Array.from(this.memorySpecimens.values());
  }

  async listReleaseQueue(): Promise<ReleaseQueueGroup[]> {
    if (this.supabase.enabled && this.supabase.client) {
      const client = this.supabase.client;
      const { data: results, error: resErr } = await client
        .from("results")
        .select(
          "id, accession_number, barcode, analyzer_id, test_code, test_name, value, units, flag, observed_at, submitted_at, submitted_by_snapshot",
        )
        .eq("status", "pending_authorization")
        .order("submitted_at", { ascending: false })
        .limit(500);
      if (resErr) throw resErr;
      if (!results?.length) return [];

      const accessions = [
        ...new Set(results.map((r) => String(r.accession_number))),
      ];

      const { data: specimens, error: specErr } = await client
        .from("specimens")
        .select(
          `
          accession_number,
          barcode,
          registered_at,
          registered_by_snapshot,
          patient_json,
          patients (
            edge_patient_id,
            mrn,
            first_name,
            middle_name,
            last_name,
            date_of_birth,
            sex
          )
        `,
        )
        .in("accession_number", accessions);
      if (specErr) throw specErr;

      const specimenByAccession = new Map(
        (specimens ?? []).map((s) => {
          const rawPatients = s.patients as
            | SpecimenContext["patients"]
            | SpecimenContext["patients"][]
            | null;
          const patients = Array.isArray(rawPatients)
            ? rawPatients[0] ?? null
            : rawPatients ?? null;
          return [
            String(s.accession_number),
            {
              accession_number: String(s.accession_number),
              barcode: String(s.barcode),
              registered_at: s.registered_at as string | null,
              registered_by_snapshot: s.registered_by_snapshot,
              patient_json: s.patient_json,
              patients,
            },
          ];
        }),
      );

      return assembleReleaseQueueGroups(results, specimenByAccession);
    }

    const results = Array.from(this.memoryResults.values())
      .filter((r) => String(r.status) === "pending_authorization")
      .map((r) => ({
        id: String(r.id),
        accession_number: String(r.accession_number ?? ""),
        barcode: r.barcode as string | undefined,
        analyzer_id: String(r.analyzer_id ?? r.analyzerId ?? "unknown"),
        test_code: String(r.test_code ?? r.testCode ?? ""),
        test_name: (r.test_name ?? r.testName) as string | null | undefined,
        value: String(r.value ?? ""),
        units: (r.units as string | null | undefined) ?? null,
        flag: String(r.flag ?? "unknown"),
        observed_at: String(r.observed_at ?? r.observedAt ?? ""),
        submitted_at: (r.submitted_at ?? r.submittedAt) as
          | string
          | null
          | undefined,
        submitted_by_snapshot: r.submitted_by_snapshot ?? r.submittedBySnapshot,
      }));

    const specimenByAccession = new Map<
      string,
      Parameters<typeof assembleReleaseQueueGroups>[1] extends Map<
        string,
        infer V
      >
        ? V
        : never
    >();

    for (const spec of this.memorySpecimens.values()) {
      const accession = String(spec.accessionNumber ?? spec.id ?? "");
      if (!accession) continue;
      const patientId = String(spec.patientId ?? "");
      let patients: {
        edge_patient_id?: string;
        mrn?: string;
        first_name?: string;
        middle_name?: string | null;
        last_name?: string;
        date_of_birth?: string | null;
        sex?: string | null;
      } | null = null;

      if (patientId) {
        for (const p of this.memoryPatients.values()) {
          if (String(p.patientId ?? p.id) === patientId) {
            patients = {
              edge_patient_id: patientId,
              mrn: String(p.mrn ?? ""),
              first_name: String(p.firstName ?? ""),
              middle_name: (p.middleName as string | null) ?? null,
              last_name: String(p.lastName ?? ""),
              date_of_birth: (p.dateOfBirth as string | null) ?? null,
              sex: (p.sex as string | null) ?? null,
            };
            break;
          }
        }
      }

      let patientJson: unknown = null;
      if (spec.patientJson) {
        try {
          patientJson = JSON.parse(String(spec.patientJson));
        } catch {
          patientJson = null;
        }
      }

      specimenByAccession.set(accession, {
        accession_number: accession,
        barcode: String(spec.barcode ?? accession),
        registered_at: String(
          spec.registeredAt ?? spec.registered_at ?? "",
        ),
        registered_by_snapshot: spec.registeredBySnapshot ?? null,
        patient_json: patientJson,
        patients,
      });
    }

    return assembleReleaseQueueGroups(results, specimenByAccession);
  }

  async releaseResult(opts: {
    id: string;
    releasedBy: string;
    releasedBySnapshot?: import("@drax-lis/contracts").ActorSnapshot;
  }) {
    const now = new Date().toISOString();
    if (this.supabase.enabled && this.supabase.client) {
      const { data, error } = await this.supabase.client
        .from("results")
        .update({
          status: "released",
          released_by: opts.releasedBy,
          released_at: now,
          released_by_snapshot: opts.releasedBySnapshot ?? null,
          updated_at: now,
        })
        .eq("id", opts.id)
        .eq("status", "pending_authorization")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new NotFoundException(
          "Result not found or already released",
        );
      }
      return data;
    }

    const found = Array.from(this.memoryResults.entries()).find(
      ([, v]) =>
        String(v.id) === opts.id && v.status === "pending_authorization",
    );
    if (!found) {
      throw new NotFoundException("Result not found or already released");
    }
    const [key, val] = found;
    const updated = {
      ...val,
      status: "released",
      released_by: opts.releasedBy,
      released_at: now,
    };
    this.memoryResults.set(key, updated);
    return updated;
  }

  async releaseAccession(opts: {
    accessionNumber: string;
    releasedBy: string;
    releasedBySnapshot?: ActorSnapshot;
  }): Promise<ReleaseAccessionResponse> {
    const now = new Date().toISOString();
    const accession = opts.accessionNumber.trim();
    if (!accession) {
      throw new NotFoundException("Accession number required");
    }

    if (this.supabase.enabled && this.supabase.client) {
      const { data, error } = await this.supabase.client
        .from("results")
        .update({
          status: "released",
          released_by: opts.releasedBy,
          released_at: now,
          released_by_snapshot: opts.releasedBySnapshot ?? null,
          updated_at: now,
        })
        .eq("accession_number", accession)
        .eq("status", "pending_authorization")
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        throw new NotFoundException(
          "No pending results found for accession or already released",
        );
      }
      return {
        accessionNumber: accession,
        releasedCount: data.length,
        resultIds: data.map((row) => String(row.id)),
      };
    }

    const toRelease = Array.from(this.memoryResults.entries()).filter(
      ([, v]) =>
        String(v.accession_number) === accession &&
        v.status === "pending_authorization",
    );
    if (toRelease.length === 0) {
      throw new NotFoundException(
        "No pending results found for accession or already released",
      );
    }

    const resultIds: string[] = [];
    for (const [key, val] of toRelease) {
      const id = String(val.id);
      resultIds.push(id);
      this.memoryResults.set(key, {
        ...val,
        status: "released",
        released_by: opts.releasedBy,
        released_at: now,
      });
    }

    return {
      accessionNumber: accession,
      releasedCount: resultIds.length,
      resultIds,
    };
  }

  /** In-memory clinical snapshot for patient report export (no Supabase). */
  getMemoryPatientReportData(edgePatientId: string): {
    patient: PatientReportPayload["patient"];
    specimens: Array<{
      accession_number: string;
      barcode: string;
      specimen_type: string;
      registered_at: string;
      ordered_tests: Array<{ code?: string; name?: string }> | null;
    }>;
    results: Array<{
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
    }>;
  } | null {
    let patientRow: Record<string, unknown> | undefined;
    for (const row of this.memoryPatients.values()) {
      if (String(row.patientId ?? row.id) === edgePatientId) {
        patientRow = row;
        break;
      }
    }
    if (!patientRow) return null;

    const firstName = String(patientRow.firstName ?? "");
    const middleName = (patientRow.middleName as string | null) ?? null;
    const lastName = String(patientRow.lastName ?? "");
    const displayName = [firstName, middleName, lastName]
      .filter(Boolean)
      .join(" ");

    const specimens: Array<{
      accession_number: string;
      barcode: string;
      specimen_type: string;
      registered_at: string;
      ordered_tests: Array<{ code?: string; name?: string }> | null;
    }> = [];

    for (const spec of this.memorySpecimens.values()) {
      if (String(spec.patientId ?? "") !== edgePatientId) continue;
      const ordered = spec.orderedTests as
        | Array<{ code?: string; name?: string }>
        | undefined;
      specimens.push({
        accession_number: String(spec.accessionNumber ?? spec.id),
        barcode: String(spec.barcode ?? spec.accessionNumber ?? spec.id),
        specimen_type: String(spec.specimenType ?? "blood"),
        registered_at: String(spec.registeredAt ?? new Date().toISOString()),
        ordered_tests: ordered ?? null,
      });
    }

    const accessionSet = new Set(specimens.map((s) => s.accession_number));
    const results: Array<{
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
    }> = [];

    for (const row of this.memoryResults.values()) {
      if (String(row.status) !== "released") continue;
      const accession = String(row.accession_number ?? "");
      if (!accessionSet.has(accession)) continue;
      results.push({
        accession_number: accession,
        test_code: String(row.testCode ?? row.test_code ?? ""),
        test_name: (row.testName ?? row.test_name ?? null) as string | null,
        value: String(row.value ?? ""),
        units: (row.units as string | null) ?? null,
        reference_low: (row.referenceLow ?? row.reference_low ?? null) as
          | number
          | null,
        reference_high: (row.referenceHigh ?? row.reference_high ?? null) as
          | number
          | null,
        flag: String(row.flag ?? "unknown"),
        observed_at: String(
          row.observedAt ?? row.observed_at ?? new Date().toISOString(),
        ),
        released_at: (row.released_at ?? row.releasedAt ?? null) as
          | string
          | null,
      });
    }

    return {
      patient: {
        mrn: String(patientRow.mrn ?? "—"),
        displayName: displayName || "Patient",
        dateOfBirth: (patientRow.dateOfBirth as string | null) ?? null,
        sex: (patientRow.sex as string | null) ?? null,
      },
      specimens,
      results,
    };
  }
}

/** Guard helper — validate EDGE_SYNC_TOKEN when configured. */
export function assertEdgeSyncToken(authHeader?: string) {
  const expected = process.env.EDGE_SYNC_TOKEN;
  if (!expected) return; // unset = open local demo
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token || token !== expected) {
    throw new UnauthorizedException("Invalid or missing EDGE_SYNC_TOKEN");
  }
}
