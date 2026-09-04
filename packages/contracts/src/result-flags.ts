import type { ResultFlag } from "./schemas";

function flagFromRange(
  value?: number,
  low?: number,
  high?: number,
): ResultFlag | null {
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

/** Turn stored flags into plain clinical labels — never show "unknown" to staff. */
export function resolveDisplayFlag(
  flag: string | null | undefined,
  value?: string | number | null,
  low?: number | null,
  high?: number | null,
): ResultFlag {
  const stored = (flag ?? "unknown").trim() || "unknown";
  if (stored !== "unknown") return stored as ResultFlag;

  const num =
    typeof value === "number"
      ? value
      : value != null && String(value).trim() !== ""
        ? Number(value)
        : NaN;
  const fromRange = flagFromRange(
    Number.isFinite(num) ? num : undefined,
    low ?? undefined,
    high ?? undefined,
  );
  if (fromRange) return fromRange;

  return "normal";
}
