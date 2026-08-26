import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import {
  AstmReceiverSession,
  parseE1394,
  parseProlyteBlock,
} from "@drax-lis/protocols";
import { IngestionService } from "./ingestion.service";
import { AnalyzerStatusService } from "./analyzer-status.service";

/** Minimal SerialPort surface — loaded dynamically at runtime. */
interface EdgeSerialPort {
  open(callback: (err: Error | null | undefined) => void): void;
  close(callback?: () => void): void;
  write(data: Buffer): void;
  on(event: "data", listener: (chunk: Buffer) => void): void;
  isOpen: boolean;
}

type SerialPortCtor = new (options: Record<string, unknown>) => EdgeSerialPort;

/**
 * Serial / PTY ingestion for ProLyte (ASCII blocks) and optional Sysmex ASTM.
 *
 * ProLyte: unidirectional RS-232, 9600 8N1 (or 1200 on older firmware), no flow
 * control, no ASTM handshake. Multi-line blocks are flushed after idle timeout.
 */
@Injectable()
export class SerialIngestionDriver implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SerialIngestionDriver.name);
  private ports: Array<{ close: () => Promise<void> }> = [];

  constructor(
    private readonly ingestion: IngestionService,
    private readonly status: AnalyzerStatusService,
  ) {}

  async onModuleInit() {
    const prolytePath = process.env.PROLYTE_SERIAL_PATH?.trim();
    const sysmexPath = process.env.SYSMEX_SERIAL_PATH?.trim();

    if (prolytePath) {
      await this.openAscii(prolytePath, "diamond_prolyte", "ascii_delimited");
    } else {
      this.status.markListening("diamond_prolyte", {
        transport: "serial",
        protocol: "ascii_delimited",
        listenTarget: "(unset PROLYTE_SERIAL_PATH)",
        listening: false,
      });
      this.logger.log(
        "ProLyte serial skipped (set PROLYTE_SERIAL_PATH to a PTY / COM port)",
      );
    }

    if (sysmexPath) {
      await this.openAstm(sysmexPath, "sysmex_xs1000i");
    }
  }

  private async loadSerialPort(): Promise<SerialPortCtor | null> {
    try {
      const mod = await import("serialport");
      return mod.SerialPort as SerialPortCtor;
    } catch (err) {
      this.logger.warn(
        `serialport unavailable: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private async openAscii(
    path: string,
    analyzerId: string,
    protocol: "ascii_delimited",
  ) {
    const SerialPort = await this.loadSerialPort();
    if (!SerialPort) return;

    const idleMs = Number(process.env.PROLYTE_BLOCK_IDLE_MS ?? 400);

    // Diamond ProLyte sheet: 9600 8N1, no parity, 1 stop, no handshake
    const port = new SerialPort({
      path,
      baudRate: Number(process.env.PROLYTE_BAUD ?? 9600),
      dataBits: 8,
      parity: "none",
      stopBits: 1,
      rtscts: false,
      xon: false,
      xoff: false,
      autoOpen: false,
    });

    await new Promise<void>((resolve, reject) => {
      port.open((err: Error | null | undefined) =>
        err ? reject(err) : resolve(),
      );
    });

    this.status.markListening(analyzerId, {
      transport: "serial",
      protocol,
      listenTarget: path,
      listening: true,
    });
    this.logger.log(
      `${analyzerId} serial open on ${path} (8N1, idle=${idleMs}ms)`,
    );

    let lineBuf = "";
    const blockLines: string[] = [];
    let idleTimer: NodeJS.Timeout | undefined;

    const flushBlock = () => {
      if (!blockLines.length) return;
      const payload = blockLines.join("\r\n");
      blockLines.length = 0;
      const parsed = parseProlyteBlock(payload);
      if (!parsed.analytes.length && !parsed.barcode) {
        this.logger.debug(`ProLyte empty/incomplete block ignored`);
        return;
      }
      void this.ingestion
        .ingest({
          analyzerId: "diamond_prolyte",
          transport: "serial",
          protocol,
          payload,
          parsed,
        })
        .then((res) =>
          this.status.markSuccess("diamond_prolyte", res.accessionNumber),
        )
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.status.markError("diamond_prolyte", msg);
        });
    };

    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(flushBlock, idleMs);
    };

    port.on("data", (chunk: Buffer) => {
      lineBuf += chunk.toString("latin1");
      const parts = lineBuf.split(/\r\n|\n|\r/);
      lineBuf = parts.pop() ?? "";
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        blockLines.push(trimmed);
        armIdle();
      }
    });

    this.ports.push({
      close: () =>
        new Promise((resolve) => {
          if (idleTimer) {
            clearTimeout(idleTimer);
            flushBlock();
          }
          if (port.isOpen) port.close(() => resolve());
          else resolve();
        }),
    });
  }

  private async openAstm(path: string, analyzerId: string) {
    const SerialPort = await this.loadSerialPort();
    if (!SerialPort) return;

    const port = new SerialPort({
      path,
      baudRate: Number(process.env.SYSMEX_SERIAL_BAUD ?? 9600),
      autoOpen: false,
    });

    await new Promise<void>((resolve, reject) => {
      port.open((err: Error | null | undefined) =>
        err ? reject(err) : resolve(),
      );
    });

    this.status.markListening(analyzerId, {
      transport: "serial",
      protocol: "astm_e1381",
      listenTarget: path,
      listening: true,
    });
    this.logger.log(`${analyzerId} ASTM serial open on ${path}`);

    const session = new AstmReceiverSession();
    const rawChunks: Buffer[] = [];
    port.on("data", (chunk: Buffer) => {
      rawChunks.push(chunk);
      for (const ev of session.push(chunk)) {
        if (ev.type === "send") {
          port.write(ev.bytes);
        } else if (ev.type === "message") {
          const text = ev.records.join("\r");
          const parsed = parseE1394(text);
          void this.ingestion
            .ingest({
              analyzerId,
              transport: "serial",
              protocol: "astm_e1381",
              payload: Buffer.concat(rawChunks),
              parsed,
            })
            .then((res) =>
              this.status.markSuccess(analyzerId, res.accessionNumber),
            )
            .catch((err) => {
              const msg = err instanceof Error ? err.message : String(err);
              this.status.markError(analyzerId, msg);
            });
          rawChunks.length = 0;
        } else if (ev.type === "error") {
          this.status.markError(analyzerId, ev.message);
        }
      }
    });

    this.ports.push({
      close: () =>
        new Promise((resolve) => {
          if (port.isOpen) port.close(() => resolve());
          else resolve();
        }),
    });
  }

  async onModuleDestroy() {
    await Promise.all(this.ports.map((p) => p.close()));
  }
}
