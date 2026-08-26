import { Injectable, Logger } from "@nestjs/common";
import * as net from "net";

@Injectable()
export class PrinterService {
  private readonly logger = new Logger(PrinterService.name);

  /**
   * Send raw ZPL to a Zebra (or simulator) over TCP port 9100.
   */
  async printZpl(zpl: string): Promise<{ ok: boolean; error?: string }> {
    const host = process.env.ZEBRA_PRINTER_HOST ?? "127.0.0.1";
    const port = Number(process.env.ZEBRA_PRINTER_PORT ?? 9100);

    return new Promise((resolve) => {
      const socket = net.createConnection({ host, port }, () => {
        socket.write(zpl, () => {
          socket.end();
          this.logger.log(`ZPL sent to ${host}:${port}`);
          resolve({ ok: true });
        });
      });
      socket.setTimeout(5000);
      socket.on("timeout", () => {
        socket.destroy();
        resolve({ ok: false, error: "printer timeout" });
      });
      socket.on("error", (err) => {
        this.logger.warn(`Printer error: ${err.message}`);
        resolve({ ok: false, error: err.message });
      });
    });
  }

  buildSpecimenLabel(opts: {
    accessionNumber: string;
    patientName: string;
    barcode: string;
  }): string {
    // Minimal 2" x 1" ZPL label
    return `^XA
^FO30,30^A0N,40,40^FD${opts.accessionNumber}^FS
^FO30,80^A0N,28,28^FD${opts.patientName}^FS
^FO30,130^BY2^BCN,80,Y,N,N^FD${opts.barcode}^FS
^XZ
`;
  }
}
