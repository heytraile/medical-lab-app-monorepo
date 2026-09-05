import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { SyncService } from "../sync/sync.service";
import { displayName } from "../patients/patient-normalize";
import type { BenchIngestItem } from "@drax-lis/contracts";
import {
  getCatalogDisplayName,
  parseOrderedTestCodes,
  pickCatalogCodeForResult,
  type AnalyzerId,
} from "@drax-lis/catalog";
import {
  parseAstmFrame,
  parseE1394,
  parseOru,
  parseProlyteBlock,
  unwrapMllp,
  type ParsedInstrumentMessage,
} from "@drax-lis/protocols";

export type IngestInput = {
  analyzerId: string;
  transport: "serial" | "tcp";
  protocol: "astm_e1381" | "astm_e1394" | "hl7_mllp" | "ascii_delimited";
  payload: Buffer | string;
  /** When TCP/serial drivers already ran protocol engines */
  parsed?: ParsedInstrumentMessage;
};

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SyncService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Persist a raw analyzer frame, parse via protocol engines when needed,
   * enqueue outbox, and notify the local bench UI.
   */
  async ingest(input: IngestInput) {
    const payloadStr =
      typeof input.payload === "string"
        ? input.payload
        : input.payload.toString("latin1");

    let parsedOk = false;
    let parseError: string | undefined;
    let message: ParsedInstrumentMessage | undefined = input.parsed;

    try {
      if (!message) {
        message = this.parsePayload(input, payloadStr);
      }
      parsedOk = true;
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Parse warning: ${parseError}`);
      message = { analytes: [], rawRecords: [] };
    }

    const raw = await this.prisma.rawMessage.create({
      data: {
        analyzerId: input.analyzerId,
        transport: input.transport,
        protocol: input.protocol,
        payload: payloadStr,
        parsedOk,
        parseError,
      },
    });

    const barcode = message.barcode ?? `UNK-${raw.id.slice(0, 8)}`;
    const accessionNumber = barcode;

    const existingSpecimen = await this.prisma.specimen.findUnique({
      where: { accessionNumber },
    });

    await this.prisma.specimen.upsert({
      where: { accessionNumber },
      create: {
        accessionNumber,
        barcode,
        status: "in_progress",
        orderedTestsJson: "[]",
      },
      update: { status: "partial" },
    });

    const orderedCatalogCodes = parseOrderedTestCodes(
      existingSpecimen?.orderedTestsJson,
    );
    const analyzerId = input.analyzerId as AnalyzerId;

    const createdResults = [];
    const notifiableItems: BenchIngestItem[] = [];
    for (const r of message.analytes) {
      const mapped = pickCatalogCodeForResult(
        analyzerId,
        r.testCode,
        orderedCatalogCodes,
      );
      const catalogCode = mapped.catalogCode;
      const instrumentTestCode = mapped.instrumentCode;
      const testName = getCatalogDisplayName(catalogCode);

      const existing = await this.prisma.result.findFirst({
        where: {
          accessionNumber,
          testCode: catalogCode,
          analyzerId: input.analyzerId,
        },
        orderBy: { observedAt: "desc" },
      });

      const nextFlag = r.flag || "unknown";

      if (existing) {
        // Retransmit / update: refresh values. Do not clobber a released result.
        if (existing.status === "released") {
          this.logger.warn(
            `Skip update for released ${accessionNumber}/${catalogCode} (${input.analyzerId})`,
          );
          createdResults.push(existing);
          continue;
        }
        const updated = await this.prisma.result.update({
          where: { id: existing.id },
          data: {
            barcode,
            orderedTestCode: catalogCode,
            resultComponentCode: null,
            testName,
            instrumentTestCode,
            value: r.value,
            units: r.units,
            referenceLow: r.referenceLow,
            referenceHigh: r.referenceHigh,
            flag: nextFlag,
            status: existing.status || "pending_review",
            // Keep first observation time so Bench sort (newest-first) does not thrash on retransmits.
            rawMessageId: raw.id,
          },
        });
        createdResults.push(updated);
        if (
          this.isFlagEscalation(existing.flag, nextFlag)
        ) {
          notifiableItems.push({
            id: updated.id,
            testCode: updated.testCode,
            testName: updated.testName,
            value: updated.value,
            units: updated.units,
            flag: updated.flag,
            status: updated.status,
            kind: "escalated",
          });
        }
      } else {
        const result = await this.prisma.result.create({
          data: {
            accessionNumber,
            barcode,
            analyzerId: input.analyzerId,
            testCode: catalogCode,
            orderedTestCode: catalogCode,
            instrumentTestCode,
            testName,
            value: r.value,
            units: r.units,
            referenceLow: r.referenceLow,
            referenceHigh: r.referenceHigh,
            flag: nextFlag,
            status: "pending_review",
            observedAt: new Date(),
            rawMessageId: raw.id,
          },
        });
        createdResults.push(result);
        notifiableItems.push({
          id: result.id,
          testCode: result.testCode,
          testName: result.testName,
          value: result.value,
          units: result.units,
          flag: result.flag,
          status: result.status,
          kind: "created",
        });
      }
    }

    await this.sync.enqueue({
      type: createdResults.length ? "result.batch" : "result.received",
      payload: {
        rawMessageId: raw.id,
        analyzerId: input.analyzerId,
        accessionNumber,
        barcode,
        results: createdResults.map((r) => ({
          id: r.id,
          testCode: r.testCode,
          orderedTestCode: r.orderedTestCode,
          resultComponentCode: r.resultComponentCode,
          testName: r.testName,
          value: r.value,
          units: r.units,
          referenceLow: r.referenceLow,
          referenceHigh: r.referenceHigh,
          flag: r.flag,
          status: r.status,
          observedAt: r.observedAt.toISOString(),
        })),
      },
    });

    if (notifiableItems.length) {
      const specimen = await this.prisma.specimen.findUnique({
        where: { accessionNumber },
        include: { patient: true },
      });
      let patientDisplayName: string | undefined;
      if (specimen?.patient) {
        patientDisplayName = displayName(specimen.patient);
      } else if (specimen?.patientJson) {
        try {
          const snap = JSON.parse(specimen.patientJson) as {
            firstName?: string;
            lastName?: string;
            middleName?: string | null;
          };
          if (snap.firstName && snap.lastName) {
            patientDisplayName = displayName({
              firstName: snap.firstName,
              lastName: snap.lastName,
              middleName: snap.middleName,
            });
          }
        } catch {
          /* ignore */
        }
      }

      this.realtime.emitBenchEvent({
        type: "results.ingested",
        at: new Date().toISOString(),
        accessionNumber,
        barcode,
        analyzerId: input.analyzerId,
        patientDisplayName,
        items: notifiableItems,
      });
    }

    this.logger.log(
      `Ingested ${input.analyzerId} → ${barcode} (${createdResults.length} results)`,
    );

    return {
      rawMessageId: raw.id,
      accessionNumber,
      barcode,
      results: createdResults,
    };
  }

  /** Notify when flag moves into high / critical territory. */
  private isFlagEscalation(before: string, after: string): boolean {
    const tier = (flag: string) => {
      if (flag === "critical_high" || flag === "critical_low") return 3;
      if (flag === "high") return 2;
      return 0;
    };
    const prev = tier(before);
    const next = tier(after);
    return next >= 2 && next > prev;
  }

  private parsePayload(
    input: IngestInput,
    payloadStr: string,
  ): ParsedInstrumentMessage {
    if (input.protocol === "hl7_mllp") {
      const buf =
        typeof input.payload === "string"
          ? Buffer.from(input.payload, "utf8")
          : input.payload;
      const framed =
        buf[0] === 0x0b
          ? buf
          : Buffer.concat([
              Buffer.from([0x0b]),
              buf,
              Buffer.from([0x1c, 0x0d]),
            ]);
      const { messages } = unwrapMllp(framed);
      return parseOru(messages[0] ?? payloadStr);
    }

    if (
      input.protocol === "astm_e1381" ||
      input.protocol === "astm_e1394"
    ) {
      const buf =
        typeof input.payload === "string"
          ? Buffer.from(input.payload, "latin1")
          : input.payload;
      const text = this.astmSessionToText(buf, payloadStr);
      return parseE1394(text);
    }

    if (input.protocol === "ascii_delimited") {
      return parseProlyteBlock(payloadStr);
    }

    return { analytes: [], rawRecords: [] };
  }

  /**
   * Pull E1394 record text out of a raw ASTM session
   * (ENQ + STX frames + EOT) or plain multi-line text.
   */
  private astmSessionToText(buf: Buffer, fallback: string): string {
    const texts: string[] = [];
    let i = 0;
    while (i < buf.length) {
      if (buf[i] !== 0x02) {
        i += 1;
        continue;
      }
      let endIdx = -1;
      for (let j = i + 1; j < buf.length; j++) {
        if (buf[j] === 0x03 || buf[j] === 0x17) {
          endIdx = j;
          break;
        }
      }
      if (endIdx < 0) break;
      const frameEnd = Math.min(endIdx + 5, buf.length);
      const frame = buf.subarray(i, frameEnd);
      const parsed = parseAstmFrame(frame);
      if (parsed) {
        texts.push(parsed.text);
      } else {
        const textEnd = endIdx - 1;
        if (textEnd > i + 1) {
          texts.push(buf.subarray(i + 2, textEnd).toString("latin1"));
        }
      }
      i = frameEnd;
    }

    if (texts.length) return texts.join("\r");

    return fallback
      .replace(/\\r\\n/g, "\r")
      .replace(/\\r/g, "\r")
      .replace(/\\n/g, "\n");
  }
}
