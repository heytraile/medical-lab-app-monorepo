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
          ? "border-b-2 bg-sky-200 hover:bg-sky-300 dark:bg-sky-800/55"
          : cn(
              "hover:bg-muted/70",
              alternate ? "bg-background" : "bg-card",
            ),
        alarm && "border-l-[3px] border-l-lab-alarm",
        // Focus is the ring only, so an open block keeps its blue fill.
        selected && "ring-1 ring-inset ring-accent/25",
      )}
    >
      <td colSpan={colSpan} className="px-2 py-3.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
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
                "max-w-[18rem] truncate rounded-md px-2 py-1 text-left text-base font-bold tracking-tight underline-offset-2 transition-colors hover:underline",
                expanded
                  ? "bg-white/75 hover:bg-white dark:bg-white/10 dark:hover:bg-white/20"
                  : "bg-muted hover:bg-border",
                selected && "text-accent",
              )}
              title={`Open ${patient.displayName} in the side panel`}
            >
              {patient.displayName}
            </button>
          ) : (
            <span
              className={cn(
                "rounded-md px-2 py-1 font-mono text-sm font-bold tracking-tight",
                expanded ? "bg-white/75 dark:bg-white/10" : "bg-muted",
              )}
            >
              {summary.fallbackLabel}
            </span>
          )}

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

          <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
            {summary.latestObservedAt
              ? new Date(summary.latestObservedAt).toLocaleString()
              : "—"}
          </span>
        </div>
      </td>
    </tr>
  );
}
