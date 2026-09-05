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
      mrn: body.mrn,
    });
    const result = await this.printer.printZpl(zpl, body.copies);
    return { ...result, zpl, fields };
  }

  @Post("reprint")
  @UseGuards(HardenedAuthGuard)
  async reprint(
    @Body() body: { accessionNumber: string; copies?: number },
  ) {
    const accessionNumber = body.accessionNumber?.trim();
    if (!accessionNumber) {
      throw new NotFoundException("accessionNumber required");
    }

    const specimen = await this.prisma.specimen.findUnique({
      where: { accessionNumber },
      include: { patient: true },
    });
    if (!specimen) {
      throw new NotFoundException(`Specimen ${accessionNumber} not found`);
    }

    let patientName = "Unknown";
    let dateOfBirth: string | null = null;
    let mrn: string | undefined;

    if (specimen.patient) {
      patientName = displayName(specimen.patient);
      dateOfBirth = specimen.patient.dateOfBirth;
      mrn = specimen.patient.mrn;
    } else if (specimen.patientJson) {
      try {
        const snap = JSON.parse(specimen.patientJson) as {
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

    let orderedTests: string[] = [];
    try {
      const parsed = JSON.parse(specimen.orderedTestsJson) as Array<{
        code?: string;
      }>;
      orderedTests = parsed.map((t) => t.code).filter(Boolean) as string[];
    } catch {
      /* ignore */
    }

    const { zpl, fields } = this.printer.buildSpecimenLabel({
      accessionNumber: specimen.accessionNumber,
      patientName,
      barcode: specimen.barcode,
      dateOfBirth,
      orderedTests,
      specimenType: specimen.specimenType,
      mrn,
    });
    const result = await this.printer.printZpl(zpl, body.copies);
    return { ...result, zpl, fields, specimenId: specimen.id };
  }

  @Post("test")
  @UseGuards(HardenedAuthGuard)
  async testLabel(@Body() body: { copies?: number }) {
    const { zpl, fields } = this.printer.buildTestLabel();
    const result = await this.printer.printZpl(zpl, body.copies ?? 1);
    return { ...result, zpl, fields };
  }
}
