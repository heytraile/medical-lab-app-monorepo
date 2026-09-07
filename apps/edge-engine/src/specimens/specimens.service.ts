import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { ActorSnapshot } from "@drax-lis/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { PrinterService } from "../printer/printer.service";
import { SyncService } from "../sync/sync.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { displayName } from "../patients/patient-normalize";
import { PatientsService } from "../patients/patients.service";

type IdentityConfirmation = {
  decision: "distinct_people" | "possible_duplicate_acknowledged";
  suspectGroupId: string;
  confirmedAt?: string;
  confirmedBy?: string;
};

type CollectorInput = {
  collectedByStaffId?: string;
  collectedBy?: string;
};

type OrderSelectionInput = {
  kind: "panel" | "test";
  code: string;
};

type RegisterInput = {
  accessionNumber?: string;
  barcode?: string;
  patientId: string;
  identityConfirmation?: IdentityConfirmation;
  orderedTests?: Array<{ code: string; name?: string }>;
  selections?: OrderSelectionInput[];
  requisitionId?: string;
  printLabel?: boolean;
  copies?: number;
  specimenType?: string;
  collectedAt?: string;
} & CollectorInput;

type BatchRegisterInput = {
  patientId: string;
  identityConfirmation?: IdentityConfirmation;
  requisitionId?: string;
  printLabel?: boolean;
  copies?: number;
  collectedAt?: string;
  selections?: OrderSelectionInput[];
  specimens: Array<{
    specimenType: string;
    orderedTests: Array<{ code: string; name?: string }>;
  }>;
} & CollectorInput;

type ResolvedRegistration = {
  patient: Awaited<ReturnType<PrismaService["patient"]["findUnique"]>> & object;
  identityConfirmationJson: string | null;
  patientPayload: {
    id: string;
    mrn: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
    dateOfBirth: string | null;
    sex: string | null;
    identityOrigin: string;
    syncStatus: string;
  };
  patientName: string;
  queuePossibleDuplicate: boolean;
  suspectGroupId: string | null;
  groupPatientIds: string[];
};

type CreatedSpecimen = {
  specimen: Awaited<ReturnType<PrismaService["specimen"]["create"]>>;
  accessionNumber: string;
  barcode: string;
  orderedTests: Array<{ code: string; name?: string }>;
};

