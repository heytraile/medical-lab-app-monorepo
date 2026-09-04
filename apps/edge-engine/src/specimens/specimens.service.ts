import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { ActorSnapshot } from "@drax-lis/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { PrinterService } from "../printer/printer.service";
import { SyncService } from "../sync/sync.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { displayName } from "../patients/patient-normalize";

type IdentityConfirmation = {
  decision: "distinct_people" | "possible_duplicate_acknowledged";
  suspectGroupId: string;
  confirmedAt?: string;
  confirmedBy?: string;
};

type RegisterInput = {
  accessionNumber?: string;
  barcode?: string;
  patientId: string;
  identityConfirmation?: IdentityConfirmation;
  orderedTests?: Array<{ code: string; name?: string }>;
  requisitionId?: string;
  printLabel?: boolean;
  copies?: number;
  specimenType?: string;
  collectedAt?: string;
};

type BatchRegisterInput = {
  patientId: string;
  identityConfirmation?: IdentityConfirmation;
  requisitionId?: string;
  printLabel?: boolean;
  copies?: number;
  collectedAt?: string;
  specimens: Array<{
    specimenType: string;
    orderedTests: Array<{ code: string; name?: string }>;
  }>;
};

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
  ) {}

  list() {
    return this.prisma.specimen.findMany({
      orderBy: { registeredAt: "desc" },
      take: 100,
    });
  }

  findByAccession(accessionNumber: string) {
    return this.prisma.specimen.findUnique({
      where: { accessionNumber },
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

    const specimen = await this.prisma.specimen.create({
      data: this.specimenCreateData({
        accessionNumber,
        barcode,
        patientId: resolved.patient.id,
        patientPayload: resolved.patientPayload,
        identityConfirmationJson: resolved.identityConfirmationJson,
        orderedTests,
        requisitionId: input.requisitionId,
        specimenType: input.specimenType,
        collectedAt: input.collectedAt,
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
            requisitionId: input.requisitionId,
            specimenType: group.specimenType,
            collectedAt: input.collectedAt,
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

    return { specimens, labelPreviews, printResults };
  }

  private specimenCreateData(args: {
    accessionNumber: string;
    barcode: string;
    patientId: string;
    patientPayload: ResolvedRegistration["patientPayload"];
    identityConfirmationJson: string | null;
    orderedTests: Array<{ code: string; name?: string }>;
    requisitionId?: string;
    specimenType?: string;
    collectedAt?: string;
    actor: ActorSnapshot | null;
  }) {
    return {
      accessionNumber: args.accessionNumber,
      barcode: args.barcode,
      patientId: args.patientId,
      patientJson: JSON.stringify(args.patientPayload),
      identityConfirmationJson: args.identityConfirmationJson,
      orderedTestsJson: JSON.stringify(args.orderedTests),
      requisitionId: args.requisitionId?.trim() || null,
      specimenType: args.specimenType?.trim() || "blood",
      collectedAt: args.collectedAt ? new Date(args.collectedAt) : null,
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
    };
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
