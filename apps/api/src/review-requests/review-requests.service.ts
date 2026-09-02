import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.module";
import { NotifierService } from "../notifications/notifier.service";
import type { ReviewRequest, ReviewRequestCreate } from "@drax-lis/contracts";
import type { AuthUser } from "../auth/auth.guard";

type Row = {
  id: string;
  accession_numbers: string[];
  patient_display_name: string | null;
  patient_mrn: string | null;
  worst_flag: string | null;
  test_codes: string[];
  result_count: number;
  note: string | null;
  requested_by: string | null;
  requested_by_email: string | null;
  requested_at: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
};

function toDto(row: Row): ReviewRequest {
  return {
    id: row.id,
    accessionNumbers: row.accession_numbers ?? [],
    patientDisplayName: row.patient_display_name,
    patientMrn: row.patient_mrn,
    worstFlag: row.worst_flag,
    testCodes: row.test_codes ?? [],
    resultCount: row.result_count ?? 0,
    note: row.note,
    requestedBy: row.requested_by,
    requestedByEmail: row.requested_by_email,
    requestedAt: row.requested_at,
    acknowledgedBy: row.acknowledged_by,
    acknowledgedAt: row.acknowledged_at,
  };
}

@Injectable()
export class ReviewRequestsService {
  private readonly logger = new Logger(ReviewRequestsService.name);
  /** Fallback store for local dev, where Supabase is unset. */
  private readonly memory = new Map<string, Row>();

  constructor(
    private readonly supabase: SupabaseService,
    private readonly notifier: NotifierService,
  ) {}

  async create(
    body: ReviewRequestCreate,
    user: AuthUser,
  ): Promise<ReviewRequest> {
    const now = new Date().toISOString();
    // The dev auth guard synthesises ids like "dev-tech", which are not UUIDs
    // and would be rejected by the column type.
    const requestedBy = isUuid(user.id) ? user.id : null;

    let created: ReviewRequest;

    if (this.supabase.enabled && this.supabase.client) {
      const { data, error } = await this.supabase.client
        .from("review_requests")
        .insert({
          accession_numbers: body.accessionNumbers,
          patient_display_name: body.patientDisplayName ?? null,
          patient_mrn: body.patientMrn ?? null,
          worst_flag: body.worstFlag ?? null,
          test_codes: body.testCodes,
          result_count: body.resultCount,
          note: body.note ?? null,
          requested_by: requestedBy,
          requested_by_email: user.email ?? null,
          requested_at: now,
        })
        .select("*")
        .single();
      if (error) throw error;
      created = toDto(data as Row);
    } else {
      const row: Row = {
        id: randomId(),
        accession_numbers: body.accessionNumbers,
        patient_display_name: body.patientDisplayName ?? null,
        patient_mrn: body.patientMrn ?? null,
        worst_flag: body.worstFlag ?? null,
        test_codes: body.testCodes,
        result_count: body.resultCount,
        note: body.note ?? null,
        requested_by: user.id,
        requested_by_email: user.email ?? null,
        requested_at: now,
        acknowledged_by: null,
        acknowledged_at: null,
      };
      this.memory.set(row.id, row);
      created = toDto(row);
    }

    // Alerting must not fail the request: the in-app notification is already
    // durable at this point and the tech should not be told the ping failed.
    try {
      await this.notifier.notifyReviewRequest(created);
    } catch (err) {
      this.logger.error(
        `Review request ${created.id} stored but alert failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return created;
  }

  async list(opts: { open?: boolean; user: AuthUser }): Promise<ReviewRequest[]> {
    // An authorizer needs the whole inbox; a tech only needs to see whether
    // their own ping was picked up.
    const isReviewer = opts.user.role === "authorizer" || opts.user.role === "admin";

    if (this.supabase.enabled && this.supabase.client) {
      let query = this.supabase.client
        .from("review_requests")
        .select("*")
        .order("requested_at", { ascending: false })
        .limit(100);
      if (opts.open) query = query.is("acknowledged_at", null);
      if (!isReviewer && isUuid(opts.user.id)) {
        query = query.eq("requested_by", opts.user.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => toDto(row as Row));
    }

    return Array.from(this.memory.values())
      .filter((row) => (opts.open ? !row.acknowledged_at : true))
      .filter((row) => (isReviewer ? true : row.requested_by === opts.user.id))
      .sort((a, b) => b.requested_at.localeCompare(a.requested_at))
      .map(toDto);
  }

  async acknowledge(id: string, user: AuthUser): Promise<ReviewRequest> {
    const now = new Date().toISOString();
    const acknowledgedBy = isUuid(user.id) ? user.id : null;

    if (this.supabase.enabled && this.supabase.client) {
      const { data, error } = await this.supabase.client
        .from("review_requests")
        .update({ acknowledged_by: acknowledgedBy, acknowledged_at: now })
        .eq("id", id)
        .is("acknowledged_at", null)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new NotFoundException(
          "Review request not found or already acknowledged",
        );
      }
      return toDto(data as Row);
    }

    const row = this.memory.get(id);
    if (!row || row.acknowledged_at) {
      throw new NotFoundException(
        "Review request not found or already acknowledged",
      );
    }
    const updated: Row = {
      ...row,
      acknowledged_by: user.id,
      acknowledged_at: now,
    };
    this.memory.set(id, updated);
    return toDto(updated);
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function randomId(): string {
  return globalThis.crypto.randomUUID();
}
