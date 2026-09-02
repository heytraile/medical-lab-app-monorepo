import {
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.module";
import { CatalogService } from "../catalog/catalog.service";
import {
  DRAX_HALL_LAB,
  buildPanelsWithMembers,
  expandSelections,
  selectionsNeedFasting,
  type OrderSelection,
} from "@drax-lis/catalog";
import type {
  LabRequisition,
  RequisitionCreate,
  RequisitionLink,
  SpecimenInfo,
} from "@drax-lis/contracts";
import type { AuthUser } from "../auth/auth.guard";

type Row = {
  id: string;
  lab_id: string;
  patient_id: string | null;
  patient_snapshot: Record<string, unknown> | null;
  referring_physician: string | null;
  clinical_notes: string | null;
  specimen_info: Record<string, unknown> | null;
  ordered_selections: OrderSelection[];
  ordered_tests: Array<{ code: string; name?: string; sourcePanel?: string }>;
  status: string;
  accession_number: string | null;
  edge_specimen_id: string | null;
  created_by: string | null;
  created_at: string;
};

@Injectable()
export class LabRequisitionsService {
  private readonly logger = new Logger(LabRequisitionsService.name);
  private readonly memory = new Map<string, Row>();

  constructor(
    private readonly supabase: SupabaseService,
    private readonly catalog: CatalogService,
  ) {}

  async create(
    body: RequisitionCreate,
    user: AuthUser,
  ): Promise<LabRequisition> {
    const catalog = await this.catalog.getCatalog();
    const panels = buildPanelsWithMembers(
      catalog.panels.map((p) => ({
        code: p.code,
        name: p.name,
        description: p.description ?? undefined,
        memberCodes: p.memberCodes,
      })),
      catalog.items.map((i) => ({
        code: i.code,
        name: i.name,
        category: i.category,
        specimenHint: (i.specimenHint as "serum" | "urine" | "blood") ?? undefined,
        fastingRequired: i.fastingRequired,
      })),
    );

    const selections = body.selections as OrderSelection[];
    const expanded = expandSelections(selections, panels);
    if (!expanded.length) {
      throw new NotFoundException("No valid tests in selection");
    }

    const fastingRequired = selectionsNeedFasting(expanded, panels, selections);
    const now = new Date().toISOString();
    const createdBy = isUuid(user.id) ? user.id : null;

    const row: Omit<Row, "id"> & { id?: string } = {
      lab_id: DRAX_HALL_LAB.id,
      patient_id: body.patientId && isUuid(body.patientId) ? body.patientId : null,
      patient_snapshot: body.patientSnapshot ?? null,
      referring_physician: body.referringPhysician ?? null,
      clinical_notes: body.clinicalNotes ?? null,
      specimen_info: body.specimenInfo ?? {},
      ordered_selections: selections,
      ordered_tests: expanded.map((t) => ({
        code: t.code,
        name: t.name,
        sourcePanel: t.sourcePanel,
      })),
      status: "registered",
      accession_number: null,
      edge_specimen_id: null,
      created_by: createdBy,
      created_at: now,
    };

    if (this.supabase.enabled && this.supabase.client) {
      const { data, error } = await this.supabase.client
        .from("requisitions")
        .insert({
          lab_id: row.lab_id,
          patient_id: row.patient_id,
          patient_snapshot: row.patient_snapshot,
          referring_physician: row.referring_physician,
          clinical_notes: row.clinical_notes,
          specimen_info: row.specimen_info,
          ordered_selections: row.ordered_selections,
          ordered_tests: row.ordered_tests,
          status: row.status,
          created_by: row.created_by,
        })
        .select("*")
        .single();
      if (error) throw error;
      return toDto(data as Row, fastingRequired);
    }

    const id = randomId();
    const stored: Row = { ...row, id } as Row;
    this.memory.set(id, stored);
    return toDto(stored, fastingRequired);
  }

  async link(id: string, body: RequisitionLink): Promise<LabRequisition> {
    const now = new Date().toISOString();

    if (this.supabase.enabled && this.supabase.client) {
      const { data, error } = await this.supabase.client
        .from("requisitions")
        .update({
          accession_number: body.accessionNumber,
          edge_specimen_id: body.edgeSpecimenId,
          updated_at: now,
        })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new NotFoundException("Requisition not found");
      return toDto(data as Row);
    }

    const row = this.memory.get(id);
    if (!row) throw new NotFoundException("Requisition not found");
    const updated: Row = {
      ...row,
      accession_number: body.accessionNumber,
      edge_specimen_id: body.edgeSpecimenId,
    };
    this.memory.set(id, updated);
    return toDto(updated);
  }

  async getById(id: string): Promise<LabRequisition> {
    if (this.supabase.enabled && this.supabase.client) {
      const { data, error } = await this.supabase.client
        .from("requisitions")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new NotFoundException("Requisition not found");
      return toDto(data as Row);
    }
    const row = this.memory.get(id);
    if (!row) throw new NotFoundException("Requisition not found");
    return toDto(row);
  }

  async getByAccession(accession: string): Promise<LabRequisition | null> {
    if (this.supabase.enabled && this.supabase.client) {
      const { data, error } = await this.supabase.client
        .from("requisitions")
        .select("*")
        .eq("accession_number", accession)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? toDto(data as Row) : null;
    }
    const hit = [...this.memory.values()].find(
      (r) => r.accession_number === accession,
    );
    return hit ? toDto(hit) : null;
  }
}

function toDto(row: Row, fastingRequired?: boolean): LabRequisition {
  const expanded = row.ordered_tests ?? [];
  return {
    id: row.id,
    labId: row.lab_id,
    patientId: row.patient_id,
    patientSnapshot: row.patient_snapshot,
    referringPhysician: row.referring_physician,
    clinicalNotes: row.clinical_notes,
    specimenInfo: (row.specimen_info as SpecimenInfo | null) ?? undefined,
    orderedSelections: row.ordered_selections ?? [],
    orderedTests: expanded.map((t) => ({
      code: t.code,
      name: t.name,
    })),
    status: row.status,
    accessionNumber: row.accession_number,
    edgeSpecimenId: row.edge_specimen_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    fastingRequired:
      fastingRequired ??
      expanded.some((t) =>
        String(t.code).includes("CHOL") || String(t.code).includes("LIPID"),
      ),
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function randomId(): string {
  return globalThis.crypto.randomUUID();
}
