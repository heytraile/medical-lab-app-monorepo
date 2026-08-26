/** MLLP (Minimal Lower Layer Protocol) framing for HL7 v2. */

export const MLLP = {
  SB: 0x0b, // start block <VT>
  EB: 0x1c, // end block <FS>
  CR: 0x0d,
} as const;

/** Wrap an HL7 message string in MLLP: VT + message + FS + CR */
export function wrapMllp(message: string): Buffer {
  return Buffer.concat([
    Buffer.from([MLLP.SB]),
    Buffer.from(message, "utf8"),
    Buffer.from([MLLP.EB, MLLP.CR]),
  ]);
}

/**
 * Extract complete MLLP messages from a byte buffer.
 * Returns messages and any trailing incomplete bytes.
 */
export function unwrapMllp(buffer: Buffer): {
  messages: string[];
  remainder: Buffer;
} {
  const messages: string[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    const start = buffer.indexOf(MLLP.SB, offset);
    if (start < 0) {
      return { messages, remainder: Buffer.alloc(0) };
    }
    const end = buffer.indexOf(MLLP.EB, start + 1);
    if (end < 0) {
      return { messages, remainder: buffer.subarray(start) };
    }
    // expect CR after EB
    const msg = buffer.subarray(start + 1, end).toString("utf8");
    messages.push(msg);
    offset = end + 1;
    if (offset < buffer.length && buffer[offset] === MLLP.CR) {
      offset += 1;
    }
  }

  return { messages, remainder: Buffer.alloc(0) };
}
