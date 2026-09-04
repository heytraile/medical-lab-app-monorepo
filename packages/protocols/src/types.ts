/**
 * Parsed analyte from an ASTM E1394 R record or HL7 OBX.
 */
export type ParsedAnalyte = {
  testCode: string;
  value: string;
  units?: string;
  referenceLow?: number;
  referenceHigh?: number;
  /** Instrument flag char or mapped: normal | low | high | critical_* | abnormal | unknown */
  flag: string;
};

export type ParsedInstrumentMessage = {
  barcode?: string;
  patientId?: string;
  patientName?: string;
  analytes: ParsedAnalyte[];
  rawRecords: string[];
};

export type ResultFlagName =
  | "normal"
  | "low"
  | "high"
  | "critical_low"
  | "critical_high"
  | "abnormal"
  | "unknown";

/** Compare numeric value to reference range when available. */
function flagFromRange(
  value?: number,
  low?: number,
  high?: number,
): ResultFlagName | null {
  if (
    value === undefined ||
    Number.isNaN(value) ||
    low === undefined ||
    high === undefined
  ) {
    return null;
  }
  if (value < low) return "low";
  if (value > high) return "high";
  return "normal";
}

/** Map ASTM/HL7 abnormal flags to our canonical flag names. */
export function mapInstrumentFlag(
  raw: string | undefined,
  value?: number,
  low?: number,
  high?: number,
): ResultFlagName {
  const f = (raw ?? "").trim().toUpperCase();
  if (f === "L" || f === "Below") return "low";
  if (f === "H" || f === "Above") return "high";
  if (f === "LL" || f === "<") return "critical_low";
  if (f === "HH" || f === ">") return "critical_high";
  if (f === "A" || f === "AA") return "abnormal";
  if (f === "N" || f === "NORMAL" || f === "") {
    const fromRange = flagFromRange(value, low, high);
    if (fromRange) return fromRange;
    return f === "N" || f === "NORMAL" ? "normal" : "unknown";
  }
  const fromRange = flagFromRange(value, low, high);
  if (fromRange) return fromRange;
  return "unknown";
}

export function parseRefRange(
  field: string | undefined,
): { low?: number; high?: number } {
  if (!field) return {};
  // "4.0-11.0" or "4.0 - 11.0" or "4.0^11.0"
  const m = field.match(/(-?[\d.]+)\s*[-–^]\s*(-?[\d.]+)/);
  if (!m) return {};
  const low = Number(m[1]);
  const high = Number(m[2]);
  return {
    low: Number.isFinite(low) ? low : undefined,
    high: Number.isFinite(high) ? high : undefined,
  };
}
