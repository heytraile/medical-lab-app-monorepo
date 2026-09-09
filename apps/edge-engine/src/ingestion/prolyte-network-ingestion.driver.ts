import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import * as http from "http";
import { parse as parseQuery } from "querystring";
import { parseProlyteNetworkLis } from "@drax-lis/protocols";
import { IngestionService } from "./ingestion.service";
import { AnalyzerStatusService } from "./analyzer-status.service";

const ANALYZER_ID = "diamond_prolyte";

function networkLisEnabled(): boolean {
  const v = process.env.PROLYTE_NETWORK_LIS_ENABLED?.trim().toLowerCase();
  return v !== "false" && v !== "0";
}

function parsePostBody(raw: string, contentType: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  if (contentType.includes("json")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return {};
    }
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through to urlencoded */
  }

  const parsed = parseQuery(trimmed) as Record<string, unknown>;
  if (typeof parsed.ionData === "string") {
    try {
      parsed.ionData = JSON.parse(parsed.ionData);
    } catch {
      /* keep string */
    }
  }
  return parsed;
}

/**
 * HTTP listener for Diamond ProLyte Network LIS.
 *
 * The instrument POSTs JSON (or form-encoded) result packets to host IP:port.
 * Default port 5002 — separate from EDGE_ENGINE_PORT so config is IP + port only.
 */
@Injectable()
export class ProlyteNetworkIngestionDriver
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ProlyteNetworkIngestionDriver.name);
  private server: http.Server | null = null;

  constructor(
    private readonly ingestion: IngestionService,
    private readonly status: AnalyzerStatusService,
  ) {}

  onModuleInit() {
    if (!networkLisEnabled()) {
      this.status.markListening(ANALYZER_ID, {
        transport: "http",
        protocol: "prolyte_network_lis",
        listenTarget: "(PROLYTE_NETWORK_LIS_ENABLED=false)",
        listening: false,
      });
      this.logger.log(
        "ProLyte Network LIS skipped (PROLYTE_NETWORK_LIS_ENABLED=false)",
      );
      return;
    }

    const port = Number(process.env.PROLYTE_NETWORK_LIS_PORT ?? 5002);
    const host = process.env.PROLYTE_NETWORK_LIS_HOST ?? "0.0.0.0";

    this.server = http.createServer((req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "POST only" }));
        return;
      }

      this.status.markConnect(ANALYZER_ID);
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const contentType = req.headers["content-type"] ?? "";
        const body = parsePostBody(raw, contentType);
        const parsed = parseProlyteNetworkLis(body);

        if (!parsed.analytes.length && !parsed.barcode) {
          this.logger.debug(
            `ProLyte network POST ignored (calibration/empty): ${raw.slice(0, 200)}`,
          );
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, ignored: true }));
          this.status.markDisconnect(ANALYZER_ID);
          return;
        }

        void this.ingestion
          .ingest({
            analyzerId: ANALYZER_ID,
            transport: "http",
            protocol: "prolyte_network_lis",
            payload: raw,
            parsed,
          })
          .then((result) => {
            this.status.markSuccess(ANALYZER_ID, result.accessionNumber);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            this.status.markError(ANALYZER_ID, msg);
            this.logger.error(`ProLyte network ingest failed: ${msg}`);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: msg }));
          })
          .finally(() => {
            this.status.markDisconnect(ANALYZER_ID);
          });
      });
      req.on("error", (err) => {
        this.status.markError(ANALYZER_ID, err.message);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false }));
        }
      });
    });

    this.server.listen(port, host, () => {
      this.logger.log(
        `${ANALYZER_ID} Network LIS HTTP listener on ${host}:${port}`,
      );
      this.status.markListening(ANALYZER_ID, {
        transport: "http",
        protocol: "prolyte_network_lis",
        listenTarget: `${host}:${port}`,
        listening: true,
      });
    });

    this.server.on("error", (err) => {
      this.logger.error(`ProLyte Network LIS server error: ${err.message}`);
      this.status.markError(ANALYZER_ID, err.message);
    });
  }

  onModuleDestroy() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
