import { resolveDisplayFlag } from "@drax-lis/contracts";
import {
  getClinicalLimits,
  resolveClinicalDisplayFlag,
} from "@drax-lis/catalog";

export type ResultFlagContext = {
  value?: string | null;
  referenceLow?: number | null;
  referenceHigh?: number | null;
  orderedTestCode?: string | null;
  resultComponentCode?: string | null;
  testCode?: string | null;
};

export type BenchFlagSource = ResultFlagContext & {
  id?: string;
  flag?: string | null;
};

function limitsContextFromRow(ctx?: ResultFlagContext): {
  orderedTestCode?: string;
  resultComponentCode?: string;
} {
  const ordered =
    ctx?.orderedTestCode?.trim() ||
    ctx?.testCode?.split(":")[0]?.trim() ||
    undefined;
  const component =
    ctx?.resultComponentCode?.trim() ||
    (ctx?.testCode?.includes(":")
      ? ctx.testCode.split(":")[1]?.trim()
      : undefined);
  return { orderedTestCode: ordered, resultComponentCode: component };
}

/** Full clinical + reference context needed to resolve a bench result flag. */
export function benchResultFlagContext(
  r: BenchFlagSource,
): ResultFlagContext & { flag?: string | null } {
  return {
    flag: r.flag,
    value: r.value,
    referenceLow: r.referenceLow,
    referenceHigh: r.referenceHigh,
    orderedTestCode: r.orderedTestCode,
    resultComponentCode: r.resultComponentCode,
    testCode: r.testCode,
  };
}

export function effectiveFlag(
  flag: string | null | undefined,
  ctx?: ResultFlagContext,
): string {
  const { orderedTestCode, resultComponentCode } = limitsContextFromRow(ctx);
  if (
    orderedTestCode &&
    getClinicalLimits(orderedTestCode, resultComponentCode)
  ) {
    return resolveClinicalDisplayFlag(
      flag,
      ctx?.value ?? undefined,
      orderedTestCode,
      resultComponentCode,
    );
  }
  return resolveDisplayFlag(
    flag,
    ctx?.value ?? undefined,
    ctx?.referenceLow,
    ctx?.referenceHigh,
  );
}

export function resolvedResultFlag(r: BenchFlagSource): string {
  const ctx = benchResultFlagContext(r);
  return effectiveFlag(ctx.flag, ctx);
}

export function isAlarmFlag(
  flag: string | null | undefined,
  ctx?: ResultFlagContext,
): boolean {
  const resolved = effectiveFlag(flag, ctx);
  return (
    resolved === "critical_high" ||
    resolved === "critical_low" ||
    resolved === "high"
  );
}

export function isCriticalFlag(
  flag: string | null | undefined,
  ctx?: ResultFlagContext,
): boolean {
  const resolved = effectiveFlag(flag, ctx);
  return resolved === "critical_high" || resolved === "critical_low";
}

export function resultHasCriticalFlag(r: BenchFlagSource): boolean {
  return isCriticalFlag(r.flag, benchResultFlagContext(r));
}

export function resultHasAlarmFlag(r: BenchFlagSource): boolean {
  return isAlarmFlag(r.flag, benchResultFlagContext(r));
}

/**
 * Orders flags worst-first so a collapsed group can advertise the most severe
 * result it is hiding. Higher wins. Keep flag knowledge in this module only.
 */
export function flagSeverity(
  flag: string | null | undefined,
  ctx?: ResultFlagContext,
): number {
  switch (effectiveFlag(flag, ctx)) {
    case "critical_high":
    case "critical_low":
      return 4;
    case "high":
      return 3;
    case "low":
    case "abnormal":
      return 2;
    case "normal":
      return 1;
    default:
      return 0;
  }
}

/** Worst flag across a set of results — what a collapsed group must surface. */
export function worstFlag(
  flags: Array<
    | string
    | null
    | undefined
    | ({ flag?: string | null | undefined } & ResultFlagContext)
  >,
): string | undefined {
  let worst: string | undefined;
  for (const entry of flags) {
    const flag =
      entry != null && typeof entry === "object"
        ? effectiveFlag(entry.flag, entry)
        : effectiveFlag(entry);
    if (worst === undefined || flagSeverity(flag) > flagSeverity(worst)) {
      worst = flag;
    }
  }
  return worst;
}

/** Collapse a group's leaf flags into the fields a parent row must show. */
export function summarizeResultFlags(results: BenchFlagSource[]): {
  worstFlag: string | undefined;
  worstResultId: string | undefined;
  hasAlarm: boolean;
  hasCritical: boolean;
} {
  let worst: string | undefined;
  let worstResultId: string | undefined;
  let worstSeverity = -1;
  for (const r of results) {
    const ctx = benchResultFlagContext(r);
    const flag = effectiveFlag(r.flag, ctx);
    const severity = flagSeverity(flag);
    if (severity > worstSeverity) {
      worstSeverity = severity;
      worst = flag;
      worstResultId = r.id;
    }
  }
  return {
    worstFlag: worst,
    worstResultId,
    hasAlarm: results.some((r) => resultHasAlarmFlag(r)),
    hasCritical: results.some((r) => resultHasCriticalFlag(r)),
  };
}
