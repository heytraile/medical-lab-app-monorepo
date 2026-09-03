import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
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
    input: {
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
  },
    actor: ActorSnapshot | null = null,
  ) {
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
    const patientName = displayName(patient);
    const orderedTests = input.orderedTests ?? [];

    const accessionNumber =
      input.accessionNumber ?? (await this.nextAccessionNumber());
    const barcode = input.barcode ?? accessionNumber;

    const specimen = await this.prisma.specimen.create({
      data: {
        accessionNumber,
        barcode,
        patientId: patient.id,
        patientJson: JSON.stringify(patientPayload),
        identityConfirmationJson,
        orderedTestsJson: JSON.stringify(orderedTests),
        requisitionId: input.requisitionId?.trim() || null,
        specimenType: input.specimenType?.trim() || "blood",
        collectedAt: input.collectedAt
          ? new Date(input.collectedAt)
          : null,
        status: "registered",
        registeredBy: actor?.userId ?? null,
        registeredBySnapshot: actor ? JSON.stringify(actor) : null,
      },
    });

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

    let printResult:
      | { ok: boolean; error?: string; zpl?: string; copies?: number; fields?: unknown }
      | undefined;
    let labelPreview: ReturnType<PrinterService["buildSpecimenLabel"]>["fields"] | undefined;

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
    labelPreview = built.fields;

    if (input.printLabel !== false) {
      const copies = input.copies ?? undefined;
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

    return { specimen, printResult, labelPreview };
  }

  /** DH{YYYYMMDD}{####} with atomic per-day counter. */
  private async nextAccessionNumber(): Promise<string> {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const meta = await this.prisma.syncMeta.findUnique({
      where: { id: "singleton" },
    });
    if (!meta) {
      throw new BadRequestException("SyncMeta singleton missing");
    }

    let seq: number;
    if (meta.accessionDay === day) {
      const updated = await this.prisma.syncMeta.update({
        where: { id: "singleton" },
        data: { accessionSeq: { increment: 1 } },
      });
      seq = updated.accessionSeq;
    } else {
      const updated = await this.prisma.syncMeta.update({
        where: { id: "singleton" },
        data: { accessionDay: day, accessionSeq: 1 },
      });
      seq = updated.accessionSeq;
    }

    return `DH${day}${String(seq).padStart(4, "0")}`;
  }
}
