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
import {
  DRAX_HALL_ROUTING_POLICY,
  groupSpecimensForLabelPrint,
  isSimilarOrder,
  orderedCodesFromTests,
  resolveRoutingForScope,
  type LabRoutingSettings,
} from "@drax-lis/catalog";
import { formatSpecimenNumber } from "./specimen-number";
import { AuditService } from "../audit/audit.service";

type IdentityConfirmation = {
  decision: "distinct_people" | "possible_duplicate_acknowledged";
  suspectGroupId: string;
  confirmedAt?: string;
  confirmedBy?: string;
};

type CollectorInput = {
  collectedByStaffId?: string;
  collectedBy?: string;
  collectedByJobTitle?: string;
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
  acknowledgeSimilarAccession?: boolean;
} & CollectorInput;

type BatchRegisterInput = {
  patientId: string;
  identityConfirmation?: IdentityConfirmation;
  requisitionId?: string;
  printLabel?: boolean;
  copies?: number;
  collectedAt?: string;
  selections?: OrderSelectionInput[];
  acknowledgeSimilarAccession?: boolean;
  specimens: Array<{
    departmentKey?: string;
    departmentLabel?: string;
    collectionType?: string;
    specimenType?: string;
    orderedTests: Array<{ code: string; name?: string }>;
  }>;
  labelRouting?: LabRoutingSettings;
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
  specimenNumber: string;
  barcode: string;
  orderedTests: Array<{ code: string; name?: string }>;
  departmentLabel: string;
  collectionType: string;
};

