import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import * as net from "net";
import {
  AstmReceiverSession,
  parseE1394,
  unwrapMllp,
  wrapMllp,
  parseOru,
  buildAck,
  parseQry,
  buildOrderResponse,
} from "@drax-lis/protocols";
import { IngestionService } from "./ingestion.service";
import { AnalyzerStatusService } from "./analyzer-status.service";
import { HostQueryService } from "./host-query.service";

type ListenerConfig = {
  analyzerId: string;
  port: number;
  protocol: "astm_e1381" | "hl7_mllp";
};

/**
 * ACK-aware TCP ingestion: ASTM E1381 session SM or MLLP ORU/QRY.
 */
@Injectable()
export class TcpIngestionDriver implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TcpIngestionDriver.name);
  private servers: net.Server[] = [];

  constructor(
    private readonly ingestion: IngestionService,
    private readonly status: AnalyzerStatusService,
    private readonly hostQuery: HostQueryService,
  ) {}

  onModuleInit() {
    const listeners: ListenerConfig[] = [
      {
        analyzerId: "sysmex_xs1000i",
        port: Number(process.env.SYSMEX_TCP_PORT ?? 5001),
        protocol: "astm_e1381",
      },
      {
        analyzerId: "mindray_bs240",
        port: Number(process.env.MINDRAY_TCP_PORT ?? 5003),
        protocol: "astm_e1381",
      },
      {
        analyzerId: "yhlo_iflash1200",
        port: Number(process.env.IFLASH_TCP_PORT ?? 5004),
        protocol: "hl7_mllp",
      },
    ];

    for (const cfg of listeners) {
      const server = net.createServer((socket) => {
        this.status.markConnect(cfg.analyzerId);
        if (cfg.protocol === "astm_e1381") {
          this.handleAstm(socket, cfg);
        } else {
          this.handleMllp(socket, cfg);
        }
        socket.on("close", () => this.status.markDisconnect(cfg.analyzerId));
        socket.on("error", (err) => {
          this.logger.warn(
            `${cfg.analyzerId} socket error: ${err.message}`,
          );
          this.status.markError(cfg.analyzerId, err.message);
        });
      });

      server.listen(cfg.port, "0.0.0.0", () => {
        this.logger.log(
          `${cfg.analyzerId} TCP listener on :${cfg.port} (${cfg.protocol})`,
        );
        this.status.markListening(cfg.analyzerId, {
          transport: "tcp",
          protocol: cfg.protocol,
          listenTarget: `0.0.0.0:${cfg.port}`,
          listening: true,
        });
      });
      this.servers.push(server);
    }
  }

  private handleAstm(socket: net.Socket, cfg: ListenerConfig) {
    const session = new AstmReceiverSession();
    const rawChunks: Buffer[] = [];

    socket.on("data", (chunk) => {
      rawChunks.push(chunk);
      const events = session.push(chunk);
      for (const ev of events) {
        if (ev.type === "send") {
          socket.write(ev.bytes);
        } else if (ev.type === "error") {
          this.status.markError(cfg.analyzerId, ev.message);
          this.logger.warn(`${cfg.analyzerId}: ${ev.message}`);
        } else if (ev.type === "message") {
          const text = ev.records.join("\r");
          const parsed = parseE1394(text);
          void this.ingestion
            .ingest({
              analyzerId: cfg.analyzerId,
              transport: "tcp",
              protocol: "astm_e1381",
              payload: Buffer.concat(rawChunks),
              parsed,
            })
            .then((res) => {
              this.status.markSuccess(cfg.analyzerId, res.accessionNumber);
            })
            .catch((err) => {
              const msg = err instanceof Error ? err.message : String(err);
              this.status.markError(cfg.analyzerId, msg);
              this.logger.error(`Ingest failed: ${msg}`);
            });
          rawChunks.length = 0;
        }
      }
    });
  }

  private handleMllp(socket: net.Socket, cfg: ListenerConfig) {
    let buffer: Buffer = Buffer.alloc(0);

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const { messages, remainder } = unwrapMllp(buffer);
      buffer = Buffer.from(remainder);

      for (const msg of messages) {
        void this.processHl7(socket, cfg, msg);
      }
    });
  }

  private async processHl7(
    socket: net.Socket,
    cfg: ListenerConfig,
    msg: string,
  ) {
    try {
      const msh = msg.split(/\r/).find((s) => s.startsWith("MSH|"));
      const msgType = msh?.split("|")[8] ?? "";

      if (msgType.startsWith("QRY")) {
        const qry = parseQry(msg);
        const barcode = qry.barcode ?? "";
        const orders = barcode
          ? await this.hostQuery.ordersByBarcode(barcode)
          : {
              found: false,
              barcode,
              orderedTests: [] as Array<{ code: string; name?: string }>,
            };

        const rsp = buildOrderResponse({
          originalQry: msg,
          barcode: orders.barcode || barcode || "UNKNOWN",
          orderedTests: orders.found ? orders.orderedTests : [],
          patientName: "patientName" in orders ? orders.patientName : undefined,
        });
        socket.write(wrapMllp(rsp));
        this.status.markSuccess(
          cfg.analyzerId,
          "accessionNumber" in orders ? orders.accessionNumber : undefined,
        );
        return;
      }

      // ORU (and other result messages)
      const parsed = parseOru(msg);
      const ack = buildAck(msg, "AA");
      socket.write(wrapMllp(ack));

      const res = await this.ingestion.ingest({
        analyzerId: cfg.analyzerId,
        transport: "tcp",
        protocol: "hl7_mllp",
        payload: msg,
        parsed,
      });
      this.status.markSuccess(cfg.analyzerId, res.accessionNumber);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.status.markError(cfg.analyzerId, message);
      try {
        socket.write(wrapMllp(buildAck(msg, "AE")));
      } catch {
        /* ignore */
      }
      this.logger.error(`HL7 handle failed: ${message}`);
    }
  }

  onModuleDestroy() {
    for (const s of this.servers) {
      s.close();
    }
  }
}
