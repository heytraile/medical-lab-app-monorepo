import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  UseGuards,
} from "@nestjs/common";
import { HardenedAuthGuard } from "../auth/hardened-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { displayName } from "../patients/patient-normalize";
import {
  LabelPayload,
  PrinterService,
} from "./printer.service";

type ResolvedLabelContext = {
  accessionNumber: string;
  patientName: string;
  dateOfBirth: string | null;
  mrn?: string;
};

@Controller("print")
export class PrinterController {
  constructor(
    private readonly printer: PrinterService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("status")
  status() {
    return this.printer.getStatus();
  }

  @Post("preview")
  @UseGuards(HardenedAuthGuard)
  preview(
    @Body()
    body: LabelPayload & { copies?: number },
  ) {
    const { zpl, fields } = this.printer.buildSpecimenLabel({
      accessionNumber: body.accessionNumber,
      patientName: body.patientName,
      barcode: body.barcode ?? body.accessionNumber,
      dateOfBirth: body.dateOfBirth,
      orderedTests: body.orderedTests,
      specimenType: body.specimenType,
      departmentLabel: body.departmentLabel,
      mrn: body.mrn,
    });
    return { zpl, fields };
  }

  @Post("label")
  @UseGuards(HardenedAuthGuard)
  async printLabel(
    @Body()
    body: LabelPayload & { copies?: number },
  ) {
    const { zpl, fields } = this.printer.buildSpecimenLabel({
      accessionNumber: body.accessionNumber,
      patientName: body.patientName,
      barcode: body.barcode ?? body.accessionNumber,
      dateOfBirth: body.dateOfBirth,
      orderedTests: body.orderedTests,
      specimenType: body.specimenType,
      departmentLabel: body.departmentLabel,
      mrn: body.mrn,
    });
    const result = await this.printer.printZpl(zpl, body.copies);
    return { ...result, zpl, fields };
  }

  @Post("reprint")
  @UseGuards(HardenedAuthGuard)
  async reprint(
    @Body()
    body: {
      accessionNumber: string;
      copies?: number;
      departmentKey?: string;
    },
  ) {
    const accessionNumber = body.accessionNumber?.trim();
    if (!accessionNumber) {
      throw new NotFoundException("accessionNumber required");
    }

    const accession = await this.prisma.accession.findUnique({
      where: { accessionNumber },
      include: {
        patient: true,
        specimens: {
          where: body.departmentKey?.trim()
            ? { departmentKey: body.departmentKey.trim() }
            : undefined,
          orderBy: { departmentKey: "asc" },
        },
      },
    });

    let containers = accession?.specimens ?? [];
    if (!containers.length) {
      containers = await this.prisma.specimen.findMany({
        where: { accessionNumber },
        orderBy: { departmentKey: "asc" },
      });
    }

    if (!containers.length) {
      throw new NotFoundException(`Specimen ${accessionNumber} not found`);
    }

    const ctx = this.resolvePatientContext(
      accession ?? containers[0]!,
      accession?.patient ?? null,
    );

    const labels = [];
    for (const specimen of containers) {
      const { zpl, fields } = this.printer.buildSpecimenLabel({
        accessionNumber: specimen.accessionNumber,
        patientName: ctx.patientName,
        barcode: specimen.barcode,
        dateOfBirth: ctx.dateOfBirth,
        specimenType: specimen.collectionType ?? specimen.specimenType,
        departmentLabel: specimen.departmentLabel,
        mrn: ctx.mrn,
      });
      const result = await this.printer.printZpl(zpl, body.copies);
      labels.push({
        ...result,
        zpl,
        fields,
        specimenId: specimen.id,
        departmentKey: specimen.departmentKey,
      });
    }

    const first = labels[0]!;
    return {
      ok: labels.every((l) => l.ok),
      error: labels.find((l) => !l.ok)?.error,
      zpl: first.zpl,
      fields: first.fields,
      labels,
      specimenId: first.specimenId,
    };
  }

  @Post("test")
  @UseGuards(HardenedAuthGuard)
  async testLabel(@Body() body: { copies?: number }) {
    const { zpl, fields } = this.printer.buildTestLabel();
    const result = await this.printer.printZpl(zpl, body.copies ?? 1);
    return { ...result, zpl, fields };
  }

  private resolvePatientContext(
    row: { patientJson: string | null },
    patient: {
      firstName: string;
      lastName: string;
      middleName: string | null;
      dateOfBirth: string | null;
      mrn: string;
    } | null,
  ): ResolvedLabelContext {
    let patientName = "Unknown";
    let dateOfBirth: string | null = null;
    let mrn: string | undefined;

    if (patient) {
      patientName = displayName(patient);
      dateOfBirth = patient.dateOfBirth;
      mrn = patient.mrn;
    } else if (row.patientJson) {
      try {
        const snap = JSON.parse(row.patientJson) as {
          firstName?: string;
          lastName?: string;
          middleName?: string | null;
          dateOfBirth?: string | null;
          mrn?: string;
        };
        if (snap.firstName && snap.lastName) {
          patientName = displayName({
            firstName: snap.firstName,
            lastName: snap.lastName,
            middleName: snap.middleName,
          });
        }
        dateOfBirth = snap.dateOfBirth ?? null;
        mrn = snap.mrn;
      } catch {
        /* ignore */
      }
    }

    return {
      accessionNumber: "",
      patientName,
      dateOfBirth,
      mrn,
    };
  }
}
