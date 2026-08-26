import { ASTM, buildAstmFrame, parseAstmFrame } from "./framing";

export type AstmReceiverPhase =
  | "idle"
  | "established"
  | "receiving"
  | "done"
  | "error";

export type AstmReceiverOutput =
  | { type: "send"; bytes: Buffer }
  | { type: "message"; records: string[] }
  | { type: "error"; message: string };

/**
 * ASTM E1381 receiver (LIS / host side).
 *
 * Instrument sends ENQ → we ACK → frames → we ACK/NAK each → EOT → message complete.
 */
export class AstmReceiverSession {
  phase: AstmReceiverPhase = "idle";
  private buffer = Buffer.alloc(0);
  private records: string[] = [];
  private expectedFn = 1;
  private nakCount = 0;
  private readonly maxNak = 3;

  reset() {
    this.phase = "idle";
    this.buffer = Buffer.alloc(0);
    this.records = [];
    this.expectedFn = 1;
    this.nakCount = 0;
  }

  /** Feed inbound bytes; returns wire replies and/or completed messages. */
  push(chunk: Buffer): AstmReceiverOutput[] {
    const out: AstmReceiverOutput[] = [];
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length > 0) {
      if (this.phase === "idle" || this.phase === "done") {
        const idx = this.buffer.indexOf(ASTM.ENQ);
        if (idx < 0) {
          // discard noise until ENQ
          this.buffer = Buffer.alloc(0);
          break;
        }
        this.buffer = this.buffer.subarray(idx + 1);
        this.phase = "established";
        this.records = [];
        this.expectedFn = 1;
        this.nakCount = 0;
        out.push({ type: "send", bytes: Buffer.from([ASTM.ACK]) });
        continue;
      }

      if (this.phase === "established" || this.phase === "receiving") {
        // EOT ends the transfer
        if (this.buffer[0] === ASTM.EOT) {
          this.buffer = this.buffer.subarray(1);
          this.phase = "done";
          if (this.records.length) {
            out.push({ type: "message", records: [...this.records] });
          }
          this.records = [];
          this.phase = "idle";
          continue;
        }

        // Need STX to start a frame
        const stx = this.buffer.indexOf(ASTM.STX);
        if (stx < 0) {
          // maybe another ENQ mid-stream
          if (this.buffer.includes(ASTM.ENQ)) {
            const e = this.buffer.indexOf(ASTM.ENQ);
            this.buffer = this.buffer.subarray(e);
            this.phase = "idle";
            continue;
          }
          break;
        }
        if (stx > 0) {
          this.buffer = this.buffer.subarray(stx);
        }

        // Frame ends with checksum + CR LF after ETX/ETB
        const endCtrl = findEtbOrEtx(this.buffer, 1);
        if (endCtrl < 0) break;
        const frameEnd = endCtrl + 5; // ETX + 2 cs + CR + LF
        if (this.buffer.length < frameEnd) break;

        const frame = this.buffer.subarray(0, frameEnd);
        this.buffer = this.buffer.subarray(frameEnd);

        const parsed = parseAstmFrame(frame);
        if (!parsed) {
          this.nakCount += 1;
          out.push({ type: "send", bytes: Buffer.from([ASTM.NAK]) });
          if (this.nakCount >= this.maxNak) {
            this.phase = "error";
            out.push({
              type: "error",
              message: "ASTM frame NAK limit exceeded",
            });
            this.reset();
          }
          continue;
        }

        this.nakCount = 0;
        this.phase = "receiving";
        this.records.push(parsed.text);
        this.expectedFn = (parsed.frameNumber % 8) + 1;
        out.push({ type: "send", bytes: Buffer.from([ASTM.ACK]) });

        // Keep receiving until EOT even after last (ETX) frame
        void this.expectedFn;
        continue;
      }

      break;
    }

    return out;
  }
}

function findEtbOrEtx(buf: Buffer, from: number): number {
  for (let i = from; i < buf.length; i++) {
    if (buf[i] === ASTM.ETX || buf[i] === ASTM.ETB) return i;
  }
  return -1;
}

/**
 * Send an ASTM E1381 session as the instrument (client) side.
 * Waits for ACK after ENQ and after each frame.
 */
export async function sendAstmSession(opts: {
  write: (buf: Buffer) => void | Promise<void>;
  waitForAck: (timeoutMs?: number) => Promise<boolean>;
  records: string[];
  timeoutMs?: number;
}): Promise<void> {
  const timeout = opts.timeoutMs ?? 5000;
  await opts.write(Buffer.from([ASTM.ENQ]));
  if (!(await opts.waitForAck(timeout))) {
    throw new Error("ASTM ENQ not ACKed");
  }

  for (let i = 0; i < opts.records.length; i++) {
    const isLast = i === opts.records.length - 1;
    const frame = buildAstmFrame(i + 1, opts.records[i]!, isLast);
    await opts.write(frame);
    if (!(await opts.waitForAck(timeout))) {
      throw new Error(`ASTM frame ${i + 1} not ACKed`);
    }
  }

  await opts.write(Buffer.from([ASTM.EOT]));
}
