import { ChevronRight } from "lucide-react";
import type { BenchResult } from "../lib/api";
import { Badge } from "./ui/badge";
import {
  AlarmSign,
  FlagChip,
  flagLabel,
  isAlarmFlag,
  worstFlag,
} from "./result-status";
import { cn } from "../lib/utils";
import { formatPatientName } from "../lib/patient-name";
import { NotifyAuthorizerButton } from "./notify-authorizer-button";

export type BenchGroupSummary = {
  /** Stable group key: patient id, or `acc:<accession>` when unlinked. */
  key: string;
  patient: BenchResult["patient"];
  /** Shown instead of a name when no patient is linked to the specimen. */
  fallbackLabel: string;
  testCount: number;
  accessionCount: number;
  pendingCount: number;
  worstFlag: string | undefined;
  latestObservedAt: string | undefined;
  hasAlarm: boolean;
  /** Payload for a review request: the identifiers the cloud API can store. */
  accessionNumbers: string[];
  testCodes: string[];
};

/** Roll a group's leaf results into the counts a collapsed header must show. */
export function summarizeGroup(
  key: string,
  results: BenchResult[],
): BenchGroupSummary {
  const worst = worstFlag(results.map((r) => r.flag));
  const accessions = new Set(results.map((r) => r.accessionNumber));
  let latest: string | undefined;
  for (const r of results) {
    if (!latest || r.observedAt > latest) latest = r.observedAt;
  }
  return {
    key,
    patient: results.find((r) => r.patient)?.patient ?? null,
    fallbackLabel: results[0]?.accessionNumber ?? "Unknown specimen",
    testCount: results.length,
    accessionCount: accessions.size,
    pendingCount: results.filter(
      (r) => (r.status ?? "pending_review") === "pending_review",
    ).length,
    worstFlag: worst,
    latestObservedAt: latest,
    hasAlarm: isAlarmFlag(worst),
    accessionNumbers: [...accessions].sort(),
    testCodes: [...new Set(results.map((r) => r.testCode))].sort(),
  };
}

export function BenchGroupRow({
  summary,
  colSpan,
  expanded,
  alternate,
  selected,
  onToggle,
  onSelectPatient,
  onJumpToFlag,
}: {
  summary: BenchGroupSummary;
  colSpan: number;
  expanded: boolean;
  /** Every other patient sits a shade lighter, on top of the block gaps. */
  alternate: boolean;
  selected: boolean;
  onToggle: () => void;
  onSelectPatient: (id: string) => void;
  /** Opens the block and scrolls to its first worst-flagged result. */
  onJumpToFlag: () => void;
}) {
  const { patient } = summary;
  const alarm = summary.hasAlarm;

  return (
    <tr
      className={cn(
        // Top and bottom edges of the patient block, so it reads as one card.
        // Every tint must be opaque: a translucent one would composite over the
        // grey canvas behind the table and wash out to the same colour.
        "border-y border-border transition-colors",
        expanded
          ? "border-b-2 bg-sky-200 hover:bg-sky-300 dark:bg-sky-900/50 dark:hover:bg-sky-900/65"
          : cn(
              "hover:bg-muted/70 dark:hover:bg-muted",
              alternate ? "bg-background" : "bg-card",
            ),
        alarm && "border-l-[3px] border-l-lab-alarm",
        // Focus is the ring only, so an open block keeps its blue fill.
        selected && "ring-1 ring-inset ring-accent/25",
      )}
    >
      {/* The name occupies the Patient column proper; everything else spans
          the remaining columns. Splitting the row this way is what puts the
          name under its own sortable header instead of in a full-width bar. */}
      {/* Capped so a long name cannot push Value and Observed out of view, but
          also floored: with auto table layout the other columns would
          otherwise squeeze the name down to a few characters. */}
      <td className="w-[14rem] min-w-[14rem] max-w-[14rem] px-2 py-3.5">
        <div className="flex items-center gap-x-1.5">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={
              expanded
                ? `Collapse ${patient?.displayName ?? summary.fallbackLabel}`
                : `Expand ${patient?.displayName ?? summary.fallbackLabel}`
            }
            className="-my-1 shrink-0 rounded p-1 transition-colors hover:bg-muted"
          >
            <ChevronRight
              className={cn(
                "size-5 transition-transform",
                expanded && "rotate-90",
              )}
              strokeWidth={2.5}
              aria-hidden
            />
          </button>

          <AlarmSign flag={summary.worstFlag} />

          {patient ? (
            <button
              type="button"
              onClick={() => onSelectPatient(patient.id)}
              // Deliberately a step up from the 14px leaf rows: this is the
              // row you scan for, the tests underneath are detail. The pill
              // shifts to white on open blocks, where grey would go muddy
              // against the blue header.
              className={cn(
                "min-w-0 truncate rounded-md px-2 py-1 text-left text-base font-bold tracking-tight underline-offset-2 transition-colors hover:underline",
                expanded
                  ? "bg-white/75 hover:bg-white dark:bg-sky-950/70 dark:hover:bg-sky-950/90 dark:hover:text-foreground"
                  : "bg-muted hover:bg-border dark:hover:bg-muted/80",
                selected && "text-accent",
              )}
              title={`Open ${patient.displayName} in the side panel`}
            >
              {formatPatientName(patient)}
            </button>
          ) : (
            <span
              className={cn(
                "min-w-0 truncate rounded-md px-2 py-1 font-mono text-sm font-bold tracking-tight",
                expanded
                  ? "bg-white/75 dark:bg-sky-950/70 dark:text-foreground"
                  : "bg-muted",
              )}
              title={summary.fallbackLabel}
            >
              {summary.fallbackLabel}
            </span>
          )}
        </div>
      </td>

      <td colSpan={colSpan - 1} className="px-2 py-3.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {patient ? (
            <span className="font-mono text-[11px] tracking-tight text-muted-foreground">
              {patient.mrn}
            </span>
          ) : (
            <Badge variant="muted" className="px-1 py-0 text-[10px]">
              No patient linked
            </Badge>
          )}

          {patient?.identityOrigin === "local_provisional" && (
            <Badge variant="warn" className="px-1 py-0 text-[10px]">
              Provisional
            </Badge>
          )}
          {patient?.status === "quarantined" && (
            <Badge variant="danger" className="px-1 py-0 text-[10px]">
              Quarantined
            </Badge>
          )}

          <span className="text-xs text-muted-foreground">
            {summary.testCount} {summary.testCount === 1 ? "test" : "tests"}
            {summary.accessionCount > 1 &&
              ` · ${summary.accessionCount} accessions`}
            {summary.pendingCount > 0 && ` · ${summary.pendingCount} pending`}
          </span>

          {/* A collapsed group must never hide an abnormal result. Clicking
              the chip opens the block and jumps to the first such result. */}
          {summary.worstFlag && summary.worstFlag !== "normal" && (
            <button
              type="button"
              onClick={onJumpToFlag}
              aria-label={`Show first ${flagLabel(summary.worstFlag)} result for ${
                patient?.displayName ?? summary.fallbackLabel
              }`}
              className="rounded-md transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <FlagChip flag={summary.worstFlag} />
            </button>
          )}

          <div className="ml-auto flex items-center gap-3">
            <NotifyAuthorizerButton summary={summary} />
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {summary.latestObservedAt
                ? new Date(summary.latestObservedAt).toLocaleString()
                : "—"}
            </span>
          </div>
        </div>
      </td>
    </tr>
  );
}
