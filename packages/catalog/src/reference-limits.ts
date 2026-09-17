import { normalizeCode } from "./test-fulfillment";

export type ClinicalLimits = {
  referenceLow: number;
  referenceHigh: number;
  criticalLow?: number;
  criticalHigh?: number;
  units?: string;
  confirmationStatus: "provisional" | "lab_confirmed";
};

export type ClinicalFlag =
  | "normal"
  | "low"
  | "high"
  | "critical_low"
  | "critical_high"
  | "abnormal"
  | "unknown";

/**
 * Provisional reference and panic limits per result identity.
 * Key: `ORDERED:COMPONENT` (e.g. ELECTROLYTES:NA) or plain catalog code.
 */
export const CLINICAL_LIMITS: Record<string, ClinicalLimits> = {
  "ELECTROLYTES:NA": {
    referenceLow: 136,
    referenceHigh: 145,
    criticalLow: 120,
    criticalHigh: 160,
    units: "mmol/L",
    confirmationStatus: "provisional",
  },
  "ELECTROLYTES:K": {
    referenceLow: 3.5,
    referenceHigh: 5.1,
    criticalLow: 2.5,
    criticalHigh: 6.5,
    units: "mmol/L",
    confirmationStatus: "provisional",
  },
  "ELECTROLYTES:CL": {
    referenceLow: 98,
    referenceHigh: 107,
    criticalLow: 80,
    criticalHigh: 120,
    units: "mmol/L",
    confirmationStatus: "provisional",
  },
  "ELECTROLYTES:CO2": {
    referenceLow: 22,
    referenceHigh: 29,
    criticalLow: 10,
    criticalHigh: 40,
    units: "mmol/L",
    confirmationStatus: "provisional",
  },
};

export function limitsKey(
  orderedTestCode: string,
  resultComponentCode?: string | null,
): string {
  const ordered = normalizeCode(orderedTestCode);
  const component = resultComponentCode
    ? normalizeCode(resultComponentCode)
    : null;
  return component ? `${ordered}:${component}` : ordered;
}

export function getClinicalLimits(
  orderedTestCode: string,
  resultComponentCode?: string | null,
): ClinicalLimits | undefined {
  const key = limitsKey(orderedTestCode, resultComponentCode);
  return CLINICAL_LIMITS[key] ?? CLINICAL_LIMITS[normalizeCode(orderedTestCode)];
}

function instrumentFlagToCritical(raw: string | undefined): ClinicalFlag | null {
  const f = (raw ?? "").trim().toUpperCase();
  if (f === "LL" || f === "<") return "critical_low";
  if (f === "HH" || f === ">") return "critical_high";
  return null;
}

/** Classify a numeric result using reference + panic limits. */
export function computeClinicalFlag(
  numericValue: string | number,
  limits: ClinicalLimits | undefined,
  instrumentFlag?: string | null,
): ClinicalFlag {
  const fromInstrument = instrumentFlagToCritical(instrumentFlag ?? undefined);
  if (fromInstrument) return fromInstrument;

  const num =
    typeof numericValue === "number"
      ? numericValue
      : Number(String(numericValue).trim());
  if (!Number.isFinite(num)) {
    const f = (instrumentFlag ?? "").trim().toUpperCase();
    if (f === "L" || f === "BELOW") return "low";
    if (f === "H" || f === "ABOVE") return "high";
    if (f === "A" || f === "AA") return "abnormal";
    if (f === "N" || f === "NORMAL") return "normal";
    return "unknown";
  }

  if (!limits) {
    const f = (instrumentFlag ?? "").trim().toUpperCase();
    if (f === "L" || f === "BELOW") return "low";
    if (f === "H" || f === "ABOVE") return "high";
    if (f === "LL" || f === "<") return "critical_low";
    if (f === "HH" || f === ">") return "critical_high";
    if (f === "A" || f === "AA") return "abnormal";
    if (f === "N" || f === "NORMAL") return "normal";
    return "unknown";
  }

  if (limits.criticalLow != null && num <= limits.criticalLow) {
    return "critical_low";
  }
  if (limits.criticalHigh != null && num >= limits.criticalHigh) {
    return "critical_high";
  }
  if (num < limits.referenceLow) return "low";
  if (num > limits.referenceHigh) return "high";
  return "normal";
}

/** Re-evaluate a stored flag against panic limits (for display of legacy rows). */
export function resolveClinicalDisplayFlag(
  storedFlag: string | null | undefined,
  value: string | number | null | undefined,
  orderedTestCode: string,
  resultComponentCode?: string | null,
): ClinicalFlag {
  const limits = getClinicalLimits(orderedTestCode, resultComponentCode);
  const num =
    typeof value === "number"
      ? value
      : value != null && String(value).trim() !== ""
        ? Number(String(value).trim())
        : NaN;

  if (Number.isFinite(num) && limits) {
    return computeClinicalFlag(num, limits, storedFlag);
  }

  const normalized = (storedFlag ?? "unknown").trim() || "unknown";
  if (normalized !== "unknown") {
    return normalized as ClinicalFlag;
  }

  return "normal";
}
