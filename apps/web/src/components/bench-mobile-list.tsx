import type { Row } from "@tanstack/react-table";
import { ChevronRight } from "lucide-react";
import type { BenchResult } from "../lib/api";
import { analyzerLabel } from "../lib/analyzers";
import { cn } from "../lib/utils";
import { formatPatientName } from "../lib/patient-name";
import { NotifyAuthorizerButton } from "./notify-authorizer-button";
import { Badge } from "./ui/badge";
import type { BenchGroupSummary } from "./bench-group-row";
import {
  AlarmSign,
  FlagChip,
  WorkflowStatusChip,
  flagBarColor,
  flagLabel,
  flagValueClass,
} from "./result-status";

/**
 * The phone rendering of the bench.
 *
 * It reads the same TanStack row model as the table, so grouping, sorting,
 * filtering and expansion state are shared — only the markup differs. A table
 * cannot become cards purely in CSS without display overrides that would
 * destroy the inset gutters and the box-shadow flag bars, hence a second
 * renderer rather than a responsive stylesheet.
 */
export function BenchMobileList({
  rows,
  groupSummaries,
  selectedPatientId,
  focusedResultId,
  focusedRef,
  onSelectPatient,
  onToggleGroup,
  onJumpToFlag,
}: {
  rows: Row<BenchResult>[];
  groupSummaries: Map<string, BenchGroupSummary>;
  selectedPatientId: string | null;
  focusedResultId: string | null;
  focusedRef: React.RefObject<HTMLElement | null>;
  onSelectPatient: (id: string) => void;
  onToggleGroup: (row: Row<BenchResult>) => void;
  onJumpToFlag: (row: Row<BenchResult>, summary: BenchGroupSummary) => void;
}) {
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        if (!row.getIsGrouped()) return null;
        const summary = groupSummaries.get(String(row.groupingValue));
        if (!summary) return null;

        const open = row.getIsExpanded();
        const name = summary.patient
          ? formatPatientName(summary.patient)
          : summary.fallbackLabel;
        const selected =
          summary.patient?.id != null &&
          summary.patient.id === selectedPatientId;

        return (
          <section
            key={row.id}
            className={cn(
              "overflow-hidden rounded-xl border border-border shadow-sm transition-colors",
              open ? "bg-sky-200 dark:bg-sky-900/50" : "bg-card",
              summary.hasAlarm && "border-l-[3px] border-l-lab-alarm",
              selected && "ring-1 ring-inset ring-accent/40",
            )}
          >
            <div className="flex items-start gap-2 p-3">
              <button
                type="button"
                onClick={() => onToggleGroup(row)}
                aria-expanded={open}
                aria-label={open ? `Collapse ${name}` : `Expand ${name}`}
                className="-m-1 grid size-10 shrink-0 place-items-center rounded-md"
              >
                <ChevronRight
                  className={cn(
                    "size-5 transition-transform",
                    open && "rotate-90",
                  )}
                  strokeWidth={2.5}
                  aria-hidden
                />
              </button>

              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <AlarmSign flag={summary.worstFlag} />
                  {summary.patient ? (
                    <button
                      type="button"
                      onClick={() => onSelectPatient(summary.patient!.id)}
                      className={cn(
                        "min-w-0 truncate rounded-md px-2 py-1 text-left text-base font-bold tracking-tight",
                        open
                          ? "bg-white/75 dark:bg-sky-950/70 dark:text-foreground"
                          : "bg-muted",
                        selected && "text-accent",
                      )}
                    >
                      {name}
                    </button>
                  ) : (
                    <span className="truncate rounded-md bg-muted px-2 py-1 font-mono text-sm font-bold">
                      {name}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {summary.patient && (
                    <span className="font-mono text-[11px]">
                      {summary.patient.mrn}
                    </span>
                  )}
                  <span>
                    {summary.testCount}{" "}
                    {summary.testCount === 1 ? "test" : "tests"}
                    {summary.pendingCount > 0 &&
                      ` · ${summary.pendingCount} pending`}
                  </span>
                  {summary.patient?.status === "quarantined" && (
                    <Badge variant="danger" className="px-1 py-0 text-[10px]">
                      Quarantined
                    </Badge>
                  )}
                  {summary.worstFlag && summary.worstFlag !== "normal" && (
                    <button
                      type="button"
                      onClick={() => onJumpToFlag(row, summary)}
                      aria-label={`Show first ${flagLabel(summary.worstFlag)} result for ${name}`}
                      className="rounded-md"
                    >
                      <FlagChip flag={summary.worstFlag} />
                    </button>
                  )}
                </div>

                <NotifyAuthorizerButton
                  summary={summary}
                  fullWidth
                  className="mt-1"
                />
              </div>
            </div>

            {open && (
              <div className="space-y-2 px-3 pb-3 pl-6">
                {row.subRows.map((sub) => (
                  <ResultCard
                    key={sub.id}
                    result={sub.original}
                    focused={sub.original.id === focusedResultId}
                    focusedRef={focusedRef}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ResultCard({
  result,
  focused,
  focusedRef,
}: {
  result: BenchResult;
  focused: boolean;
  focusedRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <article
      ref={
        focused
          ? (focusedRef as React.RefObject<HTMLElement> as React.Ref<HTMLElement>)
          : undefined
      }
      className={cn(
        "rounded-lg border border-border bg-card p-3 transition-[box-shadow] duration-300",
        focused && "ring-2 ring-inset ring-accent",
      )}
      // Matches the desktop rows: the flag bar is an inset shadow so it sits
      // at the card's own edge rather than adding a border that shifts layout.
      style={{ boxShadow: `inset 3px 0 0 0 ${flagBarColor(result.flag)}` }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="pl-1 font-medium">{result.testCode}</span>
        <span
          className={cn(
            "shrink-0 text-lg font-semibold tabular-nums",
            flagValueClass(result.flag),
          )}
        >
          {result.value}
          {result.units && (
            <span className="ml-1 text-sm font-medium text-muted-foreground">
              {result.units}
            </span>
          )}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-1">
        <AlarmSign flag={result.flag} />
        <FlagChip flag={result.flag} />
        <WorkflowStatusChip status={result.status} />
      </div>

      <p className="mt-2 pl-1 text-[11px] text-muted-foreground">
        <span className="font-mono">{result.accessionNumber}</span> ·{" "}
        {analyzerLabel(result.analyzerId)}
      </p>
      <p className="pl-1 text-sm font-medium tabular-nums text-foreground/85">
        {new Date(result.observedAt).toLocaleString()}
      </p>
    </article>
  );
}
