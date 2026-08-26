/**
 * ASTM E1381 control characters (data-link layer).
 * Full ENQ/ACK/STX/ETX/EOT state machine lands in Phase 1.
 */
export const ASTM = {
  ENQ: 0x05,
  ACK: 0x06,
  NAK: 0x15,
  EOT: 0x04,
  STX: 0x02,
  ETX: 0x03,
  ETB: 0x17,
  CR: 0x0d,
  LF: 0x0a,
} as const;

/**
 * Compute ASTM E1381 frame checksum.
 * Sum of bytes from FN through ETX (inclusive), modulo 256, as 2 hex chars.
 *
 * Frame layout: STX + FN + text + ETX|ETB + C1 + C2 + CR + LF
 */
export function astmChecksum(frameBody: string | Buffer): string {
  const buf =
    typeof frameBody === "string" ? Buffer.from(frameBody, "latin1") : frameBody;
  let sum = 0;
  for (const byte of buf) {
    sum = (sum + byte) & 0xff;
  }
  return sum.toString(16).toUpperCase().padStart(2, "0");
}

/**
 * Build a complete ASTM framed record ready to write to the wire.
 * @param frameNumber 0–7 frame counter
 * @param text ASTM E1394 record text (e.g. "H|\\^&|||...") without trailing CR
 * @param isLast if true use ETX, else ETB (intermediate frame)
 */
export function buildAstmFrame(
  frameNumber: number,
  text: string,
  isLast = true,
): Buffer {
  const fn = String(frameNumber % 8);
  const end = Buffer.from([isLast ? ASTM.ETX : ASTM.ETB]);
  const body = Buffer.concat([
    Buffer.from(fn, "latin1"),
    Buffer.from(text, "latin1"),
    Buffer.from([ASTM.CR]),
    end,
  ]);
  const cs = astmChecksum(body);
  return Buffer.concat([
    Buffer.from([ASTM.STX]),
    body,
    Buffer.from(cs, "ascii"),
    Buffer.from([ASTM.CR, ASTM.LF]),
  ]);
}

/**
 * Parse and validate an ASTM frame buffer.
 * Returns the payload text (without FN / CR) or null if checksum fails / malformed.
 */
export function parseAstmFrame(
  frame: Buffer,
): { frameNumber: number; text: string; isLast: boolean } | null {
  if (frame.length < 7 || frame[0] !== ASTM.STX) return null;
  const endIdx = frame.findIndex(
    (b, i) => i > 0 && (b === ASTM.ETX || b === ASTM.ETB),
  );
  if (endIdx < 0) return null;
  const body = frame.subarray(1, endIdx + 1);
  const cs = frame.subarray(endIdx + 1, endIdx + 3).toString("ascii");
  if (astmChecksum(body) !== cs.toUpperCase()) return null;
  const frameNumber = Number(String.fromCharCode(frame[1]!));
  // text is between FN and the CR before ETX/ETB
  const textEnd = endIdx - 1; // CR
  const text = frame.subarray(2, textEnd).toString("latin1");
  return {
    frameNumber,
    text,
    isLast: frame[endIdx] === ASTM.ETX,
  };
}
