import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ASTM,
  AstmReceiverSession,
  buildAstmFrame,
  parseAstmFrame,
  parseE1394,
  parseOru,
  buildAck,
  parseQry,
  buildOrderResponse,
  parseProlyteLine,
  parseProlyteBlock,
  formatProlyteBlock,
  wrapMllp,
  unwrapMllp,
} from "../src/index";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8").replace(/\n$/, "");
}

describe("parseE1394", () => {
  it("parses Sysmex CBC fixture", () => {
    const text = loadFixture("sysmex-cbc.txt").replace(/\n/g, "\r");
    const msg = parseE1394(text);
    expect(msg.barcode).toBe("ACC-CBC-001");
    expect(msg.analytes.map((a) => a.testCode)).toEqual([
      "WBC",
      "RBC",
      "HGB",
      "HCT",
      "PLT",
    ]);
    expect(msg.analytes[0]).toMatchObject({
      value: "6.5",
      units: "10*3/uL",
      flag: "normal",
      referenceLow: 4,
      referenceHigh: 11,
    });
  });

  it("parses Mindray chem with high flag", () => {
    const text = loadFixture("mindray-chem.txt").replace(/\n/g, "\r");
    const msg = parseE1394(text);
    expect(msg.barcode).toBe("ACC-CHEM-001");
    const ast = msg.analytes.find((a) => a.testCode === "AST");
    expect(ast?.flag).toBe("high");
    expect(ast?.value).toBe("42");
  });
});

describe("AstmReceiverSession", () => {
  it("ENQ → frames → EOT yields records and ACKs", () => {
    const session = new AstmReceiverSession();
    const records = [
      "H|\\^&|||XS-1000i",
      "O|1|ACC-CBC-001||^^^CBC",
      "R|1|^^^WBC|6.5|10*3/uL|4.0-11.0|N||F",
      "L|1|N",
    ];

    const out1 = session.push(Buffer.from([ASTM.ENQ]));
    expect(out1).toEqual([{ type: "send", bytes: Buffer.from([ASTM.ACK]) }]);

    const allRecords: string[] = [];
    for (let i = 0; i < records.length; i++) {
      const frame = buildAstmFrame(i + 1, records[i]!, i === records.length - 1);
      const events = session.push(frame);
      expect(events.some((e) => e.type === "send")).toBe(true);
    }

    const done = session.push(Buffer.from([ASTM.EOT]));
    const msg = done.find((e) => e.type === "message");
    expect(msg?.type).toBe("message");
    if (msg?.type === "message") {
      allRecords.push(...msg.records);
    }
    expect(allRecords).toEqual(records);
  });

  it("NAKs bad checksum and recovers on retry", () => {
    const session = new AstmReceiverSession();
    session.push(Buffer.from([ASTM.ENQ]));

    const good = buildAstmFrame(1, "H|\\^&|||TEST", true);
    const bad = Buffer.from(good);
    bad[bad.length - 4] = bad[bad.length - 4]! === 0x30 ? 0x31 : 0x30; // flip checksum

    const nak = session.push(bad);
    expect(nak[0]).toEqual({ type: "send", bytes: Buffer.from([ASTM.NAK]) });

    const ack = session.push(good);
    expect(ack[0]).toEqual({ type: "send", bytes: Buffer.from([ASTM.ACK]) });

    const done = session.push(Buffer.from([ASTM.EOT]));
    expect(done.find((e) => e.type === "message")).toBeTruthy();
  });

  it("handles split TCP chunks", () => {
    const session = new AstmReceiverSession();
    const frame = buildAstmFrame(1, "O|1|SPLIT-001||^^^CBC", true);
    const wire = Buffer.concat([
      Buffer.from([ASTM.ENQ]),
      frame,
      Buffer.from([ASTM.EOT]),
    ]);

    const mid = Math.floor(wire.length / 2);
    const a = session.push(wire.subarray(0, mid));
    const b = session.push(wire.subarray(mid));
    const all = [...a, ...b];
    expect(all.some((e) => e.type === "message")).toBe(true);
    const msg = all.find((e) => e.type === "message");
    if (msg?.type === "message") {
      expect(msg.records[0]).toContain("SPLIT-001");
    }
  });
});