@Injectable()
export class SpecimensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly printer: PrinterService,
    private readonly sync: SyncService,
    private readonly realtime: RealtimeGateway,
    private readonly patients: PatientsService,
  ) {}

  list(opts?: { q?: string }) {
    return this.listEnriched(opts);
  }

  findByAccession(accessionNumber: string) {
    return this.prisma.specimen
      .findUnique({
        where: { accessionNumber },
      })
      .then((row) => (row ? this.toListItem(row) : null));
  }

  private async listEnriched(opts?: { q?: string }) {
    const q = opts?.q?.trim().toLowerCase();
    const rows = await this.prisma.specimen.findMany({
      orderBy: { registeredAt: "desc" },
      take: q ? 400 : 200,
    });
    const mapped = rows.map((row) => this.toListItem(row));
    if (!q) return mapped;
    return mapped.filter((row) => this.matchesQuery(row, q)).slice(0, 200);
  }

  private matchesQuery(
    row: ReturnType<SpecimensService["toListItem"]>,
    q: string,
  ): boolean {
    if (row.accessionNumber.toLowerCase().includes(q)) return true;
    if (row.barcode.toLowerCase().includes(q)) return true;
    if (row.patientDisplayName.toLowerCase().includes(q)) return true;
    if (row.patientMrn?.toLowerCase().includes(q)) return true;
    try {
      const p = row.patientJson
        ? (JSON.parse(row.patientJson) as {
            firstName?: string;
            lastName?: string;
            middleName?: string;
          })
        : null;
      if (p?.firstName?.toLowerCase().includes(q)) return true;
      if (p?.lastName?.toLowerCase().includes(q)) return true;
      if (p?.middleName?.toLowerCase().includes(q)) return true;
    } catch {
      /* ignore */
    }
    return false;
  }

  private toListItem(row: {
    id: string;
    accessionNumber: string;
    barcode: string;
    patientId: string | null;
    patientJson: string | null;
    identityConfirmationJson: string | null;
    specimenType: string;
    orderedTestsJson: string;
    requisitionId: string | null;
    registrationBatchId: string | null;
    orderedSelectionsJson?: string | null;
    status: string;
    collectedAt: Date | null;
    collectedByStaffId: string | null;
    collectedBySnapshot: string | null;
    registeredAt: Date;
    registeredBy: string | null;
    registeredBySnapshot: string | null;
  }) {
    let patientDisplayName = "—";
    let patientMrn: string | null = null;
    let orderedTests: Array<{ code: string; name?: string }> = [];
    try {
      if (row.patientJson) {
        const p = JSON.parse(row.patientJson) as {
          firstName?: string;
          middleName?: string | null;
          lastName?: string;
          mrn?: string;
        };
        const name = [p.firstName, p.middleName, p.lastName]
          .filter((part) => Boolean(part && String(part).trim()))
          .join(" ");
        patientDisplayName = name || p.mrn?.trim() || "—";
        patientMrn = p.mrn?.trim() || null;
      }
    } catch {
      /* ignore */
    }
    try {
      const parsed = JSON.parse(row.orderedTestsJson) as Array<{
        code?: string;
        name?: string;
      }>;
      orderedTests = parsed
        .filter((t) => Boolean(t?.code))
        .map((t) => ({
          code: String(t.code),
          name: t.name?.trim() || undefined,
        }));
    } catch {
      orderedTests = [];
    }

    let orderedSelections: OrderSelectionInput[] = [];
    try {
      const parsed = JSON.parse(row.orderedSelectionsJson || "[]") as Array<{
        kind?: string;
        code?: string;
      }>;
      orderedSelections = parsed
        .filter(
          (s) =>
            (s.kind === "panel" || s.kind === "test") && Boolean(s.code?.trim()),
        )
        .map((s) => ({
          kind: s.kind as "panel" | "test",
          code: String(s.code).trim(),
        }));
    } catch {
      orderedSelections = [];
    }

    let registeredByName: string | null = null;
    if (row.registeredBySnapshot) {
      try {
        const actor = JSON.parse(row.registeredBySnapshot) as {
          fullName?: string | null;
          email?: string | null;
          userId?: string;
        };
        registeredByName =
          actor.fullName?.trim() ||
          actor.email?.trim() ||
          actor.userId?.trim() ||
          null;
      } catch {
        registeredByName = null;
      }
    }

    let collectedByName: string | null = null;
    if (row.collectedBySnapshot) {
      try {
        const collector = JSON.parse(row.collectedBySnapshot) as {
          fullName?: string | null;
          staffId?: string;
        };
        collectedByName =
          collector.fullName?.trim() || collector.staffId?.trim() || null;
      } catch {
        collectedByName = null;
      }
    }

    return {
      id: row.id,
      accessionNumber: row.accessionNumber,
      barcode: row.barcode,
      patientId: row.patientId,
      patientJson: row.patientJson,
      identityConfirmationJson: row.identityConfirmationJson,
      specimenType: row.specimenType,
      orderedTestsJson: row.orderedTestsJson,
      orderedTests,
      orderedSelections,
      requisitionId: row.requisitionId,
      registrationBatchId: row.registrationBatchId,
      status: row.status,
      collectedAt: row.collectedAt?.toISOString() ?? null,
      collectedByStaffId: row.collectedByStaffId,
      collectedBySnapshot: row.collectedBySnapshot,
      collectedByName,
      registeredAt: row.registeredAt.toISOString(),
      registeredBy: row.registeredBy,
      registeredBySnapshot: row.registeredBySnapshot,
      registeredByName,
      patientDisplayName,
      patientMrn,
    };
  }

  private normalizeSelections(
    selections: OrderSelectionInput[] | undefined,
  ): OrderSelectionInput[] {
    if (!selections?.length) return [];
    const seen = new Set<string>();
    const out: OrderSelectionInput[] = [];
    for (const sel of selections) {
      if (sel.kind !== "panel" && sel.kind !== "test") continue;
      const code = sel.code?.trim();
      if (!code) continue;
      const key = `${sel.kind}:${code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: sel.kind, code });
    }
    return out;
  }

  private collectorSnapshot(input: CollectorInput): string | null {
    const staffId = input.collectedByStaffId?.trim();
    const fullName = input.collectedBy?.trim();
    if (!staffId && !fullName) return null;
    return JSON.stringify({
      staffId: staffId || undefined,
      fullName: fullName || undefined,
    });
  }

  async register(
    input: RegisterInput,
    actor: ActorSnapshot | null = null,
  ) {
    const resolved = await this.resolveRegistration(input);
    const orderedTests = input.orderedTests ?? [];

    const accessionNumber =
      input.accessionNumber ?? (await this.nextAccessionNumber());
    const barcode = input.barcode ?? accessionNumber;
    const registrationBatchId = randomUUID();
    const collectedBySnapshot = this.collectorSnapshot(input);
    const orderedSelections = this.normalizeSelections(input.selections);

    const specimen = await this.prisma.specimen.create({
      data: this.specimenCreateData({
        accessionNumber,
        barcode,
        patientId: resolved.patient.id,
        patientPayload: resolved.patientPayload,
        identityConfirmationJson: resolved.identityConfirmationJson,
        orderedTests,
        orderedSelections,
        requisitionId: input.requisitionId,
        registrationBatchId,
        specimenType: input.specimenType,
        collectedAt: input.collectedAt,
        collectedByStaffId: input.collectedByStaffId?.trim() || null,
        collectedBySnapshot,
        actor,
      }),
    });

    const { labelPreview, printResult } = await this.finalizeSpecimen({
      specimen,
      accessionNumber,
      barcode,
      patient: resolved.patient,
      patientName: resolved.patientName,
      patientPayload: resolved.patientPayload,
      orderedTests,
      identityConfirmationJson: resolved.identityConfirmationJson,
      printLabel: input.printLabel,
      copies: input.copies,
      actor,
    });

    await this.maybeQueueIdentityReview(resolved, accessionNumber, actor);

    return { specimen, printResult, labelPreview };
  }

  async registerBatch(
    input: BatchRegisterInput,
    actor: ActorSnapshot | null = null,
  ) {
    if (!input.specimens?.length) {
      throw new BadRequestException("At least one specimen is required");
    }

    const resolved = await this.resolveRegistration(input);
    const registrationBatchId = randomUUID();
    const collectedBySnapshot = this.collectorSnapshot(input);
    const collectedByStaffId = input.collectedByStaffId?.trim() || null;
    const orderedSelections = this.normalizeSelections(input.selections);

    const created = await this.prisma.$transaction(async (tx) => {
      const results: CreatedSpecimen[] = [];
      for (const group of input.specimens) {
        const orderedTests = group.orderedTests ?? [];
        if (!orderedTests.length) {
          throw new BadRequestException(
            "Each specimen must include at least one ordered test",
          );
        }
        const accessionNumber = await this.nextAccessionNumber(tx);
        const barcode = accessionNumber;
        const specimen = await tx.specimen.create({
          data: this.specimenCreateData({
            accessionNumber,
            barcode,
            patientId: resolved.patient.id,
            patientPayload: resolved.patientPayload,
            identityConfirmationJson: resolved.identityConfirmationJson,
            orderedTests,
            orderedSelections,
            requisitionId: input.requisitionId,
            registrationBatchId,
            specimenType: group.specimenType,
            collectedAt: input.collectedAt,
            collectedByStaffId,
            collectedBySnapshot,
            actor,
          }),
        });
        results.push({ specimen, accessionNumber, barcode, orderedTests });
      }
      return results;
    });

    const specimens = [];
    const labelPreviews: ReturnType<
      PrinterService["buildSpecimenLabel"]
    >["fields"][] = [];
    const printResults: Array<
      | {
          ok: boolean;
          error?: string;
          zpl?: string;
          copies?: number;
          fields?: ReturnType<PrinterService["buildSpecimenLabel"]>["fields"];
        }
      | undefined
    > = [];

    for (const item of created) {
      const finalized = await this.finalizeSpecimen({
        specimen: item.specimen,
        accessionNumber: item.accessionNumber,
        barcode: item.barcode,
        patient: resolved.patient,
        patientName: resolved.patientName,
        patientPayload: resolved.patientPayload,
        orderedTests: item.orderedTests,
        identityConfirmationJson: resolved.identityConfirmationJson,
        printLabel: input.printLabel,
        copies: input.copies,
        actor,
      });
      specimens.push(item.specimen);
      labelPreviews.push(finalized.labelPreview);
      printResults.push(finalized.printResult);
    }

    await this.maybeQueueIdentityReview(
      resolved,
      created[0]?.accessionNumber ?? "",
      actor,
    );

    return { specimens, labelPreviews, printResults };
  }

  private specimenCreateData(args: {
    accessionNumber: string;
    barcode: string;
    patientId: string;
    patientPayload: ResolvedRegistration["patientPayload"];
    identityConfirmationJson: string | null;
    orderedTests: Array<{ code: string; name?: string }>;
    orderedSelections: OrderSelectionInput[];
    requisitionId?: string;
    registrationBatchId: string;
    specimenType?: string;
    collectedAt?: string;
    collectedByStaffId: string | null;
    collectedBySnapshot: string | null;
    actor: ActorSnapshot | null;
  }) {
    return {
      accessionNumber: args.accessionNumber,
      barcode: args.barcode,
      patientId: args.patientId,
      patientJson: JSON.stringify(args.patientPayload),
      identityConfirmationJson: args.identityConfirmationJson,
      orderedTestsJson: JSON.stringify(args.orderedTests),
      orderedSelectionsJson: JSON.stringify(args.orderedSelections),
      requisitionId: args.requisitionId?.trim() || null,
      registrationBatchId: args.registrationBatchId,
      specimenType: args.specimenType?.trim() || "blood",
      collectedAt: args.collectedAt ? new Date(args.collectedAt) : null,
      collectedByStaffId: args.collectedByStaffId,
      collectedBySnapshot: args.collectedBySnapshot,
      status: "registered" as const,
      registeredBy: args.actor?.userId ?? null,
      registeredBySnapshot: args.actor ? JSON.stringify(args.actor) : null,
    };
  }

  private async resolveRegistration(input: {
    patientId: string;
    identityConfirmation?: IdentityConfirmation;
  }): Promise<ResolvedRegistration> {
    const patientId = input.patientId?.trim();
    if (!patientId) {
      throw new BadRequestException(
        "patientId is required — create or select a patient first",
      );
    }

    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient) {
      throw new NotFoundException(`Patient ${patientId} not found`);
    }
    if (patient.status !== "active") {
      throw new BadRequestException(
        `Patient ${patient.mrn} is ${patient.status} and cannot be used for registration`,
      );
    }

    const siblings = patient.suspectGroupId
      ? await this.prisma.patient.findMany({
          where: {
            suspectGroupId: patient.suspectGroupId,
            status: "active",
            id: { not: patient.id },
          },
        })
      : [];

    const requiresConfirmation =
      Boolean(patient.suspectGroupId) && siblings.length >= 1;

    let identityConfirmationJson: string | null = null;
    let queuePossibleDuplicate = false;
    if (requiresConfirmation) {
      const conf = input.identityConfirmation;
      if (
        !conf ||
        conf.suspectGroupId !== patient.suspectGroupId ||
        (conf.decision !== "distinct_people" &&
          conf.decision !== "possible_duplicate_acknowledged")
      ) {
        throw new ConflictException({
          statusCode: 409,
          error: "IDENTITY_CONFIRMATION_REQUIRED",
          message:
            "This patient shares demographics with other MRNs. Confirm identity before registering.",
          patient: {
            id: patient.id,
            mrn: patient.mrn,
            displayName: displayName(patient),
            dateOfBirth: patient.dateOfBirth,
            sex: patient.sex,
            suspectGroupId: patient.suspectGroupId,
          },
          siblings: siblings.map((s) => ({
            id: s.id,
            mrn: s.mrn,
            displayName: displayName(s),
            dateOfBirth: s.dateOfBirth,
            sex: s.sex,
          })),
        });
      }
      queuePossibleDuplicate =
        conf.decision === "possible_duplicate_acknowledged";
      identityConfirmationJson = JSON.stringify({
        ...conf,
        confirmedAt: conf.confirmedAt ?? new Date().toISOString(),
        patientId: patient.id,
        patientMrn: patient.mrn,
      });
    }

    const patientPayload = {
      id: patient.id,
      mrn: patient.mrn,
      firstName: patient.firstName,
      middleName: patient.middleName,
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth,
      sex: patient.sex,
      identityOrigin: patient.identityOrigin,
      syncStatus: patient.syncStatus,
    };

    return {
      patient,
      identityConfirmationJson,
      patientPayload,
      patientName: displayName(patient),
      queuePossibleDuplicate,
      suspectGroupId: patient.suspectGroupId,
      groupPatientIds: [patient.id, ...siblings.map((s) => s.id)],
    };
  }

  private async maybeQueueIdentityReview(
    resolved: ResolvedRegistration,
    accessionNumber: string,
    actor: ActorSnapshot | null,
  ) {
    if (
      !resolved.queuePossibleDuplicate ||
      !resolved.suspectGroupId ||
      resolved.groupPatientIds.length < 2
    ) {
      return;
    }
    await this.patients.upsertPendingIdentityReview({
      suspectGroupId: resolved.suspectGroupId,
      patientIds: resolved.groupPatientIds,
      preferredSurvivorPatientId: resolved.patient.id,
      flaggedFromAccessionNumber: accessionNumber,
      actor,
    });
  }

  private async finalizeSpecimen(args: {
    specimen: Awaited<ReturnType<PrismaService["specimen"]["create"]>>;
    accessionNumber: string;
    barcode: string;
    patient: ResolvedRegistration["patient"];
    patientName: string;
    patientPayload: ResolvedRegistration["patientPayload"];
    orderedTests: Array<{ code: string; name?: string }>;
    identityConfirmationJson: string | null;
    printLabel?: boolean;
    copies?: number;
    actor: ActorSnapshot | null;
  }) {
    const {
      specimen,
      accessionNumber,
      barcode,
      patient,
      patientName,
      patientPayload,
      orderedTests,
      identityConfirmationJson,
      printLabel,
      copies,
      actor,
    } = args;

    await this.sync.enqueue({
      type: "specimen.registered",
      payload: {
        accessionNumber,
        barcode,
        patientId: patient.id,
        patientName,
        patient: patientPayload,
        specimenType: specimen.specimenType,
        orderedTests,
        requisitionId: specimen.requisitionId,
        registrationBatchId: specimen.registrationBatchId,
        orderedSelections: (() => {
          try {
            const raw = (specimen as { orderedSelectionsJson?: string | null })
              .orderedSelectionsJson;
            return JSON.parse(raw || "[]");
          } catch {
            return [];
          }
        })(),
        collectedAt: specimen.collectedAt?.toISOString() ?? null,
        collectedByStaffId: specimen.collectedByStaffId,
        collectedBySnapshot: specimen.collectedBySnapshot
          ? JSON.parse(specimen.collectedBySnapshot)
          : null,
        identityConfirmation: identityConfirmationJson
          ? JSON.parse(identityConfirmationJson)
          : null,
        registeredBy: actor?.userId ?? null,
        registeredBySnapshot: actor ?? null,
      },
    });

    const labelPayload = {
      accessionNumber,
      patientName,
      barcode,
      dateOfBirth: patient.dateOfBirth,
      orderedTests: orderedTests.map((t) => t.code),
      specimenType: specimen.specimenType,
      mrn: patient.mrn,
    };
    const built = this.printer.buildSpecimenLabel(labelPayload);
    const labelPreview = built.fields;

    let printResult:
      | {
          ok: boolean;
          error?: string;
          zpl?: string;
          copies?: number;
          fields?: typeof built.fields;
        }
      | undefined;

    if (printLabel !== false) {
      const sent = await this.printer.printZpl(built.zpl, copies);
      printResult = { ...sent, zpl: built.zpl, fields: built.fields };
    }

    this.realtime.emitBenchEvent({
      type: "specimen.registered",
      accessionNumber,
      barcode,
      patientName,
      at: new Date().toISOString(),
    });

    return { labelPreview, printResult };
  }

  /** DH{YYYYMMDD}{####} with atomic per-day counter. */
  private async nextAccessionNumber(
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<string> {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const meta = await client.syncMeta.findUnique({
      where: { id: "singleton" },
    });
    if (!meta) {
      throw new BadRequestException("SyncMeta singleton missing");
    }

    let seq: number;
    if (meta.accessionDay === day) {
      const updated = await client.syncMeta.update({
        where: { id: "singleton" },
        data: { accessionSeq: { increment: 1 } },
      });
      seq = updated.accessionSeq;
    } else {
      const updated = await client.syncMeta.update({
        where: { id: "singleton" },
        data: { accessionDay: day, accessionSeq: 1 },
      });
      seq = updated.accessionSeq;
    }

    return `DH${day}${String(seq).padStart(4, "0")}`;
  }
}
