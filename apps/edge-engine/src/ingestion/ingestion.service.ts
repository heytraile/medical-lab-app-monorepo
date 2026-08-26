import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { SyncService } from "../sync/sync.service";
import { parseAstmFrame, unwrapMllp } from "@drax-lis/protocols";

export type IngestInput = {
  analyzerId: string;
  transport: "serial" | "tcp";
  protocol: "astm_e1381" | "astm_e1394" | "hl7_mllp" | "ascii_delimited";
  payload: Buffer | string;
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
   * Persist a raw analyzer frame, attempt a lightweight parse,
   * enqueue outbox, and notify the local bench UI.
   */
  async ingest(input: IngestInput) {
    const payloadStr =
      typeof input.payload === "string"
        ? input.payload
        : input.payload.toString("latin1");

    let parsedOk = false;
    let parseError: string | undefined;
    let accessionHint: string | undefined;
    const extractedResults: Array<{
      testCode: string;
      value: string;
      units?: string;
    }> = [];

    try {
      if (input.protocol === "hl7_mllp") {
        const buf =
          typeof input.payload === "string"
            ? Buffer.from(input.payload, "utf8")
            : input.payload;
        const { messages } = unwrapMllp(
          buf[0] === 0x0b
            ? buf
            : Buffer.concat([
                Buffer.from([0x0b]),
                buf,
                Buffer.from([0x1c, 0x0d]),
              ]),
        );
        const msg = messages[0] ?? payloadStr;
        accessionHint = this.extractHl7Barcode(msg);
        extractedResults.push(...this.extractHl7Obx(msg));
        parsedOk = true;
      } else if (
        input.protocol === "astm_e1381" ||
        input.protocol === "astm_e1394"
      ) {
        const buf =
          typeof input.payload === "string"
            ? Buffer.from(input.payload, "latin1")
            : input.payload;
        const text = this.astmSessionToText(buf, payloadStr);
        accessionHint = this.extractAstmBarcode(text);
        extractedResults.push(...this.extractAstmResults(text));
        parsedOk = true;
      } else {
        parsedOk = true;
      }
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Parse warning: ${parseError}`);
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

    const barcode = accessionHint ?? `UNK-${raw.id.slice(0, 8)}`;
    const accessionNumber = barcode;

    // Ensure specimen shell exists so results can attach
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

    const createdResults = [];
    for (const r of extractedResults) {
      const result = await this.prisma.result.create({
        data: {
          accessionNumber,
          barcode,
          analyzerId: input.analyzerId,
          testCode: r.testCode,
          value: r.value,
          units: r.units,
          observedAt: new Date(),
          rawMessageId: raw.id,
          flag: "unknown",
        },
      });
      createdResults.push(result);
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
          value: r.value,
          units: r.units,
        })),
      },
    });

    this.realtime.emitBenchEvent({
      type: "result.received",
      accessionNumber,
      barcode,
      analyzerId: input.analyzerId,
      resultCount: createdResults.length,
      at: new Date().toISOString(),
    });

    this.logger.log(
      `Ingested ${input.analyzerId} → ${barcode} (${createdResults.length} results)`,
    );

    return { rawMessageId: raw.id, accessionNumber, barcode, results: createdResults };
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
      // STX..ETX/ETB + 2 checksum chars + CR LF
      const frameEnd = Math.min(endIdx + 5, buf.length);
      const frame = buf.subarray(i, frameEnd);
      const parsed = parseAstmFrame(frame);
      if (parsed) {
        texts.push(parsed.text);
      } else {
        const textEnd = endIdx - 1; // CR before ETX
        if (textEnd > i + 1) {
          texts.push(buf.subarray(i + 2, textEnd).toString("latin1"));
        }
      }
      i = frameEnd;
    }

    if (texts.length) return texts.join("\r");

    // Normalize literal "\r" / "\n" from JSON curl payloads
    return fallback
      .replace(/\\r\\n/g, "\r")
      .replace(/\\r/g, "\r")
      .replace(/\\n/g, "\n");
  }

  private extractAstmBarcode(text: string): string | undefined {
    // O record: O|1|SAMPLEID|...
    const lines = text.split(/\r\n|\r|\n/);
    for (const line of lines) {
      if (line.startsWith("O|")) {
        const fields = line.split("|");
        const sampleId = fields[2]?.split("^")[0];
        if (sampleId) return sampleId;
      }
    }
    return undefined;
  }

  private extractAstmResults(
    text: string,
  ): Array<{ testCode: string; value: string; units?: string }> {
    const out: Array<{ testCode: string; value: string; units?: string }> = [];
    for (const line of text.split(/\r\n|\r|\n/)) {
      if (!line.startsWith("R|")) continue;
      const f = line.split("|");
      // R|1|^^^WBC|6.5|10*3/uL|...
      const testCode = f[2]?.split("^").filter(Boolean).pop() ?? "UNK";
      const value = f[3] ?? "";
      const units = f[4];
      out.push({ testCode, value, units });
    }
    return out;
  }

  private extractHl7Barcode(msg: string): string | undefined {
    for (const seg of msg.split(/\r/)) {
      if (seg.startsWith("OBR|")) {
        const f = seg.split("|");
        // OBR-2 or OBR-3
        const id = (f[2] || f[3] || "").split("^")[0];
        if (id) return id;
      }
    }
    return undefined;
  }

  private extractHl7Obx(
    msg: string,
  ): Array<{ testCode: string; value: string; units?: string }> {
    const out: Array<{ testCode: string; value: string; units?: string }> = [];
    for (const seg of msg.split(/\r/)) {
      if (!seg.startsWith("OBX|")) continue;
      const f = seg.split("|");
      const testCode = f[3]?.split("^")[0] ?? "UNK";
      const value = f[5] ?? "";
      const units = f[6]?.split("^")[0];
      out.push({ testCode, value, units });
    }
    return out;
  }
}