describe("parseAstmFrame", () => {
  it("rejects malformed frame", () => {
    expect(parseAstmFrame(Buffer.from("not a frame"))).toBeNull();
  });
});

describe("HL7 ORU / ACK", () => {
  it("parses iFlash TSH fixture", () => {
    const text = loadFixture("iflash-tsh.txt").replace(/\n/g, "\r");
    const msg = parseOru(text);
    expect(msg.barcode).toBe("ACC-TSH-001");
    expect(msg.analytes[0]).toMatchObject({
      testCode: "TSH",
      value: "2.4",
      units: "mIU/L",
      flag: "normal",
    });
  });

  it("builds ACK from ORU", () => {
    const text = loadFixture("iflash-tsh.txt").replace(/\n/g, "\r");
    const ack = buildAck(text);
    expect(ack).toContain("ACK^R01");
    expect(ack).toContain("MSA|AA|MSG001");
  });

  it("MLLP wrap/unwrap round-trip", () => {
    const text = loadFixture("iflash-tsh.txt").replace(/\n/g, "\r");
    const wrapped = wrapMllp(text);
    const { messages } = unwrapMllp(wrapped);
    expect(messages[0]).toBe(text);
  });
});

describe("HL7 QRY", () => {
  it("parses QRY and builds order response", () => {
    const qry = [
      "MSH|^~\\&|iFlash1200|YHLO|DRAX_LIS|DRAX|20240101120300||QRY^Q02|Q001|P|2.5",
      "QRD|20240101120300|R|I|Q001||||ACC-TSH-001",
    ].join("\r");
    const parsed = parseQry(qry);
    expect(parsed.barcode).toBe("ACC-TSH-001");
    const rsp = buildOrderResponse({
      originalQry: qry,
      barcode: "ACC-TSH-001",
      orderedTests: [{ code: "TSH", name: "Thyroid Stimulating Hormone" }],
    });
    expect(rsp).toContain("DSR^Q03");
    expect(rsp).toContain("TSH^Thyroid Stimulating Hormone");
  });
});

describe("ProLyte ASCII", () => {
  it("parses multi-line electrolyte fixture with Li+", () => {
    const block = loadFixture("prolyte-electrolytes.txt");
    const msg = parseProlyteBlock(block);
    expect(msg.barcode).toBe("ACC-ELYTE-001");
    expect(msg.analytes.map((a) => a.testCode)).toEqual([
      "NA",
      "K",
      "CL",
      "LI",
    ]);
    expect(msg.analytes[0]).toMatchObject({
      value: "140.2",
      units: "mmol/L",
      flag: "normal",
    });
    expect(msg.analytes.find((a) => a.testCode === "LI")?.value).toBe("0.85");
  });

  it("parses barcode-gun SAMPLE without Li channel", () => {
    const block = [
      "DATE: 2026-08-26  TIME: 09:00",
      "SAMPLE: DH20260826042",
      "Na+:  138.0  mmol/L",
      "K+:     3.90 mmol/L",
      "Cl-:  100.0  mmol/L",
    ].join("\r\n");
    const msg = parseProlyteBlock(block);
    expect(msg.barcode).toBe("DH20260826042");
    expect(msg.analytes.map((a) => a.testCode)).toEqual(["NA", "K", "CL"]);
  });

  it("round-trips formatProlyteBlock", () => {
    const text = formatProlyteBlock({
      barcode: "SEQ-99",
      na: 140,
      k: 4.1,
      cl: 102,
      li: 0.8,
      date: "2026-01-01",
      time: "12:00",
    });
    const msg = parseProlyteBlock(text);
    expect(msg.barcode).toBe("SEQ-99");
    expect(msg.analytes).toHaveLength(4);
  });
});
