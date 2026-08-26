import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PrinterService } from "../printer/printer.service";
import { SyncService } from "../sync/sync.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";

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

  async register(input: {
    accessionNumber?: string;
    barcode?: string;
    patientName: string;
    patient?: {
      firstName: string;
      lastName: string;
      dateOfBirth?: string;
      sex?: string;
    };
    orderedTests?: Array<{ code: string; name?: string }>;
    printLabel?: boolean;
  }) {
    const accessionNumber =
      input.accessionNumber ??
      `DH${new Date().toISOString().slice(0, 10).replace(/-/g, "")}${String(
        Math.floor(Math.random() * 9000) + 1000,
      )}`;
    const barcode = input.barcode ?? accessionNumber;

    const specimen = await this.prisma.specimen.create({
      data: {
        accessionNumber,
        barcode,
        patientJson: JSON.stringify(
          input.patient ?? { firstName: input.patientName, lastName: "" },
        ),
        orderedTestsJson: JSON.stringify(input.orderedTests ?? []),
        status: "registered",
      },
    });

    await this.sync.enqueue({
      type: "specimen.registered",
      payload: {
        accessionNumber,
        barcode,
        patientName: input.patientName,
        orderedTests: input.orderedTests ?? [],
      },
    });

    let printResult: { ok: boolean; error?: string; zpl?: string } | undefined;
    if (input.printLabel !== false) {
      const zpl = this.printer.buildSpecimenLabel({
        accessionNumber,
        patientName: input.patientName,
        barcode,
      });
      const sent = await this.printer.printZpl(zpl);
      printResult = { ...sent, zpl };
    }

    this.realtime.emitBenchEvent({
      type: "specimen.registered",
      accessionNumber,
      barcode,
      at: new Date().toISOString(),
    });

    return { specimen, printResult };
  }
}
