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
  DRAX_HALL_ROUTING_POLICY,
  groupSpecimensForLabelPrint,
  resolveRoutingForScope,
} from "@drax-lis/catalog";
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
    return this.buildLabelFromBody(body);
  }

  @Post("label")
  @UseGuards(HardenedAuthGuard)
  async printLabel(
    @Body()
    body: LabelPayload & { copies?: number },
  ) {
    const { zpl, fields } = this.buildLabelFromBody(body);
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

    const labelRouting = resolveRoutingForScope(
      DRAX_HALL_ROUTING_POLICY,
      "labels",
    );
    const printGroups = groupSpecimensForLabelPrint(
      containers.map((specimen) => ({
        id: specimen.id,
        accessionNumber: specimen.accessionNumber,
        specimenNumber: specimen.specimenNumber ?? undefined,
        barcode: specimen.barcode,
        departmentKey: specimen.departmentKey,
        departmentLabel: specimen.departmentLabel,
        collectionType: specimen.collectionType ?? specimen.specimenType,
        orderedTestCodes: this.orderedTestCodesFromSpecimen(specimen),
      })),
      labelRouting,
    );

    const labels = [];
    for (const group of printGroups) {
      const { zpl, fields } = this.printer.buildSpecimenLabel({
        accessionNumber: containers[0]!.accessionNumber,
        specimenNumber: group.primarySpecimenNumber,
        patientName: ctx.patientName,
        barcode: group.primaryBarcode,
        dateOfBirth: ctx.dateOfBirth,
        specimenType: group.collectionType,
        departmentKey: group.departmentKey,
        catalogCategory: group.catalogCategory,
        departmentLabel: group.departmentLabel,
        orderedTests: group.orderedTestCodes,
        mrn: ctx.mrn,
        routing: labelRouting,
      });
      const result = await this.printer.printZpl(zpl, body.copies);
      labels.push({
        ...result,
        zpl,
        fields,
        specimenId: group.specimenIds[0],
        departmentKey: group.departmentKey,
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

  private buildLabelFromBody(body: LabelPayload & { copies?: number }) {
    const { zpl, fields } = this.printer.buildSpecimenLabel({
      accessionNumber: body.accessionNumber,
      specimenNumber: body.specimenNumber,
      patientName: body.patientName,
      barcode: body.barcode ?? body.specimenNumber ?? body.accessionNumber,
      dateOfBirth: body.dateOfBirth,
      orderedTests: body.orderedTests,
      specimenType: body.specimenType,
      departmentKey: body.departmentKey,
      catalogCategory: body.catalogCategory ?? body.departmentKey,
      departmentLabel: body.departmentLabel,
      departmentLabelShort: body.departmentLabelShort,
      collectionLabelShort: body.collectionLabelShort,
      includeCollectionOnRouting: body.includeCollectionOnRouting,
      mrn: body.mrn,
      routing: body.routing,
    });
    return { zpl, fields };
  }

  private orderedTestCodesFromSpecimen(specimen: {
    orderedTestsJson: string;
  }): string[] {
    try {
      const parsed = JSON.parse(specimen.orderedTestsJson) as Array<{
        code?: string;
      }>;
      return parsed.map((t) => String(t.code ?? "").trim()).filter(Boolean);
    } catch {
      return [];
    }
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
