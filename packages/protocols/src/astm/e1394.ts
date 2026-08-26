import {
  mapInstrumentFlag,
  parseRefRange,
  type ParsedAnalyte,
  type ParsedInstrumentMessage,
} from "../types";

/**
 * Parse ASTM E1394 record text (one or more H/P/O/R/L lines)
 * into barcode + analytes.
 *
 * R record (typical): R|seq|^^^TEST|value|units|refLow-refHigh|flag|...
 */
export function parseE1394(text: string): ParsedInstrumentMessage {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let barcode: string | undefined;
  let patientId: string | undefined;
  let patientName: string | undefined;
  const analytes: ParsedAnalyte[] = [];

  for (const line of lines) {
    const type = line[0];
    const fields = line.split("|");

    if (type === "P") {
      // P|1||PATID||Last^First
      patientId = emptyToUndef(fields[3]);
      const name = fields[5] ?? "";
      if (name) {
        const [last, first] = name.split("^");
        patientName = [first, last].filter(Boolean).join(" ").trim() || name;
      }
    } else if (type === "O") {
      // O|1|SAMPLEID|^tray^cup|^^^CBC|...
      const sampleField = fields[2] ?? "";
      barcode = sampleField.split("^")[0] || undefined;
    } else if (type === "R") {
      const analyte = parseRRecord(fields);
      if (analyte) analytes.push(analyte);
    }
  }

  return {
    barcode,
    patientId,
    patientName,
    analytes,
    rawRecords: lines,
  };
}

function parseRRecord(fields: string[]): ParsedAnalyte | null {
  // R|1|^^^WBC|6.5|10*3/uL|4.0-11.0|N||F
  const universal = fields[2] ?? "";
  const parts = universal.split("^").filter(Boolean);
  const testCode = parts[parts.length - 1];
  if (!testCode) return null;

  const value = fields[3] ?? "";
  const units = emptyToUndef(fields[4]);
  const { low, high } = parseRefRange(fields[5]);
  const rawFlag = fields[6];
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

function emptyToUndef(s: string | undefined): string | undefined {
  if (!s || !s.trim()) return undefined;
  return s.trim();
}
