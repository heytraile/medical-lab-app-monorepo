import {
  Injectable,
  Logger,
} from "@nestjs/common";
import * as net from "net";
import {
  buildSpecimenLabelInput,
  DRAX_HALL_ROUTING_SETTINGS,
  type LabRoutingSettings,
} from "@drax-lis/catalog";
import {
  buildSpecimenLabelDocument,
  formattedToPreviewFields,
  resolveLabelSize,
  type LabelPreviewFields,
} from "@drax-lis/contracts";

export type LabelPayload = {
  accessionNumber: string;
  specimenNumber?: string;
  patientName: string;
  barcode: string;
  dateOfBirth?: string | null;
  orderedTests?: string[];
  specimenType?: string;
  departmentKey?: string;
  catalogCategory?: string;
  departmentLabel?: string;
  departmentLabelShort?: string;
  collectionLabelShort?: string;
  includeCollectionOnRouting?: boolean;
  mrn?: string;
  routing?: LabRoutingSettings;
};

export type { LabelPreviewFields };

@Injectable()
export class PrinterService {
  private readonly logger = new Logger(PrinterService.name);

  private get host() {
    return process.env.ZEBRA_PRINTER_HOST ?? "127.0.0.1";
  }

  private get port() {
    return Number(process.env.ZEBRA_PRINTER_PORT ?? 9100);
  }

  private get labelSize() {
    return resolveLabelSize({
      sizeId: process.env.LABEL_SIZE_ID,
      widthDots: Number(process.env.LABEL_WIDTH_DOTS ?? 0) || undefined,
      heightDots: Number(process.env.LABEL_HEIGHT_DOTS ?? 0) || undefined,
    });
  }

  private get labelWidthDots() {
    return this.labelSize.widthDots;
  }

  private get labelHeightDots() {
    return this.labelSize.heightDots;
  }

  private get defaultCopies() {
    return Math.min(5, Math.max(1, Number(process.env.LABEL_COPIES ?? 1)));
  }

  /** TCP connect test — ZD411 raw port 9100. */
  async getStatus(): Promise<{
    ok: boolean;
    host: string;
    port: number;
    error?: string;
  }> {
    const { host, port } = this;
    return new Promise((resolve) => {
      const socket = net.createConnection({ host, port }, () => {
        socket.end();
        resolve({ ok: true, host, port });
      });
      socket.setTimeout(3000);
      socket.on("timeout", () => {
        socket.destroy();
        resolve({ ok: false, host, port, error: "printer timeout" });
      });
      socket.on("error", (err) => {
        resolve({ ok: false, host, port, error: err.message });
      });
    });
  }

  /**
   * Send raw ZPL to a Zebra ZD411 (or simulator) over TCP port 9100.
   */
  async printZpl(
    zpl: string,
    copies?: number,
  ): Promise<{ ok: boolean; error?: string; copies: number }> {
    const count = Math.min(5, Math.max(1, copies ?? this.defaultCopies));
    const payload = count > 1 ? zpl.replace("^XA", `^XA^PQ${count}`) : zpl;
    const { host, port } = this;

    return new Promise((resolve) => {
      const socket = net.createConnection({ host, port }, () => {
        socket.write(payload, () => {
          socket.end();
          this.logger.log(`ZPL sent to ${host}:${port} (${count} copy)`);
          resolve({ ok: true, copies: count });
        });
      });
      socket.setTimeout(5000);
      socket.on("timeout", () => {
        socket.destroy();
        resolve({ ok: false, error: "printer timeout", copies: count });
      });
      socket.on("error", (err) => {
        this.logger.warn(`Printer error: ${err.message}`);
        resolve({ ok: false, error: err.message, copies: count });
      });
    });
  }

  buildSpecimenLabel(opts: LabelPayload): {
    zpl: string;
    fields: LabelPreviewFields;
  } {
    const barcode =
      opts.barcode ?? opts.specimenNumber ?? opts.accessionNumber;
    const input =
      opts.departmentLabelShort != null
        ? {
            accessionNumber: opts.accessionNumber,
            specimenNumber: opts.specimenNumber,
            patientName: opts.patientName,
            barcode,
            dateOfBirth: opts.dateOfBirth,
            orderedTests: opts.orderedTests,
            specimenType: opts.specimenType,
            departmentLabel: opts.departmentLabel,
            departmentLabelShort: opts.departmentLabelShort,
            collectionLabelShort: opts.collectionLabelShort,
            includeCollectionOnRouting: opts.includeCollectionOnRouting,
            mrn: opts.mrn,
          }
        : buildSpecimenLabelInput({
            accessionNumber: opts.accessionNumber,
            specimenNumber: opts.specimenNumber,
            patientName: opts.patientName,
            barcode,
            dateOfBirth: opts.dateOfBirth,
            departmentKey: opts.departmentKey,
            catalogCategory: opts.catalogCategory ?? opts.departmentKey,
            departmentLabel: opts.departmentLabel,
            collectionType: opts.specimenType,
            orderedTestCodes: opts.orderedTests,
            mrn: opts.mrn,
            routing: opts.routing ?? DRAX_HALL_ROUTING_SETTINGS,
          });
    const { formatted, zpl } = buildSpecimenLabelDocument(
      input,
      this.labelSize,
    );
    return { zpl, fields: formattedToPreviewFields(formatted) };
  }

  buildTestLabel(): { zpl: string; fields: LabelPreviewFields } {
    return this.buildSpecimenLabel({
      accessionNumber: "DH202608260001",
      specimenNumber: "DH202608260001-01",
      patientName: "Test Patient",
      barcode: "DH202608260001-01",
      dateOfBirth: "1980-01-01",
      specimenType: "blood",
      departmentKey: "chemistry",
      departmentLabel: "Chemistry",
      orderedTests: ["CREATININE", "LIPIDS"],
      mrn: "MRN-TEST",
    });
  }
}
