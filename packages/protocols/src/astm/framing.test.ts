import { describe, expect, it } from "vitest";
import {
  astmChecksum,
  buildAstmFrame,
  parseAstmFrame,
  wrapMllp,
  unwrapMllp,
} from "../index";

describe("ASTM framing", () => {
  it("computes modulo-256 checksum as 2 hex chars", () => {
    const body = Buffer.from([0x31, 0x48, 0x0d, 0x03]);
    expect(astmChecksum(body)).toMatch(/^[0-9A-F]{2}$/);
  });

  it("round-trips a frame", () => {
    const text = "H|\\^&|||HOST|||||LIS||P|1";
    const frame = buildAstmFrame(1, text, true);
    const parsed = parseAstmFrame(frame);
    expect(parsed).not.toBeNull();
    expect(parsed!.frameNumber).toBe(1);
    expect(parsed!.text).toBe(text);
    expect(parsed!.isLast).toBe(true);
  });
});

describe("MLLP framing", () => {
  it("wraps and unwraps an HL7 message", () => {
    const msg = "MSH|^~\\&|YHLO|iFlash|||20260101120000||ORU^R01|1|P|2.3.1";
    const wrapped = wrapMllp(msg);
    expect(wrapped[0]).toBe(0x0b);
    const { messages, remainder } = unwrapMllp(wrapped);
    expect(messages).toEqual([msg]);
    expect(remainder.length).toBe(0);
  });

  it("handles partial buffers", () => {
    const msg = "MSH|partial";
    const wrapped = wrapMllp(msg);
    const half = wrapped.subarray(0, wrapped.length - 2);
    const { messages, remainder } = unwrapMllp(half);
    expect(messages).toEqual([]);
    expect(remainder[0]).toBe(0x0b);
  });
});
