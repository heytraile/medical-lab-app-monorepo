import {
  mapInstrumentFlag,
  type ParsedAnalyte,
  type ParsedInstrumentMessage,
} from "../types";
import { PROLYTE_ANALYTES } from "./prolyte";

/** Sample types that are not patient results (Diamond manual §4.5.8). */
const SKIP_SAMPLE_TYPES = new Set([
  "00",
  "0",
  "01",
  "1",
  "04",
  "4",
  "05",
  "5",
  "06",
  "6",
  "07",
  "7",
]);

const ION_KEY_TO_CODE: Record<string, string> = {
  NA: "NA",
  K: "K",
  CL: "CL",
  LI: "LI",
};

type IonReading = {
  conc?: string;
  strUnits?: string;
  units?: string;
  strFlag?: string;
  flag?: string;
  min?: string;
  max?: string;
  name?: string;
};

/**
 * Diamond ProLyte Network LIS — HTTP POST body (JSON or urlencoded).
 *
 * Manual §4.5.7: `pId`, `sampleType`, `ionData` (Na/K/Cl/Li objects with `conc`).
 */
export function parseProlyteNetworkLis(body: unknown): ParsedInstrumentMessage {
  const root = normalizeBody(body);
  const sampleType = stringField(root.sampleType);
  if (sampleType && SKIP_SAMPLE_TYPES.has(sampleType)) {
    return { analytes: [], rawRecords: [`sampleType:${sampleType}`] };
  }

  const barcode = stringField(root.pId)?.trim() || undefined;
  const ionData = normalizeIonData(root.ionData);
  const analytes: ParsedAnalyte[] = [];
  const seen = new Set<string>();

  for (const [key, reading] of Object.entries(ionData)) {
    const testCode = ION_KEY_TO_CODE[key.toUpperCase().replace(/[^A-Z]/g, "")];
    if (!testCode || seen.has(testCode)) continue;

    const conc = stringField(reading.conc);
    if (conc == null || conc === "" || conc.includes("*") || !/^-?[\d.]+$/.test(conc)) {
      continue;
    }

    const def = PROLYTE_ANALYTES.find((a) => a.testCode === testCode);
    if (!def) continue;

    const num = Number(conc);
    const low = numField(reading.min) ?? def.low;
    const high = numField(reading.max) ?? def.high;
    const flagHint = stringField(reading.strFlag) ?? stringField(reading.flag);

    analytes.push({
      testCode,
      value: conc,
      units:
        stringField(reading.strUnits) ||
        stringField(reading.units) ||
        def.units,
      referenceLow: low,
      referenceHigh: high,
      flag: mapInstrumentFlag(
        flagHint,
        Number.isFinite(num) ? num : undefined,
        low,
        high,
      ),
    });
    seen.add(testCode);
  }

  return {
    barcode,
    analytes,
    rawRecords: [JSON.stringify(root)],
  };
}

/** ProLyte Network LIS often POSTs urlencoded flat keys like ionData[Na][conc]. */
function unflattenProlyteFormBody(
  flat: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const ionData: Record<string, Record<string, unknown>> = {};

  for (const [key, value] of Object.entries(flat)) {
    const ionMatch = /^ionData\[([^\]]+)\]\[([^\]]+)\]$/.exec(key);
    if (ionMatch) {
      const ion = ionMatch[1];
      const field = ionMatch[2];
      if (ion && field) {
        ionData[ion] ??= {};
        ionData[ion][field] = value;
      }
      continue;
    }
    out[key] = value;
  }

  if (Object.keys(ionData).length > 0) {
    out.ionData = ionData;
  }
  return out;
}

function normalizeBody(body: unknown): Record<string, unknown> {
  if (body == null) return {};
  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) return {};
    try {
      return normalizeBody(JSON.parse(trimmed));
    } catch {
      return {};
    }
  }
  if (typeof body !== "object" || Array.isArray(body)) return {};
  let obj = body as Record<string, unknown>;
  if (
    obj.ionData == null &&
    Object.keys(obj).some((k) => k.startsWith("ionData["))
  ) {
    obj = unflattenProlyteFormBody(obj);
  }
  if (typeof obj.ionData === "string") {
    try {
      return { ...obj, ionData: JSON.parse(obj.ionData) };
    } catch {
      return obj;
    }
  }
  return obj;
}

function normalizeIonData(raw: unknown): Record<string, IonReading> {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      return normalizeIonData(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, IonReading>;
}

function stringField(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function numField(value: unknown): number | undefined {
  const s = stringField(value);
  if (!s || !/^-?[\d.]+$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Build a Network LIS POST body for simulators and curl tests. */
export function formatProlyteNetworkLis(opts: {
  barcode: string;
  sampleType?: string;
  na: number | string;
  k: number | string;
  cl: number | string;
  li?: number | string;
}): Record<string, unknown> {
  const ion = (
    name: string,
    ionCode: string,
    conc: number | string,
    testCode: string,
  ) => {
    const def = PROLYTE_ANALYTES.find((a) => a.testCode === testCode)!;
    return {
      ion: ionCode,
      name,
      conc: String(conc),
      strUnits: def.units,
      min: String(def.low),
      max: String(def.high),
      strFlag: "",
    };
  };

  const ionData: Record<string, unknown> = {
    Na: ion("Na", "1", opts.na, "NA"),
    K: ion("K", "2", opts.k, "K"),
    Cl: ion("Cl", "3", opts.cl, "CL"),
  };
  if (opts.li !== undefined && opts.li !== "") {
    ionData.Li = ion("Li", "5", opts.li, "LI");
  }

  return {
    pId: opts.barcode,
    sampleType: opts.sampleType ?? "10",
    ionData,
    dt: String(Date.now()),
    correl: "0",
  };
}
