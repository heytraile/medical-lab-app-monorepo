import {
  mapInstrumentFlag,
  type ParsedAnalyte,
  type ParsedInstrumentMessage,
} from "../types";

/**
 * Diamond Diagnostics ProLyte — real unidirectional RS-232 ASCII blocks.
 *
 * Serial: 9600 8N1 (older firmware may default to 1200), no flow control, no ASTM handshake.
 * Lines end with CRLF (or CR). Block assembly on the edge uses idle timeout between lines.
 */

export const PROLYTE_ANALYTES = [
  {
    testCode: "NA",
    name: "Sodium",
    units: "mmol/L",
    low: 136,
    high: 145,
    keys: ["NA+", "NA"],
  },
  {
    testCode: "K",
    name: "Potassium",
    units: "mmol/L",
    low: 3.5,
    high: 5.1,
    keys: ["K+", "K"],
  },
  {
    testCode: "CL",
    name: "Chloride",
    units: "mmol/L",
    low: 98,
    high: 107,
    keys: ["CL-", "CL"],
  },
  {
    testCode: "LI",
    name: "Lithium",
    units: "mmol/L",
    low: 0.4,
    high: 1.2,
    keys: ["LI+", "LI"],
  },
] as const;

/** @deprecated Prefer PROLYTE_ANALYTES — kept name for any external import. */
export const PROLYTE_FIELD_MAP = PROLYTE_ANALYTES;

/**
 * Parse a complete ProLyte multi-line ASCII result block.
 *
 * Example:
 * DATE: 2026-08-26  TIME: 08:30
 * SAMPLE: SEQ-001
 * Na+:  140.2  mmol/L
 * K+:     4.15 mmol/L
 * Cl-:  102.0  mmol/L
 * Li+:    0.85 mmol/L
 */
export function parseProlyteBlock(text: string): ParsedInstrumentMessage {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let barcode: string | undefined;
  const analytes: ParsedAnalyte[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const sample = matchLabeled(line, "SAMPLE");
    if (sample) {
      barcode = sample.trim() || undefined;
      continue;
    }

    // DATE / TIME left in rawRecords only for this pass
    if (matchLabeled(line, "DATE") || matchLabeled(line, "TIME")) {
      continue;
    }

    const analyte = parseAnalyteLine(line);
    if (analyte && !seen.has(analyte.testCode)) {
      seen.add(analyte.testCode);
      analytes.push(analyte);
    }
  }

  return {
    barcode,
    analytes,
    rawRecords: lines,
  };
}

/** Alias: full block or single-line payload both go through the block parser. */
export function parseProlyteLine(text: string): ParsedInstrumentMessage {
  return parseProlyteBlock(text);
}

function matchLabeled(line: string, label: string): string | undefined {
  const re = new RegExp(`^${label}\\s*:\\s*(.+)$`, "i");
  const m = line.match(re);
  return m?.[1];
}

function parseAnalyteLine(line: string): ParsedAnalyte | null {
  // "Na+:  140.2  mmol/L" or "K+ 4.15 mmol/L"
  const m = line.match(
    /^([A-Za-z]{1,3}[+\-]?)\s*:?\s*(-?[\d.]+)\s*([A-Za-z/%*0-9]*)\s*$/,
  );
  if (!m) return null;

  const key = m[1]!.replace(/\s/g, "").toUpperCase();
  const value = m[2]!;
  const unitsRaw = m[3]?.trim();

  const def = PROLYTE_ANALYTES.find((a) =>
    (a.keys as readonly string[]).includes(key),
  );
  if (!def) return null;

  const num = Number(value);
  const flag = mapInstrumentFlag(
    undefined,
    Number.isFinite(num) ? num : undefined,
    def.low,
    def.high,
  );

  return {
    testCode: def.testCode,
    value,
    units: unitsRaw || def.units,
    referenceLow: def.low,
    referenceHigh: def.high,
    flag,
  };
}

/** Build a ProLyte-style multi-line ASCII block for simulators. */
export function formatProlyteBlock(opts: {
  barcode: string;
  na: number | string;
  k: number | string;
  cl: number | string;
  li?: number | string;
  date?: string;
  time?: string;
}): string {
  const now = new Date();
  const date =
    opts.date ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const time =
    opts.time ??
    `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const lines = [
    `DATE: ${date}  TIME: ${time}`,
    `SAMPLE: ${opts.barcode}`,
    `Na+:  ${opts.na}  mmol/L`,
    `K+:     ${opts.k} mmol/L`,
    `Cl-:  ${opts.cl}  mmol/L`,
  ];
  if (opts.li !== undefined && opts.li !== "") {
    lines.push(`Li+:    ${opts.li} mmol/L`);
  }
  return lines.join("\r\n") + "\r\n";
}

/** @deprecated Use formatProlyteBlock */
export function formatProlyteLine(opts: {
  barcode: string;
  na: number | string;
  k: number | string;
  cl: number | string;
  li?: number | string;
}): string {
  return formatProlyteBlock(opts);
}