@Injectable()
export class SpecimensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly printer: PrinterService,
    private readonly sync: SyncService,
    private readonly realtime: RealtimeGateway,
    private readonly patients: PatientsService,
    private readonly audit: AuditService,
  ) {}

  list(opts?: { q?: string }) {
    return this.listEnriched(opts);
  }

  async findByAccession(accessionNumber: string) {
    const accession = await this.prisma.accession.findUnique({
      where: { accessionNumber },
      include: {
        specimens: { orderBy: [{ departmentKey: "asc" }, { tubeSequence: "asc" }] },
      },
    });
    if (!accession) return null;
    return this.toAccessionListItem(accession);
  }

  async findByBarcode(barcode: string) {
    const trimmed = barcode.trim();
    if (!trimmed) return null;

    const specimen = await this.prisma.specimen.findFirst({
      where: {
        OR: [{ barcode: trimmed }, { specimenNumber: trimmed }],
      },
      include: {
        accession: {
          include: {
            specimens: {
              orderBy: [{ departmentKey: "asc" }, { tubeSequence: "asc" }],
            },
          },
        },
      },
    });
    if (specimen?.accession) {
      return {
        ...this.toAccessionListItem(specimen.accession),
        matchedSpecimenId: specimen.id,
        matchedSpecimenNumber: specimen.specimenNumber ?? specimen.barcode,
      };
    }

    return this.findByAccession(trimmed);
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
    if (row.specimenNumber?.toLowerCase().includes(q)) return true;
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

  private toAccessionListItem(accession: {
    id: string;
    accessionNumber: string;
    patientId: string | null;
    patientJson: string | null;
    identityConfirmationJson: string | null;
    orderedTestsJson: string;
    orderedSelectionsJson: string;
    requisitionId: string | null;
    status: string;
    collectedAt: Date | null;
    collectedByStaffId: string | null;
    collectedBySnapshot: string | null;
    registeredAt: Date;
    registeredBy: string | null;
    registeredBySnapshot: string | null;
    specimens: Array<{
      id: string;
      specimenNumber: string | null;
      tubeSequence: number;
      barcode: string;
      departmentKey: string;
      departmentLabel: string;
      collectionType: string;
      specimenType: string;
      orderedTestsJson: string;
      registrationBatchId: string | null;
    }>;
  }) {
    const primary = accession.specimens[0];
    return {
      ...this.toListItem({
        id: primary?.id ?? accession.id,
        accessionId: accession.id,
        accessionNumber: accession.accessionNumber,
        barcode: primary?.barcode ?? accession.accessionNumber,
        patientId: accession.patientId,
        patientJson: accession.patientJson,
        identityConfirmationJson: accession.identityConfirmationJson,
        departmentKey: primary?.departmentKey ?? "general",
        departmentLabel: primary?.departmentLabel ?? "General",
        collectionType: primary?.collectionType ?? "blood",
        specimenType: primary?.specimenType ?? "blood",
        orderedTestsJson: accession.orderedTestsJson,
        requisitionId: accession.requisitionId,
        registrationBatchId: primary?.registrationBatchId ?? null,
        orderedSelectionsJson: accession.orderedSelectionsJson,
        status: accession.status,
        collectedAt: accession.collectedAt,
        collectedByStaffId: accession.collectedByStaffId,
        collectedBySnapshot: accession.collectedBySnapshot,
        registeredAt: accession.registeredAt,
        registeredBy: accession.registeredBy,
        registeredBySnapshot: accession.registeredBySnapshot,
      }),
      containerCount: accession.specimens.length,
      containers: accession.specimens.map((s) => ({
        id: s.id,
        specimenNumber: s.specimenNumber ?? s.barcode,
        tubeSequence: s.tubeSequence,
        departmentKey: s.departmentKey,
        departmentLabel: s.departmentLabel,
        collectionType: s.collectionType,
        specimenType: s.specimenType,
        barcode: s.barcode,
        orderedTestsJson: s.orderedTestsJson,
      })),
    };
  }

  private toListItem(row: {
    id: string;
    accessionId?: string;
    accessionNumber: string;
    specimenNumber?: string | null;
    tubeSequence?: number;
    barcode: string;
    patientId: string | null;
    patientJson: string | null;
    identityConfirmationJson: string | null;
    departmentKey?: string;
    departmentLabel?: string;
    collectionType?: string;
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

    const specimenNumber =
      row.specimenNumber?.trim() ||
      formatSpecimenNumber(row.accessionNumber, row.tubeSequence ?? 1);

    return {
      id: row.id,
      accessionId: row.accessionId,
      accessionNumber: row.accessionNumber,
      specimenNumber,
      tubeSequence: row.tubeSequence ?? 1,
      barcode: row.barcode,
      patientId: row.patientId,
      patientJson: row.patientJson,
      identityConfirmationJson: row.identityConfirmationJson,
      departmentKey: row.departmentKey,
      departmentLabel: row.departmentLabel,
      collectionType: row.collectionType ?? row.specimenType,
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
    const jobTitle = input.collectedByJobTitle?.trim();
    if (!staffId && !fullName) return null;
    return JSON.stringify({
      staffId: staffId || undefined,
      fullName: fullName || undefined,
      jobTitle: jobTitle || undefined,
    });
  }

  async register(
    input: RegisterInput,
    actor: ActorSnapshot | null = null,
  ) {
    const resolved = await this.resolveRegistration(input);
    const orderedTests = input.orderedTests ?? [];
    const collectionType = input.specimenType?.trim() || "blood";
    await this.assertRequisitionUnused(input.requisitionId);
    await this.assertNoSimilarAccession({
      patientId: resolved.patient.id,
      orderedTests,
      acknowledge: input.acknowledgeSimilarAccession,
      actor,
    });

    this.assertAccessionNumberAllowed(input.accessionNumber);
    const registrationBatchId = randomUUID();
    const collectedBySnapshot = this.collectorSnapshot(input);
    const orderedSelections = this.normalizeSelections(input.selections);

    const { accession, specimen, accessionNumber, barcode } =
      await this.prisma.$transaction(async (tx) => {
        const accessionNumber =
          input.accessionNumber ?? (await this.nextAccessionNumber(tx));
        const specimenNumber = formatSpecimenNumber(accessionNumber, 1);
        const barcode = input.barcode ?? specimenNumber;
        const accession = await tx.accession.create({
          data: this.accessionCreateData({
            accessionNumber,
            patientId: resolved.patient.id,
            patientPayload: resolved.patientPayload,
            identityConfirmationJson: resolved.identityConfirmationJson,
            orderedTests,
            orderedSelections,
            requisitionId: input.requisitionId,
            collectedAt: input.collectedAt,
            collectedByStaffId: input.collectedByStaffId?.trim() || null,
            collectedBySnapshot,
            actor,
          }),
        });
        const specimen = await tx.specimen.create({
          data: this.specimenCreateData({
            accessionId: accession.id,
            accessionNumber,
            specimenNumber,
            tubeSequence: 1,
            barcode,
            patientId: resolved.patient.id,
            patientPayload: resolved.patientPayload,
            identityConfirmationJson: resolved.identityConfirmationJson,
            departmentKey: "general",
            departmentLabel: "General",
            collectionType,
            orderedTests,
            orderedSelections,
            requisitionId: input.requisitionId,
            registrationBatchId,
            collectedAt: input.collectedAt,
            collectedByStaffId: input.collectedByStaffId?.trim() || null,
            collectedBySnapshot,
            actor,
          }),
        });
        return { accession, specimen, accessionNumber, barcode };
      });

    const { labelPreview, printResult } = await this.finalizeContainer({
      accession,
      specimen,
      patient: resolved.patient,
      patientName: resolved.patientName,
      patientPayload: resolved.patientPayload,
      orderedTests,
      departmentKey: "general",
      departmentLabel: "General",
      collectionType,
      identityConfirmationJson: resolved.identityConfirmationJson,
      printLabel: input.printLabel,
      copies: input.copies,
      actor,
      syncAccession: true,
      allOrderedTests: orderedTests,
      containers: [
        {
          departmentKey: "general",
          departmentLabel: "General",
          collectionType,
          orderedTests,
          barcode,
          specimenNumber: specimen.specimenNumber ?? barcode,
          specimenId: specimen.id,
        },
      ],
    });

    await this.logIdentityDecision(
      resolved,
      accessionNumber,
      actor,
    );
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

    const allOrderedTests = this.mergeOrderedTests(
      input.specimens.map((g) => g.orderedTests ?? []),
    );
    await this.assertRequisitionUnused(input.requisitionId);
    await this.assertNoSimilarAccession({
      patientId: resolved.patient.id,
      orderedTests: allOrderedTests,
      acknowledge: input.acknowledgeSimilarAccession,
      actor,
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const accessionNumber = await this.nextAccessionNumber(tx);
      const accession = await tx.accession.create({
        data: this.accessionCreateData({
          accessionNumber,
          patientId: resolved.patient.id,
          patientPayload: resolved.patientPayload,
          identityConfirmationJson: resolved.identityConfirmationJson,
          orderedTests: allOrderedTests,
          orderedSelections,
          requisitionId: input.requisitionId,
          collectedAt: input.collectedAt,
          collectedByStaffId,
          collectedBySnapshot,
          actor,
        }),
      });

      const results: CreatedSpecimen[] = [];
      for (let i = 0; i < input.specimens.length; i++) {
        const group = input.specimens[i]!;
        const orderedTests = group.orderedTests ?? [];
        if (!orderedTests.length) {
          throw new BadRequestException(
            "Each specimen must include at least one ordered test",
          );
        }
        const routing = this.normalizeRoutingGroup(group);
        const specimenNumber = formatSpecimenNumber(accessionNumber, i + 1);
        const barcode = specimenNumber;
        const specimen = await tx.specimen.create({
          data: this.specimenCreateData({
            accessionId: accession.id,
            accessionNumber,
            specimenNumber,
            tubeSequence: 1,
            barcode,
            patientId: resolved.patient.id,
            patientPayload: resolved.patientPayload,
            identityConfirmationJson: resolved.identityConfirmationJson,
            departmentKey: routing.departmentKey,
            departmentLabel: routing.departmentLabel,
            collectionType: routing.collectionType,
            orderedTests,
            orderedSelections,
            requisitionId: input.requisitionId,
            registrationBatchId,
            collectedAt: input.collectedAt,
            collectedByStaffId,
            collectedBySnapshot,
            actor,
          }),
        });
        results.push({
          specimen,
          accessionNumber,
          specimenNumber,
          barcode,
          orderedTests,
          departmentLabel: routing.departmentLabel,
          collectionType: routing.collectionType,
        });
      }
      return { accession, results, accessionNumber };
    });

    const specimens = created.results.map((item) => item.specimen);

    const containerPayload = created.results.map((item) => ({
      departmentKey: item.specimen.departmentKey,
      departmentLabel: item.departmentLabel,
      collectionType: item.collectionType,
      orderedTests: item.orderedTests,
      barcode: item.barcode,
      specimenNumber: item.specimenNumber,
      specimenId: item.specimen.id,
    }));

    await this.finalizeContainer({
      accession: created.accession,
      specimen: created.results[0]!.specimen,
      patient: resolved.patient,
      patientName: resolved.patientName,
      patientPayload: resolved.patientPayload,
      orderedTests: created.results[0]!.orderedTests,
      departmentKey: created.results[0]!.specimen.departmentKey,
      departmentLabel: created.results[0]!.departmentLabel,
      collectionType: created.results[0]!.collectionType,
      identityConfirmationJson: resolved.identityConfirmationJson,
      printLabel: false,
      copies: input.copies,
      actor,
      syncAccession: true,
      allOrderedTests,
      containers: containerPayload,
    });

    const labelRouting =
      input.labelRouting ??
      resolveRoutingForScope(DRAX_HALL_ROUTING_POLICY, "labels");

    const labelGroups = groupSpecimensForLabelPrint(
      created.results.map((item) => ({
        id: item.specimen.id,
        accessionNumber: item.accessionNumber,
        specimenNumber: item.specimenNumber,
        barcode: item.barcode,
        departmentKey: item.specimen.departmentKey,
        departmentLabel: item.departmentLabel,
        collectionType: item.collectionType,
        orderedTestCodes: item.orderedTests.map((t) => t.code),
      })),
      labelRouting,
    );

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

    for (const group of labelGroups) {
      const built = this.printer.buildSpecimenLabel({
        accessionNumber: created.accessionNumber,
        specimenNumber: group.primarySpecimenNumber,
        patientName: resolved.patientName,
        barcode: group.primaryBarcode,
        dateOfBirth: resolved.patient.dateOfBirth,
        specimenType: group.collectionType,
        departmentKey: group.departmentKey,
        catalogCategory: group.catalogCategory,
        departmentLabel: group.departmentLabel,
        orderedTests: group.orderedTestCodes,
        mrn: resolved.patient.mrn,
        routing: labelRouting,
      });
      labelPreviews.push(built.fields);
      if (input.printLabel !== false) {
        const sent = await this.printer.printZpl(built.zpl, input.copies);
        printResults.push({ ...sent, zpl: built.zpl, fields: built.fields });
      } else {
        printResults.push(undefined);
      }
    }

    await this.logIdentityDecision(
      resolved,
      created.accessionNumber,
      actor,
    );
    await this.maybeQueueIdentityReview(
      resolved,
      created.accessionNumber,
      actor,
    );

    return {
      accessionNumber: created.accessionNumber,
      specimens,
      labelGroups: labelGroups.map((g) => ({
        departmentKey: g.departmentKey,
        departmentLabel: g.departmentLabel,
        collectionType: g.collectionType,
        specimenIds: g.specimenIds,
      })),
      labelPreviews,
      printResults,
    };
  }

  private accessionCreateData(args: {
    accessionNumber: string;
    patientId: string;
    patientPayload: ResolvedRegistration["patientPayload"];
    identityConfirmationJson: string | null;
    orderedTests: Array<{ code: string; name?: string }>;
    orderedSelections: OrderSelectionInput[];
    requisitionId?: string;
    collectedAt?: string;
    collectedByStaffId: string | null;
    collectedBySnapshot: string | null;
    actor: ActorSnapshot | null;
  }) {
    return {
      accessionNumber: args.accessionNumber,
      patientId: args.patientId,
      patientJson: JSON.stringify(args.patientPayload),
      identityConfirmationJson: args.identityConfirmationJson,
      orderedTestsJson: JSON.stringify(args.orderedTests),
      orderedSelectionsJson: JSON.stringify(args.orderedSelections),
      requisitionId: args.requisitionId?.trim() || null,
      collectedAt: args.collectedAt ? new Date(args.collectedAt) : null,
      collectedByStaffId: args.collectedByStaffId,
      collectedBySnapshot: args.collectedBySnapshot,
      status: "registered" as const,
      registeredBy: args.actor?.userId ?? null,
      registeredBySnapshot: args.actor ? JSON.stringify(args.actor) : null,
    };
  }

  private specimenCreateData(args: {
    accessionId: string;
    accessionNumber: string;
    specimenNumber: string;
    tubeSequence: number;
    barcode: string;
    patientId: string;
    patientPayload: ResolvedRegistration["patientPayload"];
    identityConfirmationJson: string | null;
    departmentKey: string;
    departmentLabel: string;
    collectionType: string;
    orderedTests: Array<{ code: string; name?: string }>;
    orderedSelections: OrderSelectionInput[];
    requisitionId?: string;
    registrationBatchId: string;
    collectedAt?: string;
    collectedByStaffId: string | null;
    collectedBySnapshot: string | null;
    actor: ActorSnapshot | null;
  }) {
    const collectionType = args.collectionType?.trim() || "blood";
    return {
      accessionId: args.accessionId,
      accessionNumber: args.accessionNumber,
      specimenNumber: args.specimenNumber,
      tubeSequence: args.tubeSequence,
      barcode: args.barcode,
      patientId: args.patientId,
      patientJson: JSON.stringify(args.patientPayload),
      identityConfirmationJson: args.identityConfirmationJson,
      departmentKey: args.departmentKey,
      departmentLabel: args.departmentLabel,
      collectionType,
      specimenType: collectionType,
      orderedTestsJson: JSON.stringify(args.orderedTests),
      orderedSelectionsJson: JSON.stringify(args.orderedSelections),
      requisitionId: args.requisitionId?.trim() || null,
      registrationBatchId: args.registrationBatchId,
      collectedAt: args.collectedAt ? new Date(args.collectedAt) : null,
      collectedByStaffId: args.collectedByStaffId,
      collectedBySnapshot: args.collectedBySnapshot,
      status: "registered" as const,
      registeredBy: args.actor?.userId ?? null,
      registeredBySnapshot: args.actor ? JSON.stringify(args.actor) : null,
    };
  }

  private normalizeRoutingGroup(group: BatchRegisterInput["specimens"][number]) {
    const collectionType =
      group.collectionType?.trim() ||
      group.specimenType?.trim() ||
      "blood";
    const departmentKey =
      group.departmentKey?.trim() ||
      group.departmentLabel?.trim().toLowerCase().replace(/\s+/g, "_") ||
      collectionType;
    const departmentLabel =
      group.departmentLabel?.trim() ||
      departmentKey
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    return { departmentKey, departmentLabel, collectionType };
  }

  private mergeOrderedTests(
    groups: Array<Array<{ code: string; name?: string }>>,
  ): Array<{ code: string; name?: string }> {
    const seen = new Set<string>();
    const out: Array<{ code: string; name?: string }> = [];
    for (const tests of groups) {
      for (const test of tests) {
        const code = test.code?.trim();
        if (!code) continue;
        const key = code.toUpperCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ code, name: test.name?.trim() || undefined });
      }
    }
    return out;
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

  private async logIdentityDecision(
    resolved: ResolvedRegistration,
    accessionNumber: string,
    actor: ActorSnapshot | null,
  ) {
    if (!resolved.identityConfirmationJson) return;
    const decision = JSON.parse(resolved.identityConfirmationJson) as unknown;
    await this.audit.log({
      eventType: "identity.confirmed",
      entityType: "accession",
      entityId: accessionNumber,
      actor,
      payload: { decision },
    });
    if (resolved.queuePossibleDuplicate) {
      await this.audit.log({
        eventType: "identity_review.flagged",
        entityType: "accession",
        entityId: accessionNumber,
        actor,
        payload: { decision },
      });
    }
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

  private async finalizeContainer(args: {
    accession: Awaited<ReturnType<PrismaService["accession"]["create"]>>;
    specimen: Awaited<ReturnType<PrismaService["specimen"]["create"]>>;
    patient: ResolvedRegistration["patient"];
    patientName: string;
    patientPayload: ResolvedRegistration["patientPayload"];
    orderedTests: Array<{ code: string; name?: string }>;
    departmentKey: string;
    departmentLabel: string;
    collectionType: string;
    identityConfirmationJson: string | null;
    printLabel?: boolean;
    copies?: number;
    actor: ActorSnapshot | null;
    syncAccession: boolean;
    allOrderedTests: Array<{ code: string; name?: string }>;
    containers: Array<{
      departmentKey: string;
      departmentLabel: string;
      collectionType: string;
      orderedTests: Array<{ code: string; name?: string }>;
      barcode: string;
      specimenNumber: string;
      specimenId: string;
    }>;
  }) {
    const {
      accession,
      specimen,
      patient,
      patientName,
      patientPayload,
      orderedTests,
      departmentKey,
      departmentLabel,
      collectionType,
      identityConfirmationJson,
      printLabel,
      copies,
      actor,
      syncAccession,
      allOrderedTests,
      containers,
    } = args;

    const accessionNumber = accession.accessionNumber;
    const barcode = specimen.barcode;

    if (syncAccession) {
      await this.sync.enqueue({
        type: "specimen.registered",
        payload: {
          accessionNumber,
          barcode: accessionNumber,
          patientId: patient.id,
          patientName,
          patient: patientPayload,
          specimenType: collectionType,
          orderedTests: allOrderedTests,
          containers,
          requisitionId: accession.requisitionId,
          registrationBatchId: specimen.registrationBatchId,
          orderedSelections: (() => {
            try {
              return JSON.parse(accession.orderedSelectionsJson || "[]");
            } catch {
              return [];
            }
          })(),
          collectedAt: accession.collectedAt?.toISOString() ?? null,
          collectedByStaffId: accession.collectedByStaffId,
          collectedBySnapshot: accession.collectedBySnapshot
            ? JSON.parse(accession.collectedBySnapshot)
            : null,
          identityConfirmation: identityConfirmationJson
            ? JSON.parse(identityConfirmationJson)
            : null,
          registeredBy: actor?.userId ?? null,
          registeredBySnapshot: actor ?? null,
        },
      });

      this.realtime.emitBenchEvent({
        type: "specimen.registered",
        accessionNumber,
        barcode: accessionNumber,
        patientName,
        at: new Date().toISOString(),
      });
    }

    const labelPayload = {
      accessionNumber,
      specimenNumber: specimen.specimenNumber ?? barcode,
      patientName,
      barcode,
      dateOfBirth: patient.dateOfBirth,
      specimenType: collectionType,
      departmentKey,
      departmentLabel,
      orderedTests: orderedTests.map((t) => t.code),
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

  private assertAccessionNumberAllowed(requested?: string) {
    if (!requested?.trim()) return;
    const hardened =
      process.env.EDGE_HARDENING === "true" ||
      process.env.NODE_ENV === "production";
    const allowOverride = process.env.EDGE_ALLOW_ACCESSION_OVERRIDE === "true";
    if (hardened && !allowOverride) {
      throw new BadRequestException(
        "Caller-supplied accession numbers are not allowed in production",
      );
    }
  }

  private async assertRequisitionUnused(requisitionId?: string) {
    const id = requisitionId?.trim();
    if (!id) return;
    const existing = await this.prisma.accession.findFirst({
      where: { requisitionId: id },
      select: { accessionNumber: true },
    });
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        error: "REQUISITION_ALREADY_LINKED",
        message: `This order is already accessioned as ${existing.accessionNumber}`,
        accessionNumber: existing.accessionNumber,
      });
    }
  }

  private async assertNoSimilarAccession(opts: {
    patientId: string;
    orderedTests: Array<{ code: string; name?: string }>;
    acknowledge?: boolean;
    actor: ActorSnapshot | null;
  }) {
    const incoming = orderedCodesFromTests(opts.orderedTests);
    if (incoming.length === 0) return;

    const hours = Number(process.env.SIMILAR_ACCESSION_WINDOW_HOURS ?? "48");
    const since = new Date(Date.now() - Math.max(1, hours) * 60 * 60 * 1000);
    const recent = await this.prisma.accession.findMany({
      where: {
        patientId: opts.patientId,
        registeredAt: { gte: since },
      },
      select: { accessionNumber: true, orderedTestsJson: true, registeredAt: true },
      orderBy: { registeredAt: "desc" },
      take: 20,
    });

    const matches = recent.filter((row) => {
      let codes: string[] = [];
      try {
        const parsed = JSON.parse(row.orderedTestsJson || "[]") as Array<{
          code?: string;
        }>;
        codes = orderedCodesFromTests(parsed);
      } catch {
        codes = [];
      }
      return isSimilarOrder(incoming, codes);
    });
    if (!matches.length) return;

    if (opts.acknowledge) {
      await this.audit.log({
        eventType: "accession.similar_acknowledged",
        entityType: "patient",
        entityId: opts.patientId,
        actor: opts.actor,
        payload: {
          similarAccessions: matches.map((m) => m.accessionNumber),
        },
      });
      return;
    }

    throw new ConflictException({
      statusCode: 409,
      error: "SIMILAR_ACCESSION_EXISTS",
      message: `A similar accession was registered recently (${matches[0]!.accessionNumber}). Continue only if this is a new visit.`,
      accessions: matches.map((m) => ({
        accessionNumber: m.accessionNumber,
        registeredAt: m.registeredAt.toISOString(),
      })),
    });
  }
}
