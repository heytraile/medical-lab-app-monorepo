import type { MouseEvent } from "react";
import type { Row } from "@tanstack/react-table";
import { ChevronRight } from "lucide-react";
import type { BenchResult } from "../lib/api";
import { analyzerLabel } from "../lib/analyzers";
import { cn } from "../lib/utils";
import { usePatientNameOrder } from "../lib/patient-name-order";
import { NotifyAuthorizerButton } from "./notify-authorizer-button";
import { SubmitForReleaseButton } from "./submit-for-release-button";
import { RecallFromReleaseButton } from "./recall-from-release-button";
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
  const { formatName } = usePatientNameOrder();

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        if (!row.getIsGrouped()) return null;
        const summary = groupSummaries.get(String(row.groupingValue));
        if (!summary) return null;

        const open = row.getIsExpanded();
        const name = summary.patient
          ? formatName(summary.patient)
          : summary.fallbackLabel;
        const selected =
          summary.patient?.id != null &&
          summary.patient.id === selectedPatientId;

        const patientId = summary.patient?.id;

        function stopCardSelect(e: MouseEvent) {
          e.stopPropagation();
        }

        function openPatient() {
          if (patientId) onSelectPatient(patientId);
        }

        return (
          <section
            key={row.id}
            className={cn(
              "overflow-hidden rounded-xl border border-border shadow-sm transition-colors",
              open
                ? "bg-sky-200 dark:bg-sky-900/50"
                : "bg-card hover:bg-lab-ok/10 dark:hover:bg-lab-ok/20",
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

              <div
                className={cn(
                  "min-w-0 flex-1 space-y-1.5",
                  patientId && "cursor-pointer",
                )}
                onClick={patientId ? openPatient : undefined}
                onKeyDown={
                  patientId
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openPatient();
                        }
                      }
                    : undefined
                }
                tabIndex={patientId ? 0 : undefined}
                role={patientId ? "button" : undefined}
                aria-label={
                  patientId ? `Open ${name} in patient panel` : undefined
                }
              >
                <div className="flex items-center gap-2">
                  <AlarmSign flag={summary.worstFlag} />
                  {summary.patient ? (
                    <span
                      className={cn(
                        "rounded-md px-2 py-1 text-left text-base font-bold leading-snug tracking-tight whitespace-nowrap",
                        open
                          ? "bg-white/75 dark:bg-sky-950/70 dark:text-foreground"
                          : "bg-muted",
                        selected && "text-accent",
                      )}
                    >
                      {name}
                    </span>
                  ) : (
                    <span className="rounded-md bg-muted px-2 py-1 font-mono text-sm font-bold leading-snug whitespace-nowrap">
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
                  {summary.missingExpectedCount > 0 && (
                    <Badge variant="warn" className="px-1 py-0 text-[10px]">
                      {summary.missingExpectedCount} manual pending
                    </Badge>
                  )}
                  {summary.worstFlag && summary.worstFlag !== "normal" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        stopCardSelect(e);
                        onJumpToFlag(row, summary);
                      }}
                      aria-label={`Show first ${flagLabel(summary.worstFlag)} result for ${name}`}
                      className="rounded-md"
                    >
                      <FlagChip flag={summary.worstFlag} />
                    </button>
                  )}
                  {summary.allReleased ? (
                    <WorkflowStatusChip status="released" />
                  ) : summary.submittedCount > 0 && summary.pendingCount === 0 ? (
                    <WorkflowStatusChip status="pending_authorization" />
                  ) : null}
                </div>

                <div
                  className="flex flex-col gap-2"
                  onClick={stopCardSelect}
                  onKeyDown={(e) => e.stopPropagation()}
                  role="presentation"
                >
                  <SubmitForReleaseButton summary={summary} fullWidth />
                  <RecallFromReleaseButton summary={summary} fullWidth />
                  <NotifyAuthorizerButton
                    summary={summary}
                    fullWidth
                    className="mt-0"
                  />
                </div>
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
  const ctx = {
    value: result.value,
    referenceLow: result.referenceLow,
    referenceHigh: result.referenceHigh,
  };

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
      style={{ boxShadow: `inset 3px 0 0 0 ${flagBarColor(result.flag, ctx)}` }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="pl-1 font-medium">
          {result.testName?.trim() || result.testCode}
        </span>
        <span
          className={cn(
            "shrink-0 text-lg font-semibold tabular-nums",
            flagValueClass(result.flag, ctx),
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
        {result.expectedOnOrder === false ? (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
            Not ordered
          </span>
        ) : null}
        <AlarmSign flag={result.flag} ctx={ctx} />
        <FlagChip
          flag={result.flag}
          value={result.value}
          referenceLow={result.referenceLow}
          referenceHigh={result.referenceHigh}
        />
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
