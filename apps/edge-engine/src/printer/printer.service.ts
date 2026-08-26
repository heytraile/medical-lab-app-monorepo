import { Injectable, Logger } from "@nestjs/common";
import * as net from "net";

export type LabelPayload = {
  accessionNumber: string;
  patientName: string;
  barcode: string;
  dateOfBirth?: string | null;
  orderedTests?: string[];
  specimenType?: string;
  mrn?: string;
};

export type LabelPreviewFields = {
  accessionNumber: string;
  patientName: string;
  barcode: string;
  dateOfBirth: string;
  orderedTests: string;
  specimenType: string;
  mrn?: string;
  printedAt: string;
  widthDots: number;
  heightDots: number;
};

@Injectable()
export class PrinterService {
  private readonly logger = new Logger(PrinterService.name);

  private get host() {
    return process.env.ZEBRA_PRINTER_HOST ?? "127.0.0.1";
  }

  private get port() {
    return Number(process.env.ZEBRA_PRINTER_PORT ?? 9100);
  }

  private get labelWidthDots() {
    return Number(process.env.LABEL_WIDTH_DOTS ?? 406);
  }

  private get labelHeightDots() {
    return Number(process.env.LABEL_HEIGHT_DOTS ?? 203);
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
    const pw = this.labelWidthDots;
    const ll = this.labelHeightDots;
    const dob = opts.dateOfBirth?.trim() || "DOB —";
    const tests =
      (opts.orderedTests ?? []).filter(Boolean).join(", ") || "—";
    const tube = opts.specimenType?.trim() || "blood";
    const printedAt = new Date().toISOString();
    const esc = (s: string) =>
      s.replace(/\^/g, " ").replace(/\\/g, " ").slice(0, 48);

    const fields: LabelPreviewFields = {
      accessionNumber: opts.accessionNumber,
      patientName: opts.patientName,
      barcode: opts.barcode,
      dateOfBirth: dob,
      orderedTests: tests,
      specimenType: tube,
      mrn: opts.mrn,
      printedAt,
      widthDots: pw,
      heightDots: ll,
    };

    const zpl = `^XA
^PW${pw}
^LL${ll}
^LH0,0
^FO8,8^A0N,28,28^FD${esc(opts.accessionNumber)}^FS
^FO8,38^A0N,20,20^FD${esc(opts.patientName)}^FS
^FO8,60^A0N,16,16^FD${esc(dob)}  ${esc(tube)}^FS
^FO8,78^A0N,16,16^FD${esc(tests)}^FS
^FO${pw - 72},8^BXN,4,200,,,,_,1^FD${esc(opts.barcode)}^FS
^FO8,100^BY2,2,60^BCN,60,Y,N,N^FD${esc(opts.barcode)}^FS
^FO8,${ll - 18}^A0N,14,14^FD${esc(printedAt.slice(0, 19).replace("T", " "))}^FS
^XZ
`;

    return { zpl, fields };
  }

  buildTestLabel(): { zpl: string; fields: LabelPreviewFields } {
    return this.buildSpecimenLabel({
      accessionNumber: "DH202608260001",
      patientName: "Test Patient",
      barcode: "DH202608260001",
      dateOfBirth: "1980-01-01",
      orderedTests: ["CBC", "BMP"],
      specimenType: "blood",
      mrn: "MRN-TEST",
    });
  }
}
