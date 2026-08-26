import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.module";
import type { SyncEventsRequest, SyncEventsResponse } from "@drax-lis/contracts";

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

  constructor(private readonly supabase: SupabaseService) {}

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
          await this.projectEvent(event.type, event.payload);
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
    }
  }

  private async projectEvent(type: string, payload: Record<string, unknown>) {
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

      let patientUuid: string | null = null;
      const edgePatientId = payload.patientId
        ? String(payload.patientId)
        : null;
      const patient = payload.patient as Record<string, unknown> | undefined;

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
          patient_json: patient ?? { patientName: payload.patientName },
          ordered_tests: payload.orderedTests ?? [],
          specimen_type: String(payload.specimenType ?? "blood"),
          status: "registered",
          identity_confirmation: payload.identityConfirmation ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "accession_number" },
      );
      if (error) throw error;
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

  async releaseResult(opts: {
    id: string;
    releasedBy: string;
  }) {
    const now = new Date().toISOString();
    if (this.supabase.enabled && this.supabase.client) {
      const { data, error } = await this.supabase.client
        .from("results")
        .update({
          status: "released",
          released_by: opts.releasedBy,
          released_at: now,
          updated_at: now,
        })
        .eq("id", opts.id)
        .eq("status", "pending_review")
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
      ([, v]) => String(v.id) === opts.id && v.status === "pending_review",
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
