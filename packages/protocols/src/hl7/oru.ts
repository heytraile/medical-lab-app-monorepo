import {
  mapInstrumentFlag,
  parseRefRange,
  type ParsedAnalyte,
  type ParsedInstrumentMessage,
} from "../types";

/**
 * Parse HL7 v2 ORU^R01 message text (segments separated by CR).
 */
export function parseOru(message: string): ParsedInstrumentMessage {
  const segments = message
    .split(/\r\n|\r|\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  let barcode: string | undefined;
  let patientId: string | undefined;
  let patientName: string | undefined;
  const analytes: ParsedAnalyte[] = [];

  for (const seg of segments) {
    const fields = seg.split("|");
    const type = fields[0]?.slice(0, 3);

    if (type === "PID") {
      patientId = emptyToUndef(fields[3]?.split("^")[0]);
      const name = fields[5] ?? "";
      if (name) {
        const [last, first] = name.split("^");
        patientName = [first, last].filter(Boolean).join(" ").trim() || name;
      }
    } else if (type === "OBR") {
      const id = (fields[2] || fields[3] || "").split("^")[0];
      if (id) barcode = id;
    } else if (type === "OBX") {
      const analyte = parseObx(fields);
      if (analyte) analytes.push(analyte);
    }
  }

  return {
    barcode,
    patientId,
    patientName,
    analytes,
    rawRecords: segments,
  };
}

function parseObx(fields: string[]): ParsedAnalyte | null {
  // OBX|1|NM|TSH^Thyroid Stimulating Hormone||2.4|mIU/L|0.4-4.0|N|||F
  const codeField = fields[3] ?? "";
  const testCode = codeField.split("^")[0];
  if (!testCode) return null;

  const value = fields[5] ?? "";
  const units = emptyToUndef((fields[6] ?? "").split("^")[0]);
  const { low, high } = parseRefRange(fields[7]);
  const rawFlag = fields[8];
  const num = Number(value);
  const flag = mapInstrumentFlag(
    rawFlag,
    Number.isFinite(num) ? num : undefined,
    low,
    high,
  );

  return {
    testCode,
    value,
    units,
    referenceLow: low,
    referenceHigh: high,
    flag,
  };
}

/**
 * Build ACK^R01 for an inbound ORU (or any message with MSH).
 */
export function buildAck(originalMessage: string, ackCode = "AA"): string {
  const msh = originalMessage
    .split(/\r\n|\r|\n/)
    .find((s) => s.startsWith("MSH|"));
  const fields = msh?.split("|") ?? [];
  const sendingApp = fields[2] ?? "ANALYZER";
  const sendingFac = fields[3] ?? "";
  const receivingApp = fields[4] ?? "DRAX_LIS";
  const receivingFac = fields[5] ?? "";
  const msgCtrl = fields[9] ?? String(Date.now());
  const version = fields[11] ?? "2.5";
  const ts = hl7Timestamp();

  // Swap sending/receiving for ACK
  return [
    `MSH|^~\\&|${receivingApp}|${receivingFac}|${sendingApp}|${sendingFac}|${ts}||ACK^R01|ACK${msgCtrl}|P|${version}`,
    `MSA|${ackCode}|${msgCtrl}`,
  ].join("\r");
}

function hl7Timestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

function emptyToUndef(s: string | undefined): string | undefined {
  if (!s || !s.trim()) return undefined;
  return s.trim();
}
