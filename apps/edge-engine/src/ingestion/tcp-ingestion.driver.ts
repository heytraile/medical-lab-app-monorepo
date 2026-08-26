import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import * as net from "net";
import { IngestionService } from "./ingestion.service";

type ListenerConfig = {
  analyzerId: string;
  port: number;
  protocol: "astm_e1381" | "hl7_mllp";
};

/**
 * TCP ingestion drivers. Simulators (and later real instruments over LAN)
 * connect to these ports and dump protocol frames.
 */
@Injectable()
export class TcpIngestionDriver implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TcpIngestionDriver.name);
  private servers: net.Server[] = [];

  constructor(private readonly ingestion: IngestionService) {}

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
        const chunks: Buffer[] = [];
        socket.on("data", (data) => chunks.push(data));
        socket.on("end", () => {
          const payload = Buffer.concat(chunks);
          void this.ingestion
            .ingest({
              analyzerId: cfg.analyzerId,
              transport: "tcp",
              protocol: cfg.protocol,
              payload,
            })
            .catch((err) =>
              this.logger.error(`Ingest failed: ${String(err)}`),
            );
        });
      });

      server.listen(cfg.port, "0.0.0.0", () => {
        this.logger.log(
          `${cfg.analyzerId} TCP listener on :${cfg.port} (${cfg.protocol})`,
        );
      });
      this.servers.push(server);
    }
  }

  onModuleDestroy() {
    for (const s of this.servers) {
      s.close();
    }
  }
}
